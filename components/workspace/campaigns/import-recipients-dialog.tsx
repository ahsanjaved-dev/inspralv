"use client"

import { useState, useCallback, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useImportRecipients } from "@/lib/hooks/use-campaigns"
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  AlertTriangle,
  Info,
} from "lucide-react"
import { toast } from "sonner"
import type { CreateRecipientInput } from "@/types/database.types"

interface ImportRecipientsDialogProps {
  campaignId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ParsedRecipient extends CreateRecipientInput {
  _row?: number
  _error?: string
}

interface FieldStats {
  fieldName: string
  displayName: string
  total: number
  filled: number
  missing: number
  completeness: number
}

interface DataQualityReport {
  totalRecords: number
  fieldStats: FieldStats[]
  recordsWithMissingData: number
  overallCompleteness: number
}

export function ImportRecipientsDialog({
  campaignId,
  open,
  onOpenChange,
}: ImportRecipientsDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedRecipient[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "complete">("upload")
  const [importResult, setImportResult] = useState<{ imported: number; duplicates: number } | null>(
    null
  )

  const importMutation = useImportRecipients()

  const resetState = () => {
    setFile(null)
    setParsedData([])
    setParseError(null)
    setStep("upload")
    setImportResult(null)
  }

  const handleClose = () => {
    resetState()
    onOpenChange(false)
  }

  // Analyze data quality
  const dataQualityReport = useMemo((): DataQualityReport | null => {
    if (parsedData.length === 0) return null

    const fields = [
      { fieldName: "phone_number", displayName: "Phone" },
      { fieldName: "first_name", displayName: "First Name" },
      { fieldName: "last_name", displayName: "Last Name" },
      { fieldName: "email", displayName: "Email" },
      { fieldName: "company", displayName: "Company" },
    ]

    const fieldStats: FieldStats[] = fields.map((field) => {
      const filled = parsedData.filter((r) => {
        const value = r[field.fieldName as keyof ParsedRecipient]
        return value !== null && value !== undefined && String(value).trim() !== ""
      }).length
      const missing = parsedData.length - filled
      const completeness = (filled / parsedData.length) * 100

      return {
        fieldName: field.fieldName,
        displayName: field.displayName,
        total: parsedData.length,
        filled,
        missing,
        completeness,
      }
    })

    const recordsWithMissingData = parsedData.filter((r) => {
      return !r.first_name?.trim() || !r.last_name?.trim() || !r.email?.trim() || !r.company?.trim()
    }).length

    const optionalFields = fieldStats.filter((f) => f.fieldName !== "phone_number")
    const overallCompleteness =
      optionalFields.reduce((sum, f) => sum + f.completeness, 0) / optionalFields.length

    return {
      totalRecords: parsedData.length,
      fieldStats,
      recordsWithMissingData,
      overallCompleteness,
    }
  }, [parsedData])

  const parseCSV = useCallback((text: string): ParsedRecipient[] => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim())
    if (lines.length < 2) {
      throw new Error("CSV must have a header row and at least one data row")
    }

    const headerLine = lines[0]!
    const header = headerLine.split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""))
    const phoneIndex = header.findIndex(
      (h) => h === "phone_number" || h === "phone" || h === "phonenumber" || h === "mobile"
    )

    if (phoneIndex === -1) {
      throw new Error("CSV must have a 'phone_number' or 'phone' column")
    }

    const firstNameIndex = header.findIndex(
      (h) => h === "first_name" || h === "firstname" || h === "first"
    )
    const lastNameIndex = header.findIndex(
      (h) => h === "last_name" || h === "lastname" || h === "last"
    )
    const emailIndex = header.findIndex((h) => h === "email")
    const companyIndex = header.findIndex((h) => h === "company")

    const recipients: ParsedRecipient[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      const values = parseCSVLine(line)
      const phone = values[phoneIndex]?.trim()

      if (!phone) continue

      const recipient: ParsedRecipient = {
        phone_number: phone,
        first_name: firstNameIndex >= 0 ? values[firstNameIndex]?.trim() || null : null,
        last_name: lastNameIndex >= 0 ? values[lastNameIndex]?.trim() || null : null,
        email: emailIndex >= 0 ? values[emailIndex]?.trim() || null : null,
        company: companyIndex >= 0 ? values[companyIndex]?.trim() || null : null,
        custom_variables: {},
        _row: i + 1,
      }

      header.forEach((col, idx) => {
        if (
          idx !== phoneIndex &&
          idx !== firstNameIndex &&
          idx !== lastNameIndex &&
          idx !== emailIndex &&
          idx !== companyIndex &&
          values[idx]?.trim()
        ) {
          recipient.custom_variables![col] = values[idx].trim()
        }
      })

      recipients.push(recipient)
    }

    return recipients
  }, [])

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === "," && !inQuotes) {
        result.push(current.replace(/^"|"$/g, ""))
        current = ""
      } else {
        current += char
      }
    }
    result.push(current.replace(/^"|"$/g, ""))

    return result
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith(".csv")) {
      setParseError("Please upload a CSV file")
      return
    }

    setFile(selectedFile)
    setParseError(null)

    try {
      const text = await selectedFile.text()
      const parsed = parseCSV(text)

      if (parsed.length === 0) {
        throw new Error("No valid recipients found in the file")
      }

      if (parsed.length > 10000) {
        throw new Error("Maximum 10,000 recipients per import")
      }

      setParsedData(parsed)
      setStep("preview")
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Failed to parse CSV")
      setFile(null)
    }
  }

  const handleImport = async () => {
    if (parsedData.length === 0) return

    setStep("importing")

    try {
      const recipients = parsedData.map(({ _row, _error, ...rest }) => rest)

      const result = await importMutation.mutateAsync({
        campaignId,
        recipients,
      })

      setImportResult({
        imported: result.imported,
        duplicates: result.duplicates,
      })
      setStep("complete")
      toast.success(`Imported ${result.imported} recipients`)
    } catch (error) {
      setStep("preview")
      toast.error(error instanceof Error ? error.message : "Failed to import recipients")
    }
  }

  const downloadTemplate = () => {
    const template =
      "phone_number,first_name,last_name,email,company\n+14155551234,John,Doe,john@example.com,Acme Inc\n+14155555678,Jane,Smith,jane@example.com,Tech Corp"
    const blob = new Blob([template], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "recipients_template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const getCompletenessColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-600 dark:text-green-400"
    if (percentage >= 50) return "text-yellow-600 dark:text-yellow-400"
    return "text-red-600 dark:text-red-400"
  }

  const isFieldEmpty = (value: any) => {
    return value === null || value === undefined || String(value).trim() === ""
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Recipients
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file with phone numbers to add to this campaign.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById("csv-upload")?.click()}
            >
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <p className="font-medium">Click to upload or drag and drop</p>
              <p className="text-sm text-muted-foreground mt-1">CSV file up to 10,000 rows</p>
            </div>

            {parseError && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="text-sm">{parseError}</p>
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">Required columns:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>
                  • <code className="bg-muted px-1 rounded">phone_number</code> or{" "}
                  <code className="bg-muted px-1 rounded">phone</code> (required)
                </li>
                <li>
                  • <code className="bg-muted px-1 rounded">first_name</code>,{" "}
                  <code className="bg-muted px-1 rounded">last_name</code> (optional)
                </li>
                <li>
                  • <code className="bg-muted px-1 rounded">email</code>,{" "}
                  <code className="bg-muted px-1 rounded">company</code> (optional)
                </li>
                <li>• Any additional columns will be saved as custom variables</li>
              </ul>
              <Button variant="link" size="sm" className="px-0 mt-2" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1" />
                Download template
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && dataQualityReport && (
          <div className="space-y-4">
            {/* Success Banner */}
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 rounded-lg">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p className="text-sm">
                Found <strong>{parsedData.length}</strong> valid recipients in {file?.name}
              </p>
            </div>

            {/* Data Quality Summary - Simple Version */}
            {dataQualityReport.recordsWithMissingData > 0 && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <h4 className="font-medium text-sm mb-1">Data Quality Report</h4>
                      <p className="text-sm text-muted-foreground">
                        {dataQualityReport.recordsWithMissingData} of{" "}
                        {dataQualityReport.totalRecords} recipients (
                        {Math.round(
                          (dataQualityReport.recordsWithMissingData /
                            dataQualityReport.totalRecords) *
                            100
                        )}
                        %) have incomplete information
                      </p>
                    </div>

                    {/* Field Completeness Stats - Simplified */}
                    <div className="grid grid-cols-2 gap-3">
                      {dataQualityReport.fieldStats
                        .filter((f) => f.fieldName !== "phone_number")
                        .map((field) => (
                          <div
                            key={field.fieldName}
                            className="flex items-center justify-between p-2 bg-background rounded border"
                          >
                            <span className="text-xs font-medium">{field.displayName}</span>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-bold ${getCompletenessColor(field.completeness)}`}
                              >
                                {Math.round(field.completeness)}%
                              </span>
                              {field.missing > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {field.missing} missing
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* Warning for low completeness */}
                    {dataQualityReport.overallCompleteness < 70 && (
                      <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded text-yellow-800 dark:text-yellow-300">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <p className="text-xs">
                          Low data completeness may limit personalization options in your campaign.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Preview Table */}
            <div className="border rounded-lg max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium">#</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Phone</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">First Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Last Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Email</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Company</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedData.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-t hover:bg-muted/50">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r._row}</td>
                      <td className="px-3 py-2 font-mono">{r.phone_number}</td>
                      <td
                        className={`px-3 py-2 ${isFieldEmpty(r.first_name) ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}`}
                      >
                        {r.first_name || (
                          <span className="text-muted-foreground italic text-xs">Missing</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 ${isFieldEmpty(r.last_name) ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}`}
                      >
                        {r.last_name || (
                          <span className="text-muted-foreground italic text-xs">Missing</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 ${isFieldEmpty(r.email) ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}`}
                      >
                        {r.email || (
                          <span className="text-muted-foreground italic text-xs">Missing</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 ${isFieldEmpty(r.company) ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}`}
                      >
                        {r.company || (
                          <span className="text-muted-foreground italic text-xs">Missing</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedData.length > 100 && (
                <p className="text-center text-sm text-muted-foreground py-2 bg-muted">
                  ...and {parsedData.length - 100} more
                </p>
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded"></div>
                <span>Missing data</span>
              </div>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="font-medium">Importing recipients...</p>
            <p className="text-sm text-muted-foreground">This may take a moment</p>
          </div>
        )}

        {step === "complete" && importResult && (
          <div className="flex flex-col items-center py-8">
            <div className="p-3 bg-green-100 dark:bg-green-900 rounded-full mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <p className="font-medium text-lg">Import Complete!</p>
            <p className="text-muted-foreground mt-1">
              {importResult.imported} recipients imported
              {importResult.duplicates > 0 && ` (${importResult.duplicates} duplicates skipped)`}
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={resetState}>
                Choose Different File
              </Button>
              <Button onClick={handleImport}>
                <Upload className="h-4 w-4 mr-2" />
                Import {parsedData.length} Recipients
              </Button>
            </>
          )}
          {step === "complete" && <Button onClick={handleClose}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
