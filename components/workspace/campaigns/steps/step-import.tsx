"use client"

import { useState, useCallback, useMemo, memo } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
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
  Sparkles,
  Bot,
  Building2,
} from "lucide-react"
import type { CreateRecipientInput } from "@/types/database.types"
import type { WizardFormData } from "@/lib/stores/campaign-wizard-store"
import { useWorkspaceCustomVariables } from "@/lib/hooks/use-workspace-settings"
import { getAgentCustomVariables } from "@/lib/hooks/use-agent-custom-variables"

interface StepImportProps {
  formData: WizardFormData
  updateMultipleFields: (updates: Partial<WizardFormData>) => void
  errors: Record<string, string>
}

// Standard field mappings - Core fields for voice AI campaigns
// These are the essential contact fields that map to database columns
const STANDARD_FIELDS = [
  { key: "phone_number", label: "Phone Number", required: true, isCustom: false },
  { key: "first_name", label: "First Name", required: false, isCustom: false },
  { key: "last_name", label: "Last Name", required: false, isCustom: false },
  { key: "email", label: "Email", required: false, isCustom: false },
  { key: "company", label: "Company", required: false, isCustom: false },
  { key: "skip", label: "Skip Column", required: false, isCustom: false },
] as const

type StandardFieldKey = (typeof STANDARD_FIELDS)[number]["key"]
type FieldKey = StandardFieldKey | string // Allow custom variable keys

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

export const StepImport = memo(function StepImport({ formData, updateMultipleFields, errors }: StepImportProps) {
  const [file, setFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<string[][]>([])
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [step, setStep] = useState<"upload" | "mapping" | "preview">(
    formData.recipients.length > 0 ? "preview" : "upload"
  )

  // Get workspace custom variables for mapping dropdown
  const { customVariables: workspaceVariables } = useWorkspaceCustomVariables()

  // Get agent-specific custom variables from the selected agent
  const agentCustomVariables = useMemo(() => {
    return getAgentCustomVariables(formData.selectedAgent)
  }, [formData.selectedAgent])

  // Combine standard fields with agent variables and workspace custom variables
  const allMappingFields = useMemo(() => {
    const fields: Array<{ key: string; label: string; required: boolean; isCustom: boolean; source: "standard" | "agent" | "workspace" | "csv" }> = [
      ...STANDARD_FIELDS.map(f => ({ ...f, isCustom: false, source: "standard" as const })),
    ]
    
    // Add agent-specific custom variables (highest priority after standard)
    agentCustomVariables.forEach(v => {
      if (!STANDARD_FIELDS.some(sf => sf.key === v.name)) {
        fields.push({
          key: v.name,
          label: v.description || v.name,
          required: v.is_required || false,
          isCustom: true,
          source: "agent",
        })
      }
    })
    
    // Add workspace custom variables
    workspaceVariables.forEach(v => {
      // Don't add if already exists in standard fields or agent variables
      if (!fields.some(f => f.key === v.name)) {
        fields.push({
          key: v.name,
          label: v.description || v.name,
          required: false,
          isCustom: true,
          source: "workspace",
        })
      }
    })
    
    // Add CSV column headers as custom variable options
    // This allows any CSV column to be mapped as a custom variable for {{variable}} substitution
    if (csvData.length > 0) {
      const headers = csvData[0] || []
      headers.forEach(header => {
        const normalizedKey = header.toLowerCase().replace(/[\s-]/g, "_")
        // Don't add if already exists
        if (!fields.some(f => f.key === normalizedKey || f.key === header)) {
          fields.push({
            key: normalizedKey,
            label: `${header} (Custom)`,
            required: false,
            isCustom: true,
            source: "csv",
          })
        }
      })
    }
    
    return fields
  }, [agentCustomVariables, workspaceVariables, csvData])

  // Analyze data quality
  const dataQualityReport = useMemo((): DataQualityReport | null => {
    if (formData.recipients.length === 0) return null

    // Core contact fields for voice AI campaigns
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
  const autoDetectMapping = useCallback((headers: string[]): ColumnMapping[] => {
    return headers.map((header) => {
      const lowerHeader = header.toLowerCase().replace(/[_\s-]/g, "")
      const exactHeader = header.toLowerCase().replace(/[\s-]/g, "_")

      let mappedTo: FieldKey = "skip"

      // First check standard fields
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
      } else {
        // Check if it matches an agent-specific custom variable (priority)
        const matchingAgentVar = agentCustomVariables.find(
          v => v.name.toLowerCase() === exactHeader || v.name.toLowerCase() === lowerHeader
        )
        if (matchingAgentVar) {
          mappedTo = matchingAgentVar.name
        } else {
          // Check if it matches a workspace custom variable
          const matchingCustomVar = workspaceVariables.find(
            v => v.name.toLowerCase() === exactHeader || v.name.toLowerCase() === lowerHeader
          )
          if (matchingCustomVar) {
            mappedTo = matchingCustomVar.name
          } else {
            // Auto-map unrecognized columns as custom variables using their column name
            // This allows CSV columns like "product_interest" to be automatically captured
            // even if not defined in workspace custom variables
            // The key is normalized to snake_case (e.g., "Product Interest" -> "product_interest")
            mappedTo = exactHeader as FieldKey
          }
        }
      }

      return {
        csvColumn: header,
        mappedTo,
      }
    })
  }, [agentCustomVariables, workspaceVariables])

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
          case "phone_number":
          case "skip":
            // Already handled or skip
            break
          default:
            // Handle custom variables (agent-specific or workspace-defined variables)
            // These are stored in custom_variables for substitution in system prompts
            if (mapping.mappedTo && value) {
              recipient.custom_variables[mapping.mappedTo] = value
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

    updateMultipleFields({
      recipients,
      csvColumnHeaders: headers,
      importedFileName: file?.name || null,
    })

    setStep("preview")
    setParseError(null)
  }, [csvData, columnMappings, file, updateMultipleFields])

  const downloadTemplate = () => {
    // Template with standard fields + example custom variables for personalization
    const template = `phone_number,first_name,last_name,email,company,product_interest,appointment_date,account_balance
+14155551234,John,Doe,john@example.com,Acme Inc,Solar Panels,January 25 2026,$1250.00
+14155555678,Jane,Smith,jane@example.com,Tech Corp,Home Security,January 26 2026,$850.00
+14155559012,Mike,Johnson,mike@example.com,Global LLC,Smart Thermostat,January 27 2026,$2100.00`
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
              <p className="font-medium text-foreground mb-1">Standard Fields</p>
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
                <li>
                  • Add any custom columns for personalization
                </li>
                <li>
                  • Map to agent or workspace variables
                </li>
                <li>
                  • Use in prompts as{" "}
                  <code className="bg-muted px-1 rounded">{`{{variable_name}}`}</code>
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
                        <SelectTrigger className="w-[250px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Standard Contact Fields */}
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            Standard Fields
                          </div>
                          {STANDARD_FIELDS.map((field) => (
                            <SelectItem key={field.key} value={field.key}>
                              {field.label}
                              {field.required && " *"}
                            </SelectItem>
                          ))}
                          
                          {/* Agent-Specific Custom Variables */}
                          {agentCustomVariables.length > 0 && (
                            <>
                              <SelectSeparator />
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                <Bot className="h-3 w-3" />
                                Agent Variables
                                {formData.selectedAgent && (
                                  <span className="text-xs text-muted-foreground/70">
                                    ({formData.selectedAgent.name})
                                  </span>
                                )}
                              </div>
                              {agentCustomVariables.map((variable) => (
                                <SelectItem key={variable.id} value={variable.name}>
                                  {variable.name}
                                  {variable.description && (
                                    <span className="text-muted-foreground ml-1 text-xs">
                                      ({variable.description})
                                    </span>
                                  )}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          
                          {/* Workspace Custom Variables */}
                          {workspaceVariables.length > 0 && (
                            <>
                              <SelectSeparator />
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                Workspace Variables
                              </div>
                              {workspaceVariables.map((variable) => (
                                <SelectItem key={variable.id} value={variable.name}>
                                  {variable.name}
                                  {variable.description && (
                                    <span className="text-muted-foreground ml-1 text-xs">
                                      ({variable.description})
                                    </span>
                                  )}
                                </SelectItem>
                              ))}
                            </>
                          )}
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
      <div className="flex items-center justify-between p-5 bg-linear-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 rounded-xl border border-green-200 dark:border-green-800">
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
            {dataQualityReport?.fieldStats.find(f => f.fieldName === "first_name")?.filled || 0}
          </p>
          <p className="text-sm text-muted-foreground">With Name</p>
        </div>
        <div className="p-4 rounded-lg border bg-card text-center">
          <p className="text-3xl font-bold text-blue-600">
            {dataQualityReport?.fieldStats.find(f => f.fieldName === "company")?.filled || 0}
          </p>
          <p className="text-sm text-muted-foreground">With Company</p>
        </div>
        <div className="p-4 rounded-lg border bg-card text-center">
          <p className="text-3xl font-bold text-purple-600">
            {dataQualityReport?.fieldStats.find(f => f.fieldName === "email")?.filled || 0}
          </p>
          <p className="text-sm text-muted-foreground">With Email</p>
        </div>
      </div>
    </div>
  )
})

// Display name for debugging
StepImport.displayName = "StepImport"
