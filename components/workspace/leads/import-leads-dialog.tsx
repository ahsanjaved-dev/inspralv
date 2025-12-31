"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import { useParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import Papa from "papaparse"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  AlertCircle,
  Download,
  ArrowRight,
  ArrowLeft,
  FileUp,
  X,
} from "lucide-react"
import { toast } from "sonner"

interface ImportLeadsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = "upload" | "mapping" | "preview" | "importing" | "results"

interface ParsedData {
  headers: string[]
  rows: Record<string, string>[]
}

interface ColumnMapping {
  first_name: string
  last_name: string
  email: string
  phone: string
  company: string
  job_title: string
  notes: string
}

interface ImportResults {
  total: number
  imported: number
  skipped: number
  failed: number
  errors: { row: number; error: string }[]
  duplicates: { row: number; field: string; value: string }[]
}

const LEAD_FIELDS = [
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "job_title", label: "Job Title" },
  { key: "notes", label: "Notes" },
] as const

const DEFAULT_MAPPING: ColumnMapping = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  company: "",
  job_title: "",
  notes: "",
}

const STEPS: Step[] = ["upload", "mapping", "preview", "importing", "results"]

// Auto-detect column mappings based on header names
function autoDetectMappings(headers: string[]): ColumnMapping {
  const mapping = { ...DEFAULT_MAPPING }
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim())

  const mappingPatterns: Record<keyof ColumnMapping, string[]> = {
    first_name: ["first name", "firstname", "first_name", "given name", "name"],
    last_name: ["last name", "lastname", "last_name", "surname", "family name"],
    email: ["email", "e-mail", "email address", "mail"],
    phone: ["phone", "telephone", "mobile", "cell", "phone number", "tel"],
    company: ["company", "organization", "organisation", "business", "employer"],
    job_title: ["job title", "title", "position", "role", "job"],
    notes: ["notes", "note", "comments", "description"],
  }

  for (const [field, patterns] of Object.entries(mappingPatterns)) {
    for (const pattern of patterns) {
      const index = lowerHeaders.findIndex((h) => h.includes(pattern))
      if (index !== -1) {
        const header = headers[index]
        if (header) {
          mapping[field as keyof ColumnMapping] = header
        }
        break
      }
    }
  }

  return mapping
}

export function ImportLeadsDialog({ open, onOpenChange }: ImportLeadsDialogProps) {
  const { workspaceSlug } = useParams()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>("upload")
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>(DEFAULT_MAPPING)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [duplicateCheckField, setDuplicateCheckField] = useState<"email" | "phone" | "both">("email")
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResults, setImportResults] = useState<ImportResults | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const currentStepIndex = STEPS.indexOf(step)

  const resetState = useCallback(() => {
    setStep("upload")
    setFile(null)
    setParsedData(null)
    setColumnMapping(DEFAULT_MAPPING)
    setSkipDuplicates(true)
    setDuplicateCheckField("email")
    setIsImporting(false)
    setImportProgress(0)
    setImportResults(null)
    setIsDragOver(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [])

  const handleClose = useCallback(() => {
    resetState()
    onOpenChange(false)
  }, [resetState, onOpenChange])

  const parseFile = useCallback((selectedFile: File) => {
    // Validate file type
    const validTypes = ["text/csv", "text/plain", "application/vnd.ms-excel"]
    const isValidExt = selectedFile.name.endsWith(".csv") || selectedFile.name.endsWith(".txt")
    
    if (!validTypes.includes(selectedFile.type) && !isValidExt) {
      toast.error("Please upload a CSV file")
      return
    }

    setFile(selectedFile)

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        const headers = results.meta.fields || []
        const rows = results.data as Record<string, string>[]

        if (rows.length === 0) {
          toast.error("The file appears to be empty")
          setFile(null)
          return
        }

        if (rows.length > 1000) {
          toast.error("Maximum 1000 leads per import. Please split your file.")
          setFile(null)
          return
        }

        setParsedData({ headers, rows })
        setColumnMapping(autoDetectMappings(headers))
        setStep("mapping")
      },
      error: (error: any) => {
        console.error("Parse error:", error)
        toast.error("Failed to parse file. Please check the format.")
        setFile(null)
      },
    })
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      parseFile(selectedFile)
    }
  }, [parseFile])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      parseFile(droppedFile)
    }
  }, [parseFile])

  const handleMappingChange = useCallback((field: keyof ColumnMapping, value: string) => {
    setColumnMapping((prev) => ({
      ...prev,
      [field]: value === "__none__" ? "" : value,
    }))
  }, [])

  const getMappedLeads = useMemo(() => {
    if (!parsedData) return []

    return parsedData.rows.map((row) => ({
      first_name: columnMapping.first_name ? row[columnMapping.first_name] || null : null,
      last_name: columnMapping.last_name ? row[columnMapping.last_name] || null : null,
      email: columnMapping.email ? row[columnMapping.email] || null : null,
      phone: columnMapping.phone ? row[columnMapping.phone] || null : null,
      company: columnMapping.company ? row[columnMapping.company] || null : null,
      job_title: columnMapping.job_title ? row[columnMapping.job_title] || null : null,
      notes: columnMapping.notes ? row[columnMapping.notes] || null : null,
    }))
  }, [parsedData, columnMapping])

  const handleImport = useCallback(async () => {
    setStep("importing")
    setIsImporting(true)
    setImportProgress(10)

    try {
      setImportProgress(30)

      const response = await fetch(`/api/w/${workspaceSlug}/leads/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: getMappedLeads,
          skipDuplicates,
          duplicateCheckField,
        }),
      })

      setImportProgress(80)

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Import failed")
      }

      setImportProgress(100)
      setImportResults(data.data.results)
      setStep("results")

      // Invalidate leads query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["workspace-leads", workspaceSlug] })

      if (data.data.results.imported > 0) {
        toast.success(`Successfully imported ${data.data.results.imported} leads`)
      }
    } catch (error) {
      console.error("Import error:", error)
      toast.error(error instanceof Error ? error.message : "Import failed")
      setStep("preview")
    } finally {
      setIsImporting(false)
    }
  }, [workspaceSlug, getMappedLeads, skipDuplicates, duplicateCheckField, queryClient])

  const downloadTemplate = useCallback(() => {
    const template = "First Name,Last Name,Email,Phone,Company,Job Title,Notes\nJohn,Doe,john@example.com,+1234567890,Acme Inc,CEO,Sample note"
    const blob = new Blob([template], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "leads_import_template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const removeFile = useCallback(() => {
    setFile(null)
    setParsedData(null)
    setColumnMapping(DEFAULT_MAPPING)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [])

  // Step indicator component
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-1.5 py-2">
      {STEPS.slice(0, 4).map((s, i) => (
        <div
          key={s}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i <= currentStepIndex
              ? "bg-primary w-6"
              : "bg-muted w-1.5"
          )}
        />
      ))}
    </div>
  )

  const renderUploadStep = () => (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-4 sm:p-6 text-center transition-all duration-200",
          isDragOver
            ? "border-primary bg-primary/5 scale-[1.02]"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileChange}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer flex flex-col items-center gap-3"
        >
          <div className={cn(
            "p-3 rounded-full transition-colors",
            isDragOver ? "bg-primary/20" : "bg-primary/10"
          )}>
            <FileUp className={cn(
              "h-6 w-6 sm:h-8 sm:w-8 transition-colors",
              isDragOver ? "text-primary" : "text-primary/80"
            )} />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-sm sm:text-base">
              {isDragOver ? "Drop your file here" : "Click to upload or drag & drop"}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              CSV file • Max 1000 leads
            </p>
          </div>
        </label>
      </div>

      {/* Template download */}
      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={downloadTemplate} className="text-xs">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Download Template
        </Button>
      </div>

      {/* Info */}
      <div className="bg-muted/40 rounded-lg p-3 text-xs sm:text-sm">
        <p className="font-medium mb-1.5">Supported columns:</p>
        <p className="text-muted-foreground leading-relaxed">
          First Name, Last Name, Email, Phone, Company, Job Title, Notes
        </p>
      </div>
    </div>
  )

  const renderMappingStep = () => (
    <div className="space-y-3">
      {/* File info */}
      <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2 min-w-0">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{file?.name}</p>
            <p className="text-xs text-muted-foreground">
              {parsedData?.rows.length} leads
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={removeFile}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Column mappings - scrollable */}
      <ScrollArea className="h-[140px] sm:h-[180px]">
        <div className="space-y-2 pr-3">
          <Label className="text-xs text-muted-foreground">Map columns</Label>
          {LEAD_FIELDS.map((field) => (
            <div key={field.key} className="flex items-center gap-2">
              <Label className="text-xs sm:text-sm w-20 sm:w-24 shrink-0 truncate">
                {field.label}
              </Label>
              <Select
                value={columnMapping[field.key] || "__none__"}
                onValueChange={(v) => handleMappingChange(field.key, v)}
              >
                <SelectTrigger className="h-8 text-xs sm:text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- Skip --</SelectItem>
                  {parsedData?.headers.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Duplicate settings */}
      <div className="border-t pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Skip duplicates</Label>
            <p className="text-xs text-muted-foreground">Avoid duplicate entries</p>
          </div>
          <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
        </div>

        {skipDuplicates && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">Check by:</Label>
            <Select
              value={duplicateCheckField}
              onValueChange={(v) => setDuplicateCheckField(v as "email" | "phone" | "both")}
            >
              <SelectTrigger className="h-8 text-xs sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="both">Email or Phone</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  )

  const renderPreviewStep = () => {
    const previewLeads = getMappedLeads.slice(0, 5)

    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Preview (5 of {parsedData?.rows.length})
        </p>

        <ScrollArea className="h-[160px] sm:h-[200px] border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="h-8 px-2">Name</TableHead>
                <TableHead className="h-8 px-2">Email</TableHead>
                <TableHead className="h-8 px-2 hidden sm:table-cell">Phone</TableHead>
                <TableHead className="h-8 px-2 hidden md:table-cell">Company</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewLeads.map((lead, index) => (
                <TableRow key={index} className="text-xs">
                  <TableCell className="py-2 px-2">
                    {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell className="py-2 px-2 truncate max-w-[120px]">
                    {lead.email || "—"}
                  </TableCell>
                  <TableCell className="py-2 px-2 hidden sm:table-cell">
                    {lead.phone || "—"}
                  </TableCell>
                  <TableCell className="py-2 px-2 hidden md:table-cell">
                    {lead.company || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
          <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-200">
            <strong>Ready:</strong> {parsedData?.rows.length} leads
            {skipDuplicates && ` • Skip duplicates by ${duplicateCheckField}`}
          </p>
        </div>
      </div>
    )
  }

  const renderImportingStep = () => (
    <div className="flex flex-col items-center justify-center py-8 sm:py-12 space-y-4">
      <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-primary" />
      <div className="text-center">
        <p className="font-medium text-sm sm:text-base">Importing leads...</p>
        <p className="text-xs sm:text-sm text-muted-foreground">Please wait</p>
      </div>
      <Progress value={importProgress} className="h-1.5 w-48" />
    </div>
  )

  const renderResultsStep = () => {
    if (!importResults) return null

    const hasIssues = importResults.duplicates.length > 0 || importResults.errors.length > 0

    return (
      <div className="space-y-4">
        {/* Status icon */}
        <div className="flex justify-center py-3">
          {importResults.imported > 0 ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <p className="font-medium text-sm">Import Complete</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                <AlertCircle className="h-6 w-6 text-amber-600" />
              </div>
              <p className="font-medium text-sm">Completed with Issues</p>
            </div>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <p className="text-lg sm:text-xl font-bold">{importResults.total}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Total</p>
          </div>
          <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-lg sm:text-xl font-bold text-green-600">{importResults.imported}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Imported</p>
          </div>
          <div className="text-center p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <p className="text-lg sm:text-xl font-bold text-amber-600">{importResults.skipped}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Skipped</p>
          </div>
          <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-lg sm:text-xl font-bold text-red-600">{importResults.failed}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Failed</p>
          </div>
        </div>

        {/* Issues list - scrollable */}
        {hasIssues && (
          <ScrollArea className="h-[80px] sm:h-[100px]">
            <div className="space-y-2 pr-2">
              {importResults.duplicates.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-amber-600 mb-1">
                    Duplicates ({importResults.duplicates.length})
                  </p>
                  {importResults.duplicates.slice(0, 5).map((dup, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground truncate">
                      Row {dup.row}: {dup.field} &quot;{dup.value}&quot;
                    </p>
                  ))}
                  {importResults.duplicates.length > 5 && (
                    <p className="text-[10px] text-muted-foreground">
                      +{importResults.duplicates.length - 5} more
                    </p>
                  )}
                </div>
              )}

              {importResults.errors.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-600 mb-1">
                    Errors ({importResults.errors.length})
                  </p>
                  {importResults.errors.slice(0, 5).map((err, i) => (
                    <p key={i} className="text-[10px] text-red-600 truncate">
                      Row {err.row}: {err.error}
                    </p>
                  ))}
                  {importResults.errors.length > 5 && (
                    <p className="text-[10px] text-red-600">
                      +{importResults.errors.length - 5} more
                    </p>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    )
  }

  const getStepTitle = () => {
    switch (step) {
      case "upload": return "Import Leads"
      case "mapping": return "Map Columns"
      case "preview": return "Preview"
      case "importing": return "Importing..."
      case "results": return "Results"
    }
  }

  const getStepDescription = () => {
    switch (step) {
      case "upload": return "Upload a CSV file to import leads"
      case "mapping": return "Match columns to lead fields"
      case "preview": return "Review before importing"
      case "importing": return "Processing your leads"
      case "results": return "Import summary"
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header - fixed */}
        <DialogHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileSpreadsheet className="h-4 w-4 sm:h-5 sm:w-5" />
            {getStepTitle()}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {getStepDescription()}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        {step !== "importing" && <StepIndicator />}

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 min-h-0">
          {step === "upload" && renderUploadStep()}
          {step === "mapping" && renderMappingStep()}
          {step === "preview" && renderPreviewStep()}
          {step === "importing" && renderImportingStep()}
          {step === "results" && renderResultsStep()}
        </div>

        {/* Footer - fixed */}
        <DialogFooter className="px-4 py-3 sm:px-6 sm:py-4 border-t shrink-0 gap-2 sm:gap-0">
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose} size="sm">
              Cancel
            </Button>
          )}

          {step === "mapping" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Back
              </Button>
              <Button size="sm" onClick={() => setStep("preview")}>
                Preview
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </>
          )}

          {step === "preview" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep("mapping")}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Back
              </Button>
              <Button size="sm" onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5 mr-1" />
                    Import {parsedData?.rows.length}
                  </>
                )}
              </Button>
            </>
          )}

          {step === "results" && (
            <>
              <Button variant="outline" size="sm" onClick={resetState}>
                Import More
              </Button>
              <Button size="sm" onClick={handleClose}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
