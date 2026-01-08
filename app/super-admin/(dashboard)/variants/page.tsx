"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Package,
  Building2,
  DollarSign,
  Layers,
} from "lucide-react"
import { toast } from "sonner"
import {
  useWhiteLabelVariants,
  useCreateWhiteLabelVariant,
  useUpdateWhiteLabelVariant,
  useDeleteWhiteLabelVariant,
  type WhiteLabelVariantWithUsage,
} from "@/lib/hooks/use-white-label-variants"

interface VariantFormData {
  slug: string
  name: string
  description: string
  monthly_price_cents: number
  stripe_price_id: string
  max_workspaces: number
  is_active: boolean
  sort_order: number
}

const defaultFormData: VariantFormData = {
  slug: "",
  name: "",
  description: "",
  monthly_price_cents: 0,
  stripe_price_id: "",
  max_workspaces: 10,
  is_active: true,
  sort_order: 0,
}

export default function SuperAdminVariantsPage() {
  const [includeInactive, setIncludeInactive] = useState(false)
  const { data: variants, isLoading, error } = useWhiteLabelVariants(includeInactive)
  const createVariant = useCreateWhiteLabelVariant()
  const updateVariant = useUpdateWhiteLabelVariant()
  const deleteVariant = useDeleteWhiteLabelVariant()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<WhiteLabelVariantWithUsage | null>(null)
  const [formData, setFormData] = useState<VariantFormData>(defaultFormData)

  const handleCreate = async () => {
    try {
      await createVariant.mutateAsync(formData)
      toast.success("Variant created successfully")
      setCreateDialogOpen(false)
      setFormData(defaultFormData)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create variant")
    }
  }

  const handleUpdate = async () => {
    if (!selectedVariant) return
    try {
      await updateVariant.mutateAsync({
        id: selectedVariant.id,
        data: formData,
      })
      toast.success("Variant updated successfully")
      setEditDialogOpen(false)
      setSelectedVariant(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update variant")
    }
  }

  const handleDelete = async () => {
    if (!selectedVariant) return
    try {
      await deleteVariant.mutateAsync(selectedVariant.id)
      toast.success("Variant deleted successfully")
      setDeleteDialogOpen(false)
      setSelectedVariant(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete variant")
    }
  }

  const openEditDialog = (variant: WhiteLabelVariantWithUsage) => {
    setSelectedVariant(variant)
    setFormData({
      slug: variant.slug,
      name: variant.name,
      description: variant.description || "",
      monthly_price_cents: variant.monthly_price_cents,
      stripe_price_id: variant.stripe_price_id || "",
      max_workspaces: variant.max_workspaces,
      is_active: variant.is_active,
      sort_order: variant.sort_order,
    })
    setEditDialogOpen(true)
  }

  const openDeleteDialog = (variant: WhiteLabelVariantWithUsage) => {
    setSelectedVariant(variant)
    setDeleteDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            White-Label Variants
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage pricing tiers and workspace limits for white-label agencies
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="include-inactive"
              checked={includeInactive}
              onCheckedChange={setIncludeInactive}
            />
            <Label htmlFor="include-inactive" className="text-sm">
              Show inactive
            </Label>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Variant
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Variants</p>
                <p className="text-3xl font-bold">{variants?.length || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Package className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Variants</p>
                <p className="text-3xl font-bold">
                  {variants?.filter((v) => v.is_active).length || 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <Layers className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Partners Using</p>
                <p className="text-3xl font-bold">
                  {variants?.reduce((sum, v) => sum + v.partnerCount, 0) || 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Variants List */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Variants</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="p-6 text-center text-destructive">
              Failed to load variants. Please try again.
            </div>
          ) : !variants || variants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-4 bg-primary/10 rounded-full mb-4">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No variants yet</h3>
              <p className="text-muted-foreground text-center max-w-sm mt-2">
                Create your first white-label variant to define pricing tiers for agencies.
              </p>
              <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Variant
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b">
                      Variant
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b">
                      Price
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b">
                      Workspaces
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b">
                      Partners
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b">
                      Status
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((variant) => (
                    <tr
                      key={variant.id}
                      className="border-b hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{variant.name}</p>
                          <p className="text-xs text-muted-foreground">{variant.slug}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span>{(variant.monthly_price_cents / 100).toFixed(0)}/mo</span>
                        </div>
                        {variant.stripe_price_id && (
                          <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {variant.stripe_price_id}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {variant.max_workspaces === -1 ? (
                          <Badge variant="secondary">Unlimited</Badge>
                        ) : (
                          <span>{variant.max_workspaces}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{variant.partnerCount}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={variant.is_active ? "default" : "secondary"}>
                          {variant.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(variant)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(variant)}
                            disabled={variant.partnerCount > 0}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Variant</DialogTitle>
            <DialogDescription>
              Add a new white-label pricing tier for agencies
            </DialogDescription>
          </DialogHeader>
          <VariantForm formData={formData} setFormData={setFormData} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createVariant.isPending}>
              {createVariant.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Variant</DialogTitle>
            <DialogDescription>Update the variant settings</DialogDescription>
          </DialogHeader>
          <VariantForm formData={formData} setFormData={setFormData} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateVariant.isPending}>
              {updateVariant.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{selectedVariant?.name}&quot;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteVariant.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Form component
function VariantForm({
  formData,
  setFormData,
}: {
  formData: VariantFormData
  setFormData: (data: VariantFormData) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Growth"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) =>
              setFormData({
                ...formData,
                slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
              })
            }
            placeholder="growth"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="For growing agencies..."
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
            value={formData.monthly_price_cents / 100}
            onChange={(e) =>
              setFormData({
                ...formData,
                monthly_price_cents: Math.round(parseFloat(e.target.value || "0") * 100),
              })
            }
            placeholder="299"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max_workspaces">Max Workspaces</Label>
          <Input
            id="max_workspaces"
            type="number"
            min="-1"
            value={formData.max_workspaces}
            onChange={(e) =>
              setFormData({
                ...formData,
                max_workspaces: parseInt(e.target.value || "10"),
              })
            }
            placeholder="10 (-1 for unlimited)"
          />
          <p className="text-xs text-muted-foreground">Use -1 for unlimited</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stripe_price_id">Stripe Price ID</Label>
        <Input
          id="stripe_price_id"
          value={formData.stripe_price_id}
          onChange={(e) => setFormData({ ...formData, stripe_price_id: e.target.value })}
          placeholder="price_1234..."
        />
        <p className="text-xs text-muted-foreground">
          Create a price in Stripe Dashboard and paste the ID here
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sort_order">Sort Order</Label>
          <Input
            id="sort_order"
            type="number"
            value={formData.sort_order}
            onChange={(e) =>
              setFormData({ ...formData, sort_order: parseInt(e.target.value || "0") })
            }
            placeholder="0"
          />
        </div>
        <div className="flex items-center justify-between pt-6">
          <Label htmlFor="is_active">Active</Label>
          <Switch
            id="is_active"
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
          />
        </div>
      </div>
    </div>
  )
}

