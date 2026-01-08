"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useEditPartnerRequest, type EditPartnerRequestData } from "@/lib/hooks/use-partner-requests"
import { useWhiteLabelVariants } from "@/lib/hooks/use-white-label-variants"
import { Loader2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { HexColorPicker } from "react-colorful"
import type { PartnerRequest, PartnerBranding } from "@/types/database.types"

interface EditPartnerRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: PartnerRequest
  onSuccess?: () => void
}

export function EditPartnerRequestDialog({
  open,
  onOpenChange,
  request,
  onSuccess,
}: EditPartnerRequestDialogProps) {
  const editMutation = useEditPartnerRequest()
  const { data: variants } = useWhiteLabelVariants()
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Helper to get branding data safely
  const getBrandingData = () => {
    const brandingData = (request.branding_data || {}) as PartnerBranding
    return {
      logo_url: brandingData.logo_url || "",
      primary_color: brandingData.primary_color || "#7c3aed",
      secondary_color: brandingData.secondary_color || "#64748b",
      company_name: brandingData.company_name || request.company_name,
    }
  }

  // Initialize form data from request
  const [formData, setFormData] = useState<EditPartnerRequestData>({
    company_name: request.company_name,
    contact_name: request.contact_name,
    contact_email: request.contact_email,
    phone: request.phone || "",
    custom_domain: request.custom_domain || "",
    desired_subdomain: request.desired_subdomain || "",
    business_description: request.business_description || "",
    expected_users: request.expected_users || null,
    use_case: request.use_case || "",
    selected_plan: request.selected_plan || "partner",
    assigned_white_label_variant_id: (request as { assigned_white_label_variant_id?: string | null }).assigned_white_label_variant_id || null,
    branding_data: getBrandingData(),
  })

  // Update form when request changes
  useEffect(() => {
    setFormData({
      company_name: request.company_name,
      contact_name: request.contact_name,
      contact_email: request.contact_email,
      phone: request.phone || "",
      custom_domain: request.custom_domain || "",
      desired_subdomain: request.desired_subdomain || "",
      business_description: request.business_description || "",
      expected_users: request.expected_users || null,
      use_case: request.use_case || "",
      selected_plan: request.selected_plan || "partner",
      assigned_white_label_variant_id: (request as { assigned_white_label_variant_id?: string | null }).assigned_white_label_variant_id || null,
      branding_data: getBrandingData(),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Only PNG, JPG, SVG, and WebP are allowed")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size too large. Maximum size is 5MB")
      return
    }

    setUploadingLogo(true)
    try {
      const formDataUpload = new FormData()
      formDataUpload.append("file", file)

      const res = await fetch("/api/upload/logo", {
        method: "POST",
        body: formDataUpload,
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || "Failed to upload logo")
      }

      const uploadData = result.data || result
      setFormData({
        ...formData,
        branding_data: {
          ...formData.branding_data,
          logo_url: uploadData.url,
        },
      })
      toast.success("Logo uploaded successfully!")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload logo")
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleRemoveLogo = () => {
    setFormData({
      ...formData,
      branding_data: {
        ...formData.branding_data,
        logo_url: "",
      },
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await editMutation.mutateAsync({
        requestId: request.id,
        data: formData,
      })
      toast.success("Partner request updated successfully")
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update partner request")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Partner Request</DialogTitle>
          <DialogDescription>
            Update the details of this partner request. Changes will be saved immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Company & Contact Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Company & Contact
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_name">Contact Name</Label>
                <Input
                  id="contact_name"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_email">Email</Label>
                <Input
                  id="contact_email"
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone || ""}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value || null })}
                />
              </div>
            </div>
          </div>

          {/* Domain & Plan Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Domain & Plan
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="custom_domain">Custom Domain</Label>
                <Input
                  id="custom_domain"
                  value={formData.custom_domain}
                  onChange={(e) => setFormData({ ...formData, custom_domain: e.target.value })}
                  required
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desired_subdomain">Subdomain Slug</Label>
                <Input
                  id="desired_subdomain"
                  value={formData.desired_subdomain}
                  onChange={(e) => setFormData({ ...formData, desired_subdomain: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="selected_plan">Partner Tier</Label>
                <Select
                  value={formData.selected_plan}
                  onValueChange={(value: string) =>
                    setFormData({ ...formData, selected_plan: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="partner">White-Label Partner</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  All white-label partners receive "partner" tier
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="white_label_variant">Plan Variant</Label>
                <Select
                  value={formData.assigned_white_label_variant_id || "none"}
                  onValueChange={(value: string) =>
                    setFormData({ 
                      ...formData, 
                      assigned_white_label_variant_id: value === "none" ? null : value 
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select variant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No variant assigned</SelectItem>
                    {variants?.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        {variant.name} - ${(variant.monthly_price_cents / 100).toFixed(0)}/mo ({variant.max_workspaces === -1 ? "Unlimited" : variant.max_workspaces} workspaces)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Assign a pricing variant before provisioning
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected_users">Expected Users</Label>
                <Input
                  id="expected_users"
                  type="number"
                  value={formData.expected_users || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      expected_users: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                />
              </div>
            </div>
          </div>

          {/* Business Details Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Business Details
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="business_description">Business Description</Label>
                <Textarea
                  id="business_description"
                  value={formData.business_description}
                  onChange={(e) =>
                    setFormData({ ...formData, business_description: e.target.value })
                  }
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="use_case">Use Case</Label>
                <Textarea
                  id="use_case"
                  value={formData.use_case}
                  onChange={(e) => setFormData({ ...formData, use_case: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          </div>

          {/* Branding Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Branding
            </h3>

            {/* Logo Upload */}
            <div className="space-y-2">
              <Label>Company Logo</Label>
              {formData.branding_data?.logo_url ? (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-center bg-muted rounded-lg p-4 min-h-[80px]">
                    <img
                      src={formData.branding_data.logo_url}
                      alt="Company logo"
                      className="max-h-16 max-w-full object-contain"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveLogo}
                    className="w-full"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Remove Logo
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                  <div className="space-y-2">
                    <div className="flex justify-center">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <Label
                      htmlFor="logo_upload_edit"
                      className="cursor-pointer text-primary hover:underline font-medium text-sm"
                    >
                      Click to upload logo
                    </Label>
                    <Input
                      id="logo_upload_edit"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                      className="hidden"
                    />
                    {uploadingLogo && (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Primary Color</Label>
                <HexColorPicker
                  color={formData.branding_data?.primary_color || "#7c3aed"}
                  onChange={(color) =>
                    setFormData({
                      ...formData,
                      branding_data: { ...formData.branding_data, primary_color: color },
                    })
                  }
                  style={{ width: "100%", height: "120px" }}
                />
                <Input
                  value={formData.branding_data?.primary_color || "#7c3aed"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      branding_data: { ...formData.branding_data, primary_color: e.target.value },
                    })
                  }
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Secondary Color</Label>
                <HexColorPicker
                  color={formData.branding_data?.secondary_color || "#64748b"}
                  onChange={(color) =>
                    setFormData({
                      ...formData,
                      branding_data: { ...formData.branding_data, secondary_color: color },
                    })
                  }
                  style={{ width: "100%", height: "120px" }}
                />
                <Input
                  value={formData.branding_data?.secondary_color || "#64748b"}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      branding_data: {
                        ...formData.branding_data,
                        secondary_color: e.target.value,
                      },
                    })
                  }
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={editMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={editMutation.isPending}>
              {editMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

