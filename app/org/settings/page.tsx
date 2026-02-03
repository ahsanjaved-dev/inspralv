"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useAuthContext } from "@/lib/hooks/use-auth"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { 
  Building2, 
  Shield, 
  Palette,
  Crown,
  Upload,
  X,
  Loader2,
  Save,
  RotateCcw
} from "lucide-react"

interface BrandingData {
  logo_url?: string | null
  favicon_url?: string | null
  primary_color?: string
  secondary_color?: string
  company_name?: string
  background_color?: string
  text_color?: string
}

export default function OrgSettingsPage() {
  const { data: authContext, refetch: refetchAuth } = useAuthContext()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const partner = authContext?.partner
  const partnerRole = authContext?.partnerMembership?.role
  const isPlatformPartner = partner?.is_platform_partner

  // Branding form state
  const [branding, setBranding] = useState<BrandingData>({
    logo_url: partner?.branding?.logo_url || null,
    primary_color: partner?.branding?.primary_color || "#5c1fea",
    secondary_color: partner?.branding?.secondary_color || "#64748b",
    company_name: partner?.branding?.company_name || partner?.name || "",
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Update branding state when partner data loads
  useEffect(() => {
    if (partner?.branding) {
      setBranding({
        logo_url: partner.branding.logo_url || null,
        primary_color: partner.branding.primary_color || "#5c1fea",
        secondary_color: partner.branding.secondary_color || "#64748b",
        company_name: partner.branding.company_name || partner.name || "",
      })
      setHasChanges(false)
    }
  }, [partner])

  // Update branding mutation
  const updateBranding = useMutation({
    mutationFn: async (brandingData: BrandingData) => {
      const res = await fetch("/api/partner", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branding: brandingData }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to update branding")
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success("Branding updated successfully")
      setHasChanges(false)
      // Refetch auth context to get updated branding
      refetchAuth()
      queryClient.invalidateQueries({ queryKey: ["auth"] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Handle logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Only PNG, JPG, SVG, and WebP are allowed")
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size too large. Maximum size is 5MB")
      return
    }

    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/upload/logo", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to upload logo")
      }

      const data = await res.json()
      setBranding(prev => ({ ...prev, logo_url: data.url }))
      setHasChanges(true)
      toast.success("Logo uploaded successfully")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload logo")
    } finally {
      setUploadingLogo(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  // Handle removing logo
  const handleRemoveLogo = () => {
    setBranding(prev => ({ ...prev, logo_url: null }))
    setHasChanges(true)
  }

  // Handle form field changes
  const handleChange = (field: keyof BrandingData, value: string) => {
    setBranding(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }

  // Handle save
  const handleSave = () => {
    updateBranding.mutate(branding)
  }

  // Handle reset
  const handleReset = () => {
    if (partner?.branding) {
      setBranding({
        logo_url: partner.branding.logo_url || null,
        primary_color: partner.branding.primary_color || "#5c1fea",
        secondary_color: partner.branding.secondary_color || "#64748b",
        company_name: partner.branding.company_name || partner.name || "",
      })
      setHasChanges(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Organization Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your organization settings and branding
          </p>
        </div>
        {isPlatformPartner && (
          <Badge className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-0">
            <Crown className="h-3 w-3 mr-1" />
            Platform Partner
          </Badge>
        )}
      </div>

      {/* Organization Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization Details
          </CardTitle>
          <CardDescription>Basic information about your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Organization Name</p>
              <p className="text-lg font-semibold">{partner?.name || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Your Role</p>
              <Badge variant="outline" className="mt-1 capitalize">
                <Shield className="h-3 w-3 mr-1" />
                {partnerRole || "—"}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Slug</p>
              <p className="font-mono text-sm bg-muted px-2 py-1 rounded inline-block">{partner?.slug || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Plan</p>
              <Badge 
                variant="secondary" 
                className={isPlatformPartner ? "bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30" : "capitalize"}
              >
                {isPlatformPartner ? "Platform" : (partner?.plan_tier || "—")}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branding Editor */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Branding Editor
              </CardTitle>
              <CardDescription>Customize your organization's branding</CardDescription>
            </div>
            {hasChanges && (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">
                Unsaved Changes
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logo Upload */}
          <div className="space-y-3">
            <Label>Logo</Label>
            <div className="flex items-start gap-4">
              {/* Logo Preview */}
              <div className="relative">
                {branding.logo_url ? (
                  <div className="relative group">
                    <img 
                      src={branding.logo_url} 
                      alt="Logo" 
                      className="h-20 w-auto max-w-[200px] object-contain rounded-lg border p-2 bg-muted/30"
                    />
                    <button
                      onClick={handleRemoveLogo}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div 
                    className="h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center"
                    style={{ backgroundColor: branding.primary_color + "20" }}
                  >
                    <span 
                      className="text-2xl font-bold"
                      style={{ color: branding.primary_color }}
                    >
                      {branding.company_name?.[0] || partner?.name?.[0] || "?"}
                    </span>
                  </div>
                )}
              </div>

              {/* Upload Button */}
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="mb-2"
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {uploadingLogo ? "Uploading..." : "Upload Logo"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, SVG, or WebP. Max 5MB. Recommended: 200x50px
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Company Name */}
          <div className="space-y-2">
            <Label htmlFor="company_name">Company Name</Label>
            <Input
              id="company_name"
              value={branding.company_name || ""}
              onChange={(e) => handleChange("company_name", e.target.value)}
              placeholder="Enter company name"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              This name will be displayed throughout the platform
            </p>
          </div>

          <Separator />

          {/* Colors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primary Color */}
            <div className="space-y-2">
              <Label htmlFor="primary_color">Primary Color</Label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="color"
                    id="primary_color"
                    value={branding.primary_color || "#5c1fea"}
                    onChange={(e) => handleChange("primary_color", e.target.value)}
                    className="w-12 h-12 rounded-lg border cursor-pointer"
                    style={{ padding: 0 }}
                  />
                </div>
                <Input
                  value={branding.primary_color || "#5c1fea"}
                  onChange={(e) => {
                    const value = e.target.value
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                      handleChange("primary_color", value)
                    }
                  }}
                  placeholder="#5c1fea"
                  className="font-mono w-32"
                  maxLength={7}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Used for buttons, links, and accents
              </p>
            </div>

            {/* Secondary Color */}
            <div className="space-y-2">
              <Label htmlFor="secondary_color">Secondary Color</Label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="color"
                    id="secondary_color"
                    value={branding.secondary_color || "#64748b"}
                    onChange={(e) => handleChange("secondary_color", e.target.value)}
                    className="w-12 h-12 rounded-lg border cursor-pointer"
                    style={{ padding: 0 }}
                  />
                </div>
                <Input
                  value={branding.secondary_color || "#64748b"}
                  onChange={(e) => {
                    const value = e.target.value
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                      handleChange("secondary_color", value)
                    }
                  }}
                  placeholder="#64748b"
                  className="font-mono w-32"
                  maxLength={7}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Used for secondary elements and borders
              </p>
            </div>
          </div>

          <Separator />

          {/* Preview */}
          <div className="space-y-3">
            <Label>Preview</Label>
            <div 
              className="rounded-lg border p-6"
              style={{ 
                background: `linear-gradient(135deg, ${branding.primary_color}10 0%, ${branding.secondary_color}10 100%)`,
                borderColor: branding.primary_color + "30"
              }}
            >
              <div className="flex items-center gap-4 mb-4">
                {branding.logo_url ? (
                  <img 
                    src={branding.logo_url} 
                    alt="Logo Preview" 
                    className="h-10 object-contain"
                  />
                ) : (
                  <div 
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: branding.primary_color }}
                  >
                    {branding.company_name?.[0] || "?"}
                  </div>
                )}
                <span className="font-semibold text-lg">{branding.company_name || "Company Name"}</span>
              </div>
              <div className="flex gap-3">
                <Button 
                  size="sm"
                  style={{ 
                    backgroundColor: branding.primary_color,
                    color: "white"
                  }}
                >
                  Primary Button
                </Button>
                <Button 
                  size="sm"
                  variant="outline"
                  style={{ 
                    borderColor: branding.primary_color,
                    color: branding.primary_color
                  }}
                >
                  Secondary Button
                </Button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges || updateBranding.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateBranding.isPending}
            >
              {updateBranding.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {updateBranding.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
