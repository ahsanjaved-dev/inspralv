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
  Info,
  Copy,
  CheckCircle,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { AgentCustomVariableDefinition } from "@/types/database.types"

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

interface AgentCustomVariablesSectionProps {
  /** Current custom variables for the agent */
  variables: AgentCustomVariableDefinition[]
  /** Callback when variables change */
  onChange: (variables: AgentCustomVariableDefinition[]) => void
  /** Whether the section is in a loading state */
  isLoading?: boolean
  /** Whether the section is disabled (e.g., during form submission) */
  disabled?: boolean
  /** Compact mode for wizard integration */
  compact?: boolean
}

// =============================================================================
// VARIABLE CARD
// =============================================================================

interface VariableCardProps {
  variable: AgentCustomVariableDefinition
  onEdit: () => void
  onDelete: () => void
  disabled?: boolean
  compact?: boolean
}

function VariableCard({ variable, onEdit, onDelete, disabled, compact }: VariableCardProps) {
  const [copied, setCopied] = useState(false)

  const copyPlaceholder = () => {
    navigator.clipboard.writeText(`{{${variable.name}}}`)
    setCopied(true)
    toast.success("Copied to clipboard!")
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn(
      "flex items-start justify-between rounded-lg border bg-card hover:border-primary/50 transition-colors",
      compact ? "p-3" : "p-4"
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <code className={cn(
            "font-mono font-semibold text-primary",
            compact ? "text-xs" : "text-sm"
          )}>
            {`{{${variable.name}}}`}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={copyPlaceholder}
            disabled={disabled}
          >
            {copied ? (
              <CheckCircle className="h-3 w-3 text-green-600" />
            ) : (
              <Copy className="h-3 w-3 text-muted-foreground" />
            )}
          </Button>
          <Badge variant="outline" className="text-xs">
            Agent
          </Badge>
        </div>
        <p className={cn(
          "text-muted-foreground line-clamp-2",
          compact ? "text-xs" : "text-sm"
        )}>
          {variable.description || "No description"}
        </p>
        {variable.default_value && (
          <p className="text-xs text-muted-foreground mt-1">
            Default: <span className="font-mono">{variable.default_value}</span>
          </p>
        )}
      </div>
      
      <div className="flex items-center gap-1 ml-3">
        <Button
          variant="ghost"
          size="icon"
          className={cn(compact ? "h-7 w-7" : "h-8 w-8")}
          onClick={onEdit}
          disabled={disabled}
        >
          <Pencil className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "text-destructive hover:text-destructive",
            compact ? "h-7 w-7" : "h-8 w-8"
          )}
          onClick={onDelete}
          disabled={disabled}
        >
          <Trash2 className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        </Button>
      </div>
    </div>
  )
}

// =============================================================================
// ADD/EDIT DIALOG
// =============================================================================

interface VariableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  variable?: AgentCustomVariableDefinition | null
  onSave: (data: VariableFormData) => void
  isSaving: boolean
  existingNames: string[]
}

function VariableDialog({ 
  open, 
  onOpenChange, 
  variable, 
  onSave, 
  isSaving,
  existingNames,
}: VariableDialogProps) {
  const [formData, setFormData] = useState<VariableFormData>(DEFAULT_FORM_DATA)
  const [error, setError] = useState<string | null>(null)

  // Update form data when variable changes or dialog opens
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
    // Check for duplicate (excluding current variable if editing)
    const isDuplicate = existingNames.some(
      (name) => name.toLowerCase() === formData.name.toLowerCase() && 
                (!variable || variable.name.toLowerCase() !== formData.name.toLowerCase())
    )
    if (isDuplicate) {
      setError(`A variable named "${formData.name}" already exists`)
      return
    }
    setError(null)
    onSave(formData)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {variable ? "Edit Agent Variable" : "Add Agent Variable"}
          </DialogTitle>
          <DialogDescription>
            {variable
              ? "Update the variable details below."
              : "Create a custom variable specific to this agent. Use it in prompts with {{variable_name}} syntax."}
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
              placeholder="e.g., appointment_time"
              className="font-mono"
              disabled={isSaving}
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
              disabled={isSaving}
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
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Used when the variable is not provided in campaign data
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
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

export function AgentCustomVariablesSection({
  variables,
  onChange,
  isLoading = false,
  disabled = false,
  compact = false,
}: AgentCustomVariablesSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingVariable, setEditingVariable] = useState<AgentCustomVariableDefinition | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [variableToDelete, setVariableToDelete] = useState<AgentCustomVariableDefinition | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const existingNames = variables.map((v) => v.name)

  const handleOpenAdd = () => {
    setEditingVariable(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (variable: AgentCustomVariableDefinition) => {
    setEditingVariable(variable)
    setDialogOpen(true)
  }

  const handleOpenDelete = (variable: AgentCustomVariableDefinition) => {
    setVariableToDelete(variable)
    setDeleteConfirmOpen(true)
  }

  const handleSave = async (data: VariableFormData) => {
    setIsSaving(true)
    try {
      if (editingVariable) {
        // Update existing variable
        const updatedVariables = variables.map((v) =>
          v.id === editingVariable.id
            ? {
                ...v,
                name: data.name,
                description: data.description,
                default_value: data.default_value,
              }
            : v
        )
        onChange(updatedVariables)
        toast.success("Variable updated")
      } else {
        // Add new variable
        const newVariable: AgentCustomVariableDefinition = {
          id: crypto.randomUUID(),
          name: data.name,
          description: data.description,
          default_value: data.default_value,
          is_required: false,
          category: "agent",
          created_at: new Date().toISOString(),
        }
        onChange([...variables, newVariable])
        toast.success("Variable added")
      }
      setDialogOpen(false)
    } catch (error: any) {
      toast.error(error.message || "Failed to save variable")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = () => {
    if (!variableToDelete) return
    const updatedVariables = variables.filter((v) => v.id !== variableToDelete.id)
    onChange(updatedVariables)
    toast.success("Variable deleted")
    setDeleteConfirmOpen(false)
    setVariableToDelete(null)
  }

  // Compact mode for wizard integration
  if (compact) {
    return (
      <div className="space-y-3">
        {/* Info Banner */}
        <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
          <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700 dark:text-amber-300">
            <p className="font-medium">Agent-Specific Variables</p>
            <p className="mt-0.5">
              Define variables unique to this agent. These are separate from workspace-level variables.
            </p>
          </div>
        </div>

        {/* Variables List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : variables.length > 0 ? (
          <div className="space-y-2">
            {variables.map((variable) => (
              <VariableCard
                key={variable.id}
                variable={variable}
                onEdit={() => handleOpenEdit(variable)}
                onDelete={() => handleOpenDelete(variable)}
                disabled={disabled}
                compact
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-3">
            No agent-specific variables defined yet.
          </p>
        )}

        {/* Add Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleOpenAdd}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Agent Variable
        </Button>

        {/* Dialogs */}
        <VariableDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          variable={editingVariable}
          onSave={handleSave}
          isSaving={isSaving}
          existingNames={existingNames}
        />

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Variable?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the variable{" "}
                <code className="font-mono bg-muted px-1 rounded">
                  {`{{${variableToDelete?.name}}}`}
                </code>
                {" "}from this agent. Any prompts using this variable will show the raw placeholder.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // Full card mode for settings/edit pages
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Variable className="h-5 w-5" />
          Agent Custom Variables
        </CardTitle>
        <CardDescription>
          Define variables specific to this agent. Use these in prompts with {"{{variable_name}}"} syntax.
          These are separate from workspace-level variables.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info Banner */}
        <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
          <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700 dark:text-amber-300">
            <p className="font-medium mb-1">Agent-Specific Variables</p>
            <p>
              These variables are unique to this agent and can be used alongside workspace variables.
              When running campaigns, provide values in your CSV or they'll use the default value.
            </p>
          </div>
        </div>

        {/* Variables List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : variables.length > 0 ? (
          <div className="space-y-3">
            {variables.map((variable) => (
              <VariableCard
                key={variable.id}
                variable={variable}
                onEdit={() => handleOpenEdit(variable)}
                onDelete={() => handleOpenDelete(variable)}
                disabled={disabled}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Variable className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No agent-specific variables defined yet.</p>
            <p className="text-xs mt-1">Add variables to personalize this agent's prompts.</p>
          </div>
        )}

        {/* Add Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={handleOpenAdd}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Agent Variable
        </Button>

        {/* Quick Add Suggestions */}
        {variables.length === 0 && (
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-3">Quick Add Common Variables</p>
            <div className="flex flex-wrap gap-2">
              {[
                { name: "appointment_time", desc: "Scheduled appointment time" },
                { name: "service_type", desc: "Type of service requested" },
                { name: "callback_number", desc: "Preferred callback number" },
                { name: "special_instructions", desc: "Special handling instructions" },
                { name: "priority_level", desc: "Call priority level" },
              ].map((suggestion) => (
                <Button
                  key={suggestion.name}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const newVariable: AgentCustomVariableDefinition = {
                      id: crypto.randomUUID(),
                      name: suggestion.name,
                      description: suggestion.desc,
                      default_value: "",
                      is_required: false,
                      category: "agent",
                      created_at: new Date().toISOString(),
                    }
                    onChange([...variables, newVariable])
                    toast.success(`Added ${suggestion.name}`)
                  }}
                  disabled={disabled || existingNames.includes(suggestion.name)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {suggestion.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Dialogs */}
      <VariableDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        variable={editingVariable}
        onSave={handleSave}
        isSaving={isSaving}
        existingNames={existingNames}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variable?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the variable{" "}
              <code className="font-mono bg-muted px-1 rounded">
                {`{{${variableToDelete?.name}}}`}
              </code>
              . Any prompts using this variable will show the raw placeholder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

