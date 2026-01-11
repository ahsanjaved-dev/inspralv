"use client"

import { useState, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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

// Standard field mappings - aligned with Inspra Outbound API variables
const STANDARD_FIELDS = [
  { key: "phone_number", label: "Phone Number", required: true },
  { key: "first_name", label: "First Name", required: false },
  { key: "last_name", label: "Last Name", required: false },
  { key: "email", label: "Email", required: false },
  { key: "company", label: "Company", required: false },
  { key: "reason_for_call", label: "Reason for Call", required: false },
  { key: "address_line_1", label: "Address Line 1", required: false },
  { key: "address_line_2", label: "Address Line 2", required: false },
  { key: "suburb", label: "Suburb/City", required: false },
  { key: "state", label: "State", required: false },
  { key: "post_code", label: "Post Code", required: false },
  { key: "country", label: "Country", required: false },
  { key: "skip", label: "Skip Column", required: false },
] as const

type FieldKey = (typeof STANDARD_FIELDS)[number]["key"]

interface ColumnMapping {
  csvColumn: string
  mappedTo: FieldKey
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
      { fieldName: "reason_for_call", displayName: "Reason" },
      { fieldName: "address_line_1", displayName: "Address" },
      { fieldName: "suburb", displayName: "Suburb/City" },
      { fieldName: "state", displayName: "State" },
      { fieldName: "post_code", displayName: "Post Code" },
      { fieldName: "country", displayName: "Country" },
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

    // Count records missing key contact fields (name, email, company)
    const recordsWithMissingData = formData.recipients.filter((r) => {
      return !r.first_name?.trim() || !r.last_name?.trim() || !r.email?.trim() || !r.company?.trim()
    }).length

    // Calculate overall completeness based on core contact fields only
    const coreFields = fieldStats.filter((f) => 
      ["first_name", "last_name", "email", "company"].includes(f.fieldName)
    )
    const overallCompleteness =
      coreFields.reduce((sum, f) => sum + f.completeness, 0) / coreFields.length

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

      let mappedTo: FieldKey = "skip"

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
      } else if (
        ["reasonforcall", "reason", "callreason", "purpose"].includes(lowerHeader)
      ) {
        mappedTo = "reason_for_call"
      } else if (
        ["addressline1", "address1", "address", "streetaddress", "street"].includes(lowerHeader)
      ) {
        mappedTo = "address_line_1"
      } else if (
        ["addressline2", "address2", "apt", "apartment", "suite", "unit"].includes(lowerHeader)
      ) {
        mappedTo = "address_line_2"
      } else if (
        ["suburb", "city", "town", "locality"].includes(lowerHeader)
      ) {
        mappedTo = "suburb"
      } else if (
        ["state", "province", "region"].includes(lowerHeader)
      ) {
        mappedTo = "state"
      } else if (
        ["postcode", "postalcode", "zipcode", "zip", "postzip"].includes(lowerHeader)
      ) {
        mappedTo = "post_code"
      } else if (
        ["country", "countryname", "countrycode"].includes(lowerHeader)
      ) {
        mappedTo = "country"
      }

      return {
        csvColumn: header,
        mappedTo,
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

  const updateColumnMapping = (index: number, field: FieldKey) => {
    setColumnMappings((prev) => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        mappedTo: field,
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

    for (const row of dataRows) {
      const phone = row[phoneColumnIndex]?.trim()
      if (!phone) continue

      const recipient: CreateRecipientInput = {
        phone_number: phone,
        first_name: null,
        last_name: null,
        email: null,
        company: null,
        reason_for_call: null,
        address_line_1: null,
        address_line_2: null,
        suburb: null,
        state: null,
        post_code: null,
        country: null,
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
          case "reason_for_call":
            recipient.reason_for_call = value
            break
          case "address_line_1":
            recipient.address_line_1 = value
            break
          case "address_line_2":
            recipient.address_line_2 = value
            break
          case "suburb":
            recipient.suburb = value
            break
          case "state":
            recipient.state = value
            break
          case "post_code":
            recipient.post_code = value
            break
          case "country":
            recipient.country = value
            break
        }
      })

      recipients.push(recipient)
    }

    if (recipients.length === 0) {
      setParseError("No valid recipients found. Check that phone numbers are present.")
      return
    }

    updateMultipleFields({
      recipients,
      csvColumnHeaders: headers,
      importedFileName: file?.name || null,
      variableMappings: [], // No longer using custom variable mappings in campaign
    })

    setStep("preview")
    setParseError(null)
  }, [csvData, columnMappings, file, updateMultipleFields])

  const downloadTemplate = () => {
    const template =
      "phone_number,first_name,last_name,email,company,reason_for_call,address_line_1,address_line_2,suburb,state,post_code,country\n+14155551234,John,Doe,john@example.com,Acme Inc,Follow up on inquiry,123 Main St,Suite 100,Melbourne,VIC,3000,Australia\n+14155555678,Jane,Smith,jane@example.com,Tech Corp,Product demo,456 Oak Ave,,Sydney,NSW,2000,Australia"
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
              <p className="font-medium text-foreground mb-1">Contact Information</p>
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
              <p className="font-medium text-foreground mb-1">Additional Fields</p>
              <ul className="space-y-0.5">
                <li>
                  • <code className="bg-muted px-1 rounded">reason_for_call</code>
                </li>
                <li>
                  • <code className="bg-muted px-1 rounded">address_line_1</code>,{" "}
                  <code className="bg-muted px-1 rounded">suburb</code>
                </li>
                <li>
                  • <code className="bg-muted px-1 rounded">state</code>,{" "}
                  <code className="bg-muted px-1 rounded">post_code</code>,{" "}
                  <code className="bg-muted px-1 rounded">country</code>
                </li>
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
  // RENDER: PREVIEW STEP (WITH IMPROVED DATA QUALITY REPORT)
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 rounded-xl border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-green-100 dark:bg-green-900 rounded-full">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-xl font-semibold text-green-800 dark:text-green-200">
              {formData.recipients.length.toLocaleString()} Recipients Ready
            </p>
            {formData.importedFileName && (
              <p className="text-sm text-green-600 dark:text-green-400">
                Imported from {formData.importedFileName}
              </p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={resetImport} className="shrink-0">
          <X className="h-4 w-4 mr-2" />
          Clear & Re-import
        </Button>
      </div>

      {/* Data Quality Report - Always show when there's data */}
      {dataQualityReport && (
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h4 className="font-semibold">Data Quality Report</h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Overall Completeness:</span>
                <span className={`text-sm font-bold ${getCompletenessColor(dataQualityReport.overallCompleteness)}`}>
                  {Math.round(dataQualityReport.overallCompleteness)}%
                </span>
              </div>
            </div>
          </div>
          
          <div className="p-4">
            {/* Core Contact Fields */}
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Contact Information</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {dataQualityReport.fieldStats
                  .filter((f) => ["first_name", "last_name", "email", "company"].includes(f.fieldName))
                  .map((field) => (
                    <div
                      key={field.fieldName}
                      className="p-3 rounded-lg border bg-background"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{field.displayName}</span>
                        <span className={`text-sm font-bold ${getCompletenessColor(field.completeness)}`}>
                          {Math.round(field.completeness)}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${
                            field.completeness >= 80 ? 'bg-green-500' :
                            field.completeness >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${field.completeness}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {field.filled} of {field.total}
                      </p>
                    </div>
                  ))}
              </div>
            </div>

            {/* Address Fields */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Address & Additional Fields</p>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {dataQualityReport.fieldStats
                  .filter((f) => ["reason_for_call", "address_line_1", "suburb", "state", "post_code", "country"].includes(f.fieldName))
                  .map((field) => (
                    <div
                      key={field.fieldName}
                      className="p-2 rounded-lg border bg-background text-center"
                    >
                      <span className={`text-lg font-bold ${getCompletenessColor(field.completeness)}`}>
                        {Math.round(field.completeness)}%
                      </span>
                      <p className="text-xs text-muted-foreground truncate" title={field.displayName}>
                        {field.displayName}
                      </p>
                    </div>
                  ))}
              </div>
            </div>

            {/* Warning for low completeness */}
            {dataQualityReport.overallCompleteness < 70 && (
              <div className="flex items-start gap-3 mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Low Data Completeness
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    {dataQualityReport.recordsWithMissingData} recipients are missing key contact information. 
                    Consider updating your CSV for better personalization.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border bg-card text-center">
          <p className="text-3xl font-bold text-primary">{formData.recipients.length}</p>
          <p className="text-sm text-muted-foreground">Total Recipients</p>
        </div>
        <div className="p-4 rounded-lg border bg-card text-center">
          <p className="text-3xl font-bold text-green-600">
            {dataQualityReport?.fieldStats.find(f => f.fieldName === "email")?.filled || 0}
          </p>
          <p className="text-sm text-muted-foreground">With Email</p>
        </div>
        <div className="p-4 rounded-lg border bg-card text-center">
          <p className="text-3xl font-bold text-blue-600">
            {dataQualityReport?.fieldStats.find(f => f.fieldName === "company")?.filled || 0}
          </p>
          <p className="text-sm text-muted-foreground">With Company</p>
        </div>
        <div className="p-4 rounded-lg border bg-card text-center">
          <p className="text-3xl font-bold text-purple-600">
            {dataQualityReport?.fieldStats.find(f => f.fieldName === "address_line_1")?.filled || 0}
          </p>
          <p className="text-sm text-muted-foreground">With Address</p>
        </div>
      </div>
    </div>
  )
}
