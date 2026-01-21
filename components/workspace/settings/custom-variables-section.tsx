"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Variable,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Lock,
  Info,
  Copy,
  CheckCircle,
} from "lucide-react"
import { toast } from "sonner"
import {
  useWorkspaceCustomVariables,
  useAddCustomVariable,
  useUpdateCustomVariable,
  useDeleteCustomVariable,
} from "@/lib/hooks/use-workspace-settings"
import {
  type CustomVariableDefinition,
  STANDARD_CAMPAIGN_VARIABLES,
} from "@/types/database.types"

// =============================================================================
// TYPES
// =============================================================================

interface VariableFormData {
  name: string
  description: string
  default_value: string
}

const DEFAULT_FORM_DATA: VariableFormData = {
  name: "",
  description: "",
  default_value: "",
}

// =============================================================================
// VARIABLE CARD
// =============================================================================

interface VariableCardProps {
  variable: CustomVariableDefinition
  isStandard?: boolean
  onEdit?: () => void
  onDelete?: () => void
}

function VariableCard({ variable, isStandard, onEdit, onDelete }: VariableCardProps) {
  const [copied, setCopied] = useState(false)

  const copyPlaceholder = () => {
    navigator.clipboard.writeText(`{{${variable.name}}}`)
    setCopied(true)
    toast.success("Copied to clipboard!")
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-start justify-between p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-sm font-mono font-semibold text-primary">
            {`{{${variable.name}}}`}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={copyPlaceholder}
          >
            {copied ? (
              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
          {isStandard && (
            <Badge variant="secondary" className="text-xs">Standard</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {variable.description || "No description"}
        </p>
        {variable.default_value && (
          <p className="text-xs text-muted-foreground mt-1">
            Default: <span className="font-mono">{variable.default_value}</span>
          </p>
        )}
      </div>
      
      {!isStandard && (
        <div className="flex items-center gap-1 ml-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      {isStandard && (
        <div className="ml-4">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

// =============================================================================
// ADD/EDIT DIALOG
// =============================================================================

interface VariableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  variable?: CustomVariableDefinition | null
  onSave: (data: VariableFormData) => void
  isSaving: boolean
}

function VariableDialog({ open, onOpenChange, variable, onSave, isSaving }: VariableDialogProps) {
  const [formData, setFormData] = useState<VariableFormData>(DEFAULT_FORM_DATA)
  const [error, setError] = useState<string | null>(null)

  // Update form data when variable changes or dialog opens
  // This fixes the issue where edit dialog shows empty fields
  useEffect(() => {
    if (open) {
      if (variable) {
        setFormData({
          name: variable.name,
          description: variable.description || "",
          default_value: variable.default_value || "",
        })
      } else {
        setFormData(DEFAULT_FORM_DATA)
      }
      setError(null)
    }
  }, [open, variable])

  // Reset form when dialog opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
  }

  const handleSubmit = () => {
    // Validate
    if (!formData.name.trim()) {
      setError("Variable name is required")
      return
    }
    if (!/^[a-z][a-z0-9_]*$/.test(formData.name)) {
      setError("Name must start with a letter and contain only lowercase letters, numbers, and underscores")
      return
    }
    setError(null)
    onSave(formData)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {variable ? "Edit Variable" : "Add Custom Variable"}
          </DialogTitle>
          <DialogDescription>
            {variable
              ? "Update the variable details below."
              : "Create a new custom variable for use in campaigns and agent prompts."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="var-name">
              Variable Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="var-name"
              value={formData.name}
              onChange={(e) => {
                const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_")
                setFormData({ ...formData, name: value })
              }}
              placeholder="e.g., product_interest"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Use in prompts as: <code className="bg-muted px-1 rounded">{`{{${formData.name || "variable_name"}}}`}</code>
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="var-description">Description</Label>
            <Input
              id="var-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What this variable represents"
            />
          </div>

          {/* Default Value */}
          <div className="space-y-2">
            <Label htmlFor="var-default">Default Value</Label>
            <Input
              id="var-default"
              value={formData.default_value}
              onChange={(e) => setFormData({ ...formData, default_value: e.target.value })}
              placeholder="Fallback value if not provided"
            />
            <p className="text-xs text-muted-foreground">
              Used when the variable is not provided in CSV data
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {variable ? "Save Changes" : "Add Variable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function CustomVariablesSection() {
  const { customVariables, isLoading } = useWorkspaceCustomVariables()
  const addVariable = useAddCustomVariable()
  const updateVariable = useUpdateCustomVariable()
  const deleteVariable = useDeleteCustomVariable()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingVariable, setEditingVariable] = useState<CustomVariableDefinition | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [variableToDelete, setVariableToDelete] = useState<CustomVariableDefinition | null>(null)

  // Combine standard variables with custom variables
  const standardVariables: CustomVariableDefinition[] = STANDARD_CAMPAIGN_VARIABLES.map((v, i) => ({
    ...v,
    id: `standard-${i}`,
    created_at: new Date().toISOString(),
    is_standard: true,
  }))

  const allVariables = [...standardVariables, ...customVariables]

  const handleOpenAdd = () => {
    setEditingVariable(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (variable: CustomVariableDefinition) => {
    setEditingVariable(variable)
    setDialogOpen(true)
  }

  const handleOpenDelete = (variable: CustomVariableDefinition) => {
    setVariableToDelete(variable)
    setDeleteConfirmOpen(true)
  }

  const handleSave = async (data: VariableFormData) => {
    try {
      // Always use "custom" category and not required for user-created variables
      const apiData = {
        ...data,
        category: "custom" as const,
        is_required: false,
      }
      if (editingVariable) {
        await updateVariable.mutateAsync({ id: editingVariable.id, ...apiData })
        toast.success("Variable updated successfully")
      } else {
        await addVariable.mutateAsync(apiData)
        toast.success("Variable added successfully")
      }
      setDialogOpen(false)
    } catch (error: any) {
      toast.error(error.message || "Failed to save variable")
    }
  }

  const handleDelete = async () => {
    if (!variableToDelete) return
    try {
      await deleteVariable.mutateAsync(variableToDelete.id)
      toast.success("Variable deleted")
      setDeleteConfirmOpen(false)
      setVariableToDelete(null)
    } catch (error: any) {
      toast.error(error.message || "Failed to delete variable")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Variable className="h-5 w-5" />
          Custom Variables
        </CardTitle>
        <CardDescription>
          Define variables that can be personalized for each recipient in outbound campaigns.
          Use these in your system prompt with {"{{variable_name}}"} syntax.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info Banner */}
        <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">How Custom Variables Work</p>
            <p>
              When running campaigns, these variables will be replaced with recipient-specific
              data from your CSV import. For example, {"{{first_name}}"} becomes "John" for
              each recipient.
            </p>
          </div>
        </div>

        {/* Variables List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Standard Variables (locked) */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Standard Variables</Label>
              {standardVariables.map((variable) => (
                <VariableCard
                  key={variable.id}
                  variable={variable}
                  isStandard
                />
              ))}
            </div>

            {/* Custom Variables */}
            {customVariables.length > 0 && (
              <div className="space-y-2 pt-4 border-t">
                <Label className="text-sm text-muted-foreground">Custom Variables</Label>
                {customVariables.map((variable) => (
                  <VariableCard
                    key={variable.id}
                    variable={variable}
                    onEdit={() => handleOpenEdit(variable)}
                    onDelete={() => handleOpenDelete(variable)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={handleOpenAdd}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Custom Variable
        </Button>

        {/* Quick Add Suggestions */}
        {customVariables.length === 0 && (
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-3">Quick Add Common Variables</p>
            <div className="flex flex-wrap gap-2">
              {[
                { name: "product_interest", desc: "Product they're interested in", category: "business" as const },
                { name: "appointment_date", desc: "Scheduled appointment date", category: "business" as const },
                { name: "account_balance", desc: "Account balance amount", category: "business" as const },
                { name: "referral_source", desc: "How they heard about us", category: "contact" as const },
                { name: "preferred_time", desc: "Preferred callback time", category: "contact" as const },
              ].map((suggestion) => (
                <Button
                  key={suggestion.name}
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await addVariable.mutateAsync({
                        name: suggestion.name,
                        description: suggestion.desc,
                        default_value: "",
                        is_required: false,
                        category: suggestion.category,
                      })
                      toast.success(`Added ${suggestion.name}`)
                    } catch (error: any) {
                      toast.error(error.message || "Failed to add variable")
                    }
                  }}
                  disabled={addVariable.isPending}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {suggestion.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Add/Edit Dialog */}
      <VariableDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        variable={editingVariable}
        onSave={handleSave}
        isSaving={addVariable.isPending || updateVariable.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variable?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the variable{" "}
              <code className="font-mono bg-muted px-1 rounded">
                {`{{${variableToDelete?.name}}}`}
              </code>
              . Any agents or campaigns using this variable will show the raw placeholder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteVariable.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

