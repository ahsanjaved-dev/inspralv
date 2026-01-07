"use client"

import { useState, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  Info,
  AlertTriangle,
} from "lucide-react"
import type { CreateRecipientInput } from "@/types/database.types"
import type { WizardFormData } from "../campaign-wizard"

interface StepImportProps {
  formData: WizardFormData
  updateMultipleFields: (updates: Partial<WizardFormData>) => void
  errors: Record<string, string>
}

// Standard field mappings
const STANDARD_FIELDS = [
  { key: "phone_number", label: "Phone Number", required: true },
  { key: "first_name", label: "First Name", required: false },
  { key: "last_name", label: "Last Name", required: false },
  { key: "email", label: "Email", required: false },
  { key: "company", label: "Company", required: false },
  { key: "custom", label: "Custom Variable", required: false },
  { key: "skip", label: "Skip Column", required: false },
] as const

type FieldKey = (typeof STANDARD_FIELDS)[number]["key"]

interface ColumnMapping {
  csvColumn: string
  mappedTo: FieldKey
  customVariableName?: string
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

export function StepImport({ formData, updateMultipleFields, errors }: StepImportProps) {
  const [file, setFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<string[][]>([])
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [step, setStep] = useState<"upload" | "mapping" | "preview">(
    formData.recipients.length > 0 ? "preview" : "upload"
  )

  // Analyze data quality
  const dataQualityReport = useMemo((): DataQualityReport | null => {
    if (formData.recipients.length === 0) return null

    const fields = [
      { fieldName: "phone_number", displayName: "Phone" },
      { fieldName: "first_name", displayName: "First Name" },
      { fieldName: "last_name", displayName: "Last Name" },
      { fieldName: "email", displayName: "Email" },
      { fieldName: "company", displayName: "Company" },
    ]

    const fieldStats: FieldStats[] = fields.map((field) => {
      const filled = formData.recipients.filter((r) => {
        const value = r[field.fieldName as keyof CreateRecipientInput]
        return value !== null && value !== undefined && String(value).trim() !== ""
      }).length
      const missing = formData.recipients.length - filled
      const completeness = (filled / formData.recipients.length) * 100

      return {
        fieldName: field.fieldName,
        displayName: field.displayName,
        total: formData.recipients.length,
        filled,
        missing,
        completeness,
      }
    })

    const recordsWithMissingData = formData.recipients.filter((r) => {
      return !r.first_name?.trim() || !r.last_name?.trim() || !r.email?.trim() || !r.company?.trim()
    }).length

    const optionalFields = fieldStats.filter((f) => f.fieldName !== "phone_number")
    const overallCompleteness =
      optionalFields.reduce((sum, f) => sum + f.completeness, 0) / optionalFields.length

    return {
      totalRecords: formData.recipients.length,
      fieldStats,
      recordsWithMissingData,
      overallCompleteness,
    }
  }, [formData.recipients])

  const getCompletenessColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-600 dark:text-green-400"
    if (percentage >= 50) return "text-yellow-600 dark:text-yellow-400"
    return "text-red-600 dark:text-red-400"
  }

  const isFieldEmpty = (value: any) => {
    return value === null || value === undefined || String(value).trim() === ""
  }

  // Helper to parse CSV line (handles quoted values)
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ""
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === "," && !inQuotes) {
        result.push(current.replace(/^"|"$/g, "").trim())
        current = ""
      } else {
        current += char
      }
    }
    result.push(current.replace(/^"|"$/g, "").trim())
    return result
  }

  // Auto-detect column mapping based on header names
  const autoDetectMapping = (headers: string[]): ColumnMapping[] => {
    return headers.map((header) => {
      const lowerHeader = header.toLowerCase().replace(/[_\s-]/g, "")

      let mappedTo: FieldKey = "custom"

      if (["phone", "phonenumber", "mobile", "cell", "telephone"].includes(lowerHeader)) {
        mappedTo = "phone_number"
      } else if (["firstname", "first", "fname", "givenname"].includes(lowerHeader)) {
        mappedTo = "first_name"
      } else if (["lastname", "last", "lname", "surname", "familyname"].includes(lowerHeader)) {
        mappedTo = "last_name"
      } else if (["email", "emailaddress", "mail"].includes(lowerHeader)) {
        mappedTo = "email"
      } else if (
        ["company", "organization", "org", "business", "companyname"].includes(lowerHeader)
      ) {
        mappedTo = "company"
      }

      return {
        csvColumn: header,
        mappedTo,
        customVariableName:
          mappedTo === "custom" ? header.toLowerCase().replace(/[^a-z0-9_]/g, "_") : undefined,
      }
    })
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
      const lines = text.split(/\r?\n/).filter((line) => line.trim())

      if (lines.length < 2) {
        throw new Error("CSV must have a header row and at least one data row")
      }

      // Parse all rows
      const parsedData = lines.map(parseCSVLine)
      const headers = parsedData[0] || []

      if (headers.length === 0) {
        throw new Error("No columns found in CSV")
      }

      if (parsedData.length > 10001) {
        throw new Error("Maximum 10,000 recipients per import")
      }

      setCsvData(parsedData)
      setColumnMappings(autoDetectMapping(headers))
      setStep("mapping")
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Failed to parse CSV")
      setFile(null)
    }
  }

  const updateColumnMapping = (index: number, field: FieldKey, customName?: string) => {
    setColumnMappings((prev) => {
      const updated = [...prev]
      const existing = updated[index]?.customVariableName
      updated[index] = {
        ...updated[index],
        mappedTo: field,
        customVariableName: field === "custom" ? (customName ?? existing) : undefined,
      } as ColumnMapping
      return updated
    })
  }

  const applyMappingAndImport = useCallback(() => {
    const headers = csvData[0] || []
    const dataRows = csvData.slice(1)

    // Find phone column index
    const phoneColumnIndex = columnMappings.findIndex((m) => m.mappedTo === "phone_number")
    if (phoneColumnIndex === -1) {
      setParseError("Please map a column to Phone Number")
      return
    }

    // Build recipients
    const recipients: CreateRecipientInput[] = []
    const customVariableNames: string[] = []

    // Collect custom variable names
    columnMappings.forEach((mapping) => {
      if (mapping.mappedTo === "custom" && mapping.customVariableName) {
        customVariableNames.push(mapping.customVariableName)
      }
    })

    for (const row of dataRows) {
      const phone = row[phoneColumnIndex]?.trim()
      if (!phone) continue

      const recipient: CreateRecipientInput = {
        phone_number: phone,
        first_name: null,
        last_name: null,
        email: null,
        company: null,
        custom_variables: {},
      }

      columnMappings.forEach((mapping, colIndex) => {
        const value = row[colIndex]?.trim() || null

        switch (mapping.mappedTo) {
          case "first_name":
            recipient.first_name = value
            break
          case "last_name":
            recipient.last_name = value
            break
          case "email":
            recipient.email = value
            break
          case "company":
            recipient.company = value
            break
          case "custom":
            if (mapping.customVariableName && value) {
              recipient.custom_variables = {
                ...recipient.custom_variables,
                [mapping.customVariableName]: value,
              }
            }
            break
        }
      })

      recipients.push(recipient)
    }

    if (recipients.length === 0) {
      setParseError("No valid recipients found. Check that phone numbers are present.")
      return
    }

    // Get all unique custom variable columns for later use in variable mapping
    const allCustomVariables = Array.from(
      new Set(recipients.flatMap((r) => Object.keys(r.custom_variables || {})))
    )

    updateMultipleFields({
      recipients,
      csvColumnHeaders: headers,
      importedFileName: file?.name || null,
      // Pre-populate variable mappings for custom variables
      variableMappings: allCustomVariables.map((varName) => ({
        csv_column: varName,
        prompt_placeholder: `{{${varName}}}`,
        default_value: "",
      })),
    })

    setStep("preview")
    setParseError(null)
  }, [csvData, columnMappings, file, updateMultipleFields])

  const downloadTemplate = () => {
    const template =
      "phone_number,first_name,last_name,email,company,product_interest,account_balance\n+14155551234,John,Doe,john@example.com,Acme Inc,Premium Plan,1250.00\n+14155555678,Jane,Smith,jane@example.com,Tech Corp,Basic Plan,500.00"
    const blob = new Blob([template], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "campaign_recipients_template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const resetImport = () => {
    setFile(null)
    setCsvData([])
    setColumnMappings([])
    setParseError(null)
    setStep("upload")
    updateMultipleFields({
      recipients: [],
      csvColumnHeaders: [],
      importedFileName: null,
      variableMappings: [],
    })
  }

  // ============================================================================
  // RENDER: UPLOAD STEP
  // ============================================================================

  if (step === "upload") {
    return (
      <div className="space-y-6">
        <div
          className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => document.getElementById("csv-wizard-upload")?.click()}
        >
          <input
            id="csv-wizard-upload"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium">Click to upload CSV file</p>
          <p className="text-sm text-muted-foreground mt-1">
            Or drag and drop • Up to 10,000 recipients
          </p>
        </div>

        {parseError && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">{parseError}</p>
          </div>
        )}

        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-sm font-medium mb-3">CSV Format Guide:</p>
          <div className="grid md:grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">Standard Columns</p>
              <ul className="space-y-0.5">
                <li>
                  • <code className="bg-muted px-1 rounded">phone_number</code> (required)
                </li>
                <li>
                  • <code className="bg-muted px-1 rounded">first_name</code>,{" "}
                  <code className="bg-muted px-1 rounded">last_name</code>
                </li>
                <li>
                  • <code className="bg-muted px-1 rounded">email</code>,{" "}
                  <code className="bg-muted px-1 rounded">company</code>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Custom Variables</p>
              <ul className="space-y-0.5">
                <li>• Add any columns for personalization</li>
                <li>
                  • Example: <code className="bg-muted px-1 rounded">product_interest</code>
                </li>
                <li>• Map to prompts in next step</li>
              </ul>
            </div>
          </div>
          <Button variant="link" size="sm" className="px-0 mt-3" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-1" />
            Download template CSV
          </Button>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          <p>Don't have recipients yet? You can skip this step and add them later.</p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER: COLUMN MAPPING STEP
  // ============================================================================

  if (step === "mapping") {
    const headers = csvData[0] || []
    const sampleRow = csvData[1] || []

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-lg">
          <FileSpreadsheet className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            <strong>{file?.name}</strong> — {csvData.length - 1} rows found
          </p>
        </div>

        <div>
          <Label className="text-base font-medium">Map CSV Columns</Label>
          <p className="text-sm text-muted-foreground mb-4">
            Tell us how to use each column. Custom columns will be available as variables.
          </p>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">CSV Column</TableHead>
                  <TableHead className="w-[200px]">Sample Value</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Map To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {columnMappings.map((mapping, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-sm">{mapping.csvColumn}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {sampleRow[index] || "—"}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={mapping.mappedTo}
                        onValueChange={(value) => updateColumnMapping(index, value as FieldKey)}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STANDARD_FIELDS.map((field) => (
                            <SelectItem key={field.key} value={field.key}>
                              {field.label}
                              {field.required && " *"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {parseError && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">{parseError}</p>
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={resetImport}>
            <X className="h-4 w-4 mr-2" />
            Choose Different File
          </Button>
          <Button onClick={applyMappingAndImport}>
            Apply Mapping & Continue
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER: PREVIEW STEP (WITH DATA QUALITY REPORT)
  // ============================================================================

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="font-medium text-green-800 dark:text-green-200">
              {formData.recipients.length} Recipients Ready
            </p>
            {formData.importedFileName && (
              <p className="text-sm text-green-600 dark:text-green-400">
                Imported from {formData.importedFileName}
              </p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={resetImport}>
          <X className="h-4 w-4 mr-2" />
          Clear & Re-import
        </Button>
      </div>

      {/* Data Quality Report */}
      {dataQualityReport && dataQualityReport.recordsWithMissingData > 0 && (
        <div className="border rounded-lg p-4 bg-muted/30">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div className="flex-1 space-y-3">
              <div>
                <h4 className="font-medium text-sm mb-1">Data Quality Report</h4>
                <p className="text-sm text-muted-foreground">
                  {dataQualityReport.recordsWithMissingData} of {dataQualityReport.totalRecords}{" "}
                  recipients (
                  {Math.round(
                    (dataQualityReport.recordsWithMissingData / dataQualityReport.totalRecords) *
                      100
                  )}
                  %) have incomplete information
                </p>
              </div>

              {/* Field Completeness Stats */}
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

      {/* Custom Variables Badge */}
      {formData.variableMappings.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Custom Variables Detected:</p>
          <div className="flex flex-wrap gap-2">
            {formData.variableMappings.map((mapping) => (
              <Badge key={mapping.csv_column} variant="secondary">
                {mapping.prompt_placeholder}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Configure these in the next step to personalize your agent's messages.
          </p>
        </div>
      )}

      {/* Preview Table with Missing Field Highlights */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phone</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Custom Variables</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {formData.recipients.slice(0, 10).map((recipient, i) => {
              const fullName = [recipient.first_name, recipient.last_name].filter(Boolean).join(" ")

              return (
                <TableRow key={i}>
                  <TableCell className="font-mono">{recipient.phone_number}</TableCell>
                  <TableCell
                    className={isFieldEmpty(fullName) ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
                  >
                    {fullName || (
                      <span className="text-muted-foreground italic text-xs">Missing</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={
                      isFieldEmpty(recipient.email) ? "bg-yellow-50 dark:bg-yellow-950/20" : ""
                    }
                  >
                    {recipient.email || (
                      <span className="text-muted-foreground italic text-xs">Missing</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={
                      isFieldEmpty(recipient.company) ? "bg-yellow-50 dark:bg-yellow-950/20" : ""
                    }
                  >
                    {recipient.company || (
                      <span className="text-muted-foreground italic text-xs">Missing</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {Object.keys(recipient.custom_variables || {}).length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {Object.entries(recipient.custom_variables || {})
                          .slice(0, 2)
                          .map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs">
                              {key}: {String(value).slice(0, 15)}
                            </Badge>
                          ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {formData.recipients.length > 10 && (
          <div className="bg-muted/50 text-center py-2 text-sm text-muted-foreground">
            ...and {formData.recipients.length - 10} more recipients
          </div>
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
  )
}
