"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import type { PartnerBranding } from "@/types/database.types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  useSuperAdminPartner,
  useUpdatePartner,
  useDeletePartner,
  usePartnerWorkspaces,
  useAddPartnerDomain,
  useDeletePartnerDomain,
} from "@/lib/hooks/use-super-admin-partners"
import { useWhiteLabelVariants } from "@/lib/hooks/use-white-label-variants"
import {
  ArrowLeft,
  Loader2,
  Globe,
  Building2,
  Users,
  Trash2,
  Plus,
  Check,
  X,
  Save,
  LayoutGrid,
  Clock,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

export default function PartnerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const partnerId = params.id as string

  const { data: partner, isLoading, error } = useSuperAdminPartner(partnerId)
  const { data: workspacesData } = usePartnerWorkspaces(partnerId)
  const { data: variants } = useWhiteLabelVariants(false)
  const updatePartner = useUpdatePartner()
  const deletePartner = useDeletePartner()
  const addDomain = useAddPartnerDomain()
  const deleteDomain = useDeletePartnerDomain()

  // Helper to get plan display name from variant ID or plan_tier
  const getPlanDisplayName = (variantId: string | null | undefined, planTier: string | null | undefined) => {
    // First try to find by variant ID (preferred)
    if (variantId) {
      const variant = variants?.find((v) => v.id === variantId)
      if (variant) return variant.name
    }
    // Fallback to plan_tier matching
    if (planTier && planTier !== "partner") {
      const variant = variants?.find(
        (v) => v.slug.toLowerCase() === planTier.toLowerCase() || 
               v.name.toLowerCase() === planTier.toLowerCase()
      )
      if (variant) return variant.name
    }
    return "No Plan"
  }

  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [primaryColor, setPrimaryColor] = useState("")
  const [newDomain, setNewDomain] = useState("")

  // Initialize edit form when partner loads
  const initEditForm = () => {
    if (partner) {
      const partnerBranding = (partner.branding || {}) as PartnerBranding
      setName(partner.name)
      setCompanyName(partnerBranding.company_name || "")
      setPrimaryColor(partnerBranding.primary_color || "#7c3aed")
      setEditMode(true)
    }
  }

  const handleSave = async () => {
    try {
      const partnerBranding = (partner?.branding || {}) as PartnerBranding
      await updatePartner.mutateAsync({
        id: partnerId,
        data: {
          name,
          branding: {
            ...partnerBranding,
            company_name: companyName,
            primary_color: primaryColor,
          },
        },
      })
      toast.success("Partner updated successfully")
      setEditMode(false)
    } catch (error: any) {
      toast.error(error.message || "Failed to update partner")
    }
  }

  const handleDelete = async () => {
    try {
      await deletePartner.mutateAsync(partnerId)
      toast.success("Partner deleted")
      router.push("/super-admin/partners")
    } catch (error: any) {
      toast.error(error.message || "Failed to delete partner")
    }
  }

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return
    try {
      await addDomain.mutateAsync({ partnerId, hostname: newDomain.trim() })
      toast.success("Domain added")
      setNewDomain("")
    } catch (error: any) {
      toast.error(error.message || "Failed to add domain")
    }
  }

  const handleDeleteDomain = async (domainId: string) => {
    try {
      await deleteDomain.mutateAsync({ partnerId, domainId })
      toast.success("Domain removed")
    } catch (error: any) {
      toast.error(error.message || "Failed to remove domain")
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !partner) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive">Partner not found</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/super-admin/partners">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Partners
          </Link>
        </Button>
      </div>
    )
  }

  const workspaces = workspacesData?.data || []
  const branding = (partner.branding || {}) as PartnerBranding

  return (
    <div className="space-y-6">
      {/* Page Header - Genius style */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/super-admin/partners">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{partner.name}</h1>
            <p className="text-muted-foreground mt-1">
              {partner.slug} • {getPlanDisplayName(partner.white_label_variant_id, partner.plan_tier)}
              {partner.is_platform_partner && " • Platform Partner"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {partner.is_platform_partner && (
            <Badge className="bg-primary/10 text-primary">Platform Partner</Badge>
          )}
          <Badge variant="outline" className="text-foreground">
            {getPlanDisplayName(partner.white_label_variant_id, partner.plan_tier)}
          </Badge>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Workspaces</p>
                <p className="text-3xl font-bold tracking-tight text-foreground">{partner.workspace_count || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <LayoutGrid className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Domains</p>
                <p className="text-3xl font-bold tracking-tight text-foreground">{partner.partner_domains?.length || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Globe className="w-6 h-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-3xl font-bold tracking-tight text-foreground">
                  {workspaces.reduce((sum, w) => sum + (w.member_count || 0), 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Partner Settings */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">Partner Settings</CardTitle>
              <CardDescription className="text-muted-foreground">
                Manage partner branding and configuration
              </CardDescription>
            </div>
            {!editMode ? (
              <Button variant="outline" size="sm" onClick={initEditForm}>
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>
                  <X className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={handleSave} disabled={updatePartner.isPending}>
                  {updatePartner.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {editMode ? (
              <>
                <div className="space-y-2">
                  <Label className="text-foreground">Partner Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-background border-input text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Display Name</Label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="bg-background border-input text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Primary Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-14 rounded border border-input"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 bg-background border-input text-foreground"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Display Name</span>
                  <span className="text-foreground">
                    {branding.company_name || partner.name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Primary Color</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: branding.primary_color || "#7c3aed" }}
                    />
                    <span className="text-foreground">
                      {branding.primary_color || "#7c3aed"}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-foreground">
                    {formatDistanceToNow(new Date(partner.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            )}

            {!partner.is_platform_partner && (
              <div className="pt-4 border-t border-border">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="w-full">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Partner
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Partner?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the partner and all associated data. This
                        action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Domains */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground">Domains</CardTitle>
            <CardDescription className="text-muted-foreground">Manage partner hostnames</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="app.example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="bg-background border-input text-foreground"
              />
              <Button onClick={handleAddDomain} disabled={addDomain.isPending || !newDomain.trim()}>
                {addDomain.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="space-y-2">
              {partner.partner_domains?.map((domain) => (
                <div
                  key={domain.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-foreground">{domain.hostname}</span>
                    {domain.is_primary && (
                      <Badge variant="outline" className="text-secondary border-secondary/30">
                        Primary
                      </Badge>
                    )}
                    {domain.verified_at && <Check className="h-4 w-4 text-secondary" />}
                  </div>
                  {!domain.is_primary && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive/80"
                      onClick={() => handleDeleteDomain(domain.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workspaces Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-foreground">Workspaces</CardTitle>
            <span className="text-xs text-muted-foreground">All workspaces under this partner</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {workspaces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No workspaces yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Workspace</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Members</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground bg-muted/50 border-b border-border">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {workspaces.map((ws) => (
                    <tr key={ws.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4">
                        <p className="text-foreground font-medium">{ws.name}</p>
                        <p className="text-xs text-muted-foreground">/{ws.slug}</p>
                      </td>
                      <td className="py-3 px-4 text-center text-foreground font-medium">{ws.member_count}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          {ws.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {formatDistanceToNow(new Date(ws.created_at), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
