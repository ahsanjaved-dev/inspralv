"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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
  useWhiteLabelVariants,
  useCreateWhiteLabelVariant,
  useUpdateWhiteLabelVariant,
  useDeleteWhiteLabelVariant,
  useSyncVariantToStripe,
  type WhiteLabelVariantWithUsage,
} from "@/lib/hooks/use-white-label-variants"
import {
  Plus,
  Loader2,
  Package,
  DollarSign,
  Building2,
  CheckCircle,
  XCircle,
  Pencil,
  Trash2,
  CreditCard,
  AlertTriangle,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"

export default function SuperAdminPlansPage() {
  const [showInactive, setShowInactive] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingVariant, setEditingVariant] = useState<WhiteLabelVariantWithUsage | null>(null)
  const [deletingVariant, setDeletingVariant] = useState<WhiteLabelVariantWithUsage | null>(null)

  const { data: variants, isLoading, error } = useWhiteLabelVariants(showInactive)

  const activeCount = variants?.filter((v) => v.isActive).length || 0
  const totalPartners = variants?.reduce((sum, v) => sum + (v.partnerCount || 0), 0) || 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Agency Plans</h1>
          <p className="text-muted-foreground mt-1">
            Manage white-label pricing tiers for agencies. Stripe products are auto-created.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="bg-primary hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          Create Plan
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Plans</p>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight text-foreground">{activeCount}</p>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Package className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Agencies</p>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight text-foreground">{totalPartners}</p>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Plans</p>
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight text-foreground">{variants?.length || 0}</p>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
            <Label htmlFor="show-inactive" className="text-sm text-muted-foreground cursor-pointer">
              Show inactive plans
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Plans Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <p className="text-destructive text-center">Failed to load plans. Please try again.</p>
          </CardContent>
        </Card>
      ) : variants?.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 bg-primary/10 rounded-full mb-4">
              <Package className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No plans yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mt-2">
              Create your first agency pricing plan to get started.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create First Plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {variants?.map((variant) => (
            <PlanCard
              key={variant.id}
              variant={variant}
              onEdit={() => setEditingVariant(variant)}
              onDelete={() => setDeletingVariant(variant)}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <CreatePlanDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      {/* Edit Dialog */}
      <EditPlanDialog
        variant={editingVariant}
        open={!!editingVariant}
        onOpenChange={(open) => !open && setEditingVariant(null)}
      />

      {/* Delete Confirmation */}
      <DeletePlanDialog
        variant={deletingVariant}
        open={!!deletingVariant}
        onOpenChange={(open) => !open && setDeletingVariant(null)}
      />
    </div>
  )
}

// =============================================================================
// PLAN CARD COMPONENT
// =============================================================================

function PlanCard({
  variant,
  onEdit,
  onDelete,
}: {
  variant: WhiteLabelVariantWithUsage
  onEdit: () => void
  onDelete: () => void
}) {
  const syncMutation = useSyncVariantToStripe()
  const hasStripe = !!variant.stripePriceId
  const isFree = variant.monthlyPriceCents === 0
  const needsStripeSync = !isFree && !hasStripe

  const handleSyncToStripe = async () => {
    try {
      await syncMutation.mutateAsync({ id: variant.id, variant })
      toast.success("Plan synced to Stripe successfully")
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to sync to Stripe"
      toast.error(errorMessage)
    }
  }

  return (
    <Card className={`bg-card border-border ${!variant.isActive ? "opacity-60" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              {variant.name}
              {!variant.isActive && (
                <Badge variant="secondary" className="text-xs">
                  Inactive
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-sm">{variant.slug}</CardDescription>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
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
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {variant.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{variant.description}</p>
        )}

        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold">
            {isFree ? "Free" : `$${(variant.monthlyPriceCents / 100).toFixed(0)}`}
          </span>
          {!isFree && <span className="text-muted-foreground">/month</span>}
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span>
              {variant.maxWorkspaces === -1 ? "Unlimited" : variant.maxWorkspaces} workspaces
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span>{variant.partnerCount} agencies subscribed</span>
          </div>
        </div>

        {/* Stripe Status */}
        <div className="pt-2 border-t border-border">
          {isFree ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Free tier - no payment required</span>
            </div>
          ) : hasStripe ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span>Stripe configured</span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                <span>Stripe not configured</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={handleSyncToStripe}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1" />
                )}
                Sync to Stripe
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// CREATE PLAN DIALOG
// =============================================================================

function CreatePlanDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createMutation = useCreateWhiteLabelVariant()

  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    monthly_price_cents: 0,
    max_workspaces: 10,
    is_active: true,
    sort_order: 0,
  })

  const handleSubmit = async () => {
    if (!form.name || !form.slug) {
      toast.error("Name and slug are required")
      return
    }

    try {
      await createMutation.mutateAsync(form)
      toast.success("Plan created successfully")
      onOpenChange(false)
      setForm({
        name: "",
        slug: "",
        description: "",
        monthly_price_cents: 0,
        max_workspaces: 10,
        is_active: true,
        sort_order: 0,
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create plan"
      toast.error(errorMessage)
    }
  }

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    setForm({ ...form, name, slug })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Agency Plan</DialogTitle>
          <DialogDescription>
            Create a new pricing tier for agencies. Stripe product and price will be auto-created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Plan Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g., Growth"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) =>
                  setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })
                }
                placeholder="e.g., growth"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Plan description..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Monthly Price ($)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                value={form.monthly_price_cents / 100}
                onChange={(e) =>
                  setForm({ ...form, monthly_price_cents: Math.round(parseFloat(e.target.value || "0") * 100) })
                }
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Set to 0 for free tier</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspaces">Max Workspaces</Label>
              <Input
                id="workspaces"
                type="number"
                min="-1"
                value={form.max_workspaces}
                onChange={(e) => setForm({ ...form, max_workspaces: parseInt(e.target.value || "10") })}
                placeholder="10"
              />
              <p className="text-xs text-muted-foreground">-1 for unlimited</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="is_active"
              checked={form.is_active}
              onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
            />
            <Label htmlFor="is_active">Active (visible to agencies)</Label>
          </div>

          {form.monthly_price_cents > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Stripe auto-sync:</strong> A Stripe Product and monthly Price will be
                automatically created when you save this plan.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Plan"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// EDIT PLAN DIALOG
// =============================================================================

function EditPlanDialog({
  variant,
  open,
  onOpenChange,
}: {
  variant: WhiteLabelVariantWithUsage | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const updateMutation = useUpdateWhiteLabelVariant()

  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    monthly_price_cents: 0,
    max_workspaces: 10,
    is_active: true,
    sort_order: 0,
  })

  // Update form when variant changes
  useState(() => {
    if (variant) {
      setForm({
        name: variant.name,
        slug: variant.slug,
        description: variant.description || "",
        monthly_price_cents: variant.monthlyPriceCents,
        max_workspaces: variant.maxWorkspaces,
        is_active: variant.isActive,
        sort_order: variant.sortOrder,
      })
    }
  })

  // Reset form when dialog opens with new variant
  if (variant && form.name !== variant.name && form.slug !== variant.slug) {
    setForm({
      name: variant.name,
      slug: variant.slug,
      description: variant.description || "",
      monthly_price_cents: variant.monthlyPriceCents,
      max_workspaces: variant.maxWorkspaces,
      is_active: variant.isActive,
      sort_order: variant.sortOrder,
    })
  }

  const handleSubmit = async () => {
    if (!variant) return
    if (!form.name || !form.slug) {
      toast.error("Name and slug are required")
      return
    }

    try {
      await updateMutation.mutateAsync({ id: variant.id, data: form })
      toast.success("Plan updated successfully")
      onOpenChange(false)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update plan"
      toast.error(errorMessage)
    }
  }

  const priceChanged = variant && form.monthly_price_cents !== variant.monthlyPriceCents

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Plan: {variant?.name}</DialogTitle>
          <DialogDescription>
            Update plan details. Price changes will update Stripe automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Plan Name</Label>
              <Input
                id="edit-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Growth"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-slug">Slug</Label>
              <Input
                id="edit-slug"
                value={form.slug}
                onChange={(e) =>
                  setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })
                }
                placeholder="e.g., growth"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Plan description..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-price">Monthly Price ($)</Label>
              <Input
                id="edit-price"
                type="number"
                min="0"
                value={form.monthly_price_cents / 100}
                onChange={(e) =>
                  setForm({ ...form, monthly_price_cents: Math.round(parseFloat(e.target.value || "0") * 100) })
                }
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-workspaces">Max Workspaces</Label>
              <Input
                id="edit-workspaces"
                type="number"
                min="-1"
                value={form.max_workspaces}
                onChange={(e) => setForm({ ...form, max_workspaces: parseInt(e.target.value || "10") })}
                placeholder="10"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="edit-is_active"
              checked={form.is_active}
              onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
            />
            <Label htmlFor="edit-is_active">Active (visible to agencies)</Label>
          </div>

          {priceChanged && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Price change detected:</strong> The old Stripe price will be archived and a
                new one created. Existing subscribers keep their current price until renewal.
              </p>
            </div>
          )}

          {(variant?.partnerCount ?? 0) > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>{variant?.partnerCount} agencies</strong> are currently on this plan.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// DELETE PLAN DIALOG
// =============================================================================

function DeletePlanDialog({
  variant,
  open,
  onOpenChange,
}: {
  variant: WhiteLabelVariantWithUsage | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const deleteMutation = useDeleteWhiteLabelVariant()

  const handleDelete = async () => {
    if (!variant) return

    try {
      await deleteMutation.mutateAsync(variant.id)
      toast.success("Plan deleted")
      onOpenChange(false)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete plan"
      toast.error(errorMessage)
    }
  }

  const hasPartners = (variant?.partnerCount ?? 0) > 0

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Plan: {variant?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasPartners ? (
              <span className="text-destructive">
                This plan has {variant?.partnerCount} agencies subscribed. You must reassign or
                remove them before deleting this plan.
              </span>
            ) : (
              <>
                This will permanently delete the plan and archive its Stripe product/price. This
                action cannot be undone.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteMutation.isPending || hasPartners}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Plan"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
