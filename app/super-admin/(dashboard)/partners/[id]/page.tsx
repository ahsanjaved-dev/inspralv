"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import {
  ArrowLeft,
  Loader2,
  Globe,
  Building2,
  Users,
  Bot,
  Trash2,
  Plus,
  Check,
  X,
  Save,
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
  const updatePartner = useUpdatePartner()
  const deletePartner = useDeletePartner()
  const addDomain = useAddPartnerDomain()
  const deleteDomain = useDeletePartnerDomain()

  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [primaryColor, setPrimaryColor] = useState("")
  const [newDomain, setNewDomain] = useState("")

  // Initialize edit form when partner loads
  const initEditForm = () => {
    if (partner) {
      setName(partner.name)
      setCompanyName(partner.branding?.company_name || "")
      setPrimaryColor(partner.branding?.primary_color || "#7c3aed")
      setEditMode(true)
    }
  }

  const handleSave = async () => {
    try {
      await updatePartner.mutateAsync({
        id: partnerId,
        data: {
          name,
          branding: {
            ...partner?.branding,
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
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    )
  }

  if (error || !partner) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">Partner not found</p>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/super-admin/partners">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: partner.branding?.primary_color || "#7c3aed" }}
            >
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{partner.name}</h1>
              <p className="text-slate-400">/{partner.slug}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {partner.is_platform_partner && (
            <Badge className="bg-violet-500/20 text-violet-400">Platform Partner</Badge>
          )}
          <Badge variant="outline" className="text-slate-300">
            {partner.plan_tier}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6 flex items-center gap-4">
            <Building2 className="h-8 w-8 text-blue-400" />
            <div>
              <div className="text-2xl font-bold text-white">{partner.workspace_count || 0}</div>
              <p className="text-sm text-slate-400">Workspaces</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6 flex items-center gap-4">
            <Globe className="h-8 w-8 text-green-400" />
            <div>
              <div className="text-2xl font-bold text-white">
                {partner.partner_domains?.length || 0}
              </div>
              <p className="text-sm text-slate-400">Domains</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6 flex items-center gap-4">
            <Users className="h-8 w-8 text-purple-400" />
            <div>
              <div className="text-2xl font-bold text-white">
                {workspaces.reduce((sum, w) => sum + (w.member_count || 0), 0)}
              </div>
              <p className="text-sm text-slate-400">Total Users</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6 flex items-center gap-4">
            <Bot className="h-8 w-8 text-orange-400" />
            <div>
              <div className="text-2xl font-bold text-white">
                {workspaces.reduce((sum, w) => sum + (w.agent_count || 0), 0)}
              </div>
              <p className="text-sm text-slate-400">Total Agents</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Partner Settings */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-white">Partner Settings</CardTitle>
              <CardDescription className="text-slate-400">
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
                  <Label className="text-slate-300">Partner Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-slate-900 border-slate-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Display Name</Label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="bg-slate-900 border-slate-600 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Primary Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-14 rounded border border-slate-600"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 bg-slate-900 border-slate-600 text-white"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Display Name</span>
                  <span className="text-white">
                    {partner.branding?.company_name || partner.name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Primary Color</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: partner.branding?.primary_color || "#7c3aed" }}
                    />
                    <span className="text-white">
                      {partner.branding?.primary_color || "#7c3aed"}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Created</span>
                  <span className="text-white">
                    {formatDistanceToNow(new Date(partner.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            )}

            {!partner.is_platform_partner && (
              <div className="pt-4 border-t border-slate-700">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="w-full">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Partner
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-slate-800 border-slate-700">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-white">Delete Partner?</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-400">
                        This will permanently delete the partner and all associated data. This
                        action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-red-500 hover:bg-red-600"
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
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Domains</CardTitle>
            <CardDescription className="text-slate-400">Manage partner hostnames</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="app.example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="bg-slate-900 border-slate-600 text-white"
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
                  className="flex items-center justify-between p-3 bg-slate-900 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-slate-400" />
                    <span className="text-white">{domain.hostname}</span>
                    {domain.is_primary && (
                      <Badge variant="outline" className="text-green-400 border-green-500/30">
                        Primary
                      </Badge>
                    )}
                    {domain.verified_at && <Check className="h-4 w-4 text-green-400" />}
                  </div>
                  {!domain.is_primary && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-400 hover:text-red-300"
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

      {/* Workspaces */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Workspaces</CardTitle>
          <CardDescription className="text-slate-400">
            All workspaces under this partner
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workspaces.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No workspaces yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-400">Workspace</TableHead>
                  <TableHead className="text-slate-400">Members</TableHead>
                  <TableHead className="text-slate-400">Agents</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspaces.map((ws) => (
                  <TableRow key={ws.id} className="border-slate-700">
                    <TableCell>
                      <div>
                        <p className="text-white font-medium">{ws.name}</p>
                        <p className="text-sm text-slate-500">/{ws.slug}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-white">{ws.member_count}</TableCell>
                    <TableCell className="text-white">{ws.agent_count}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-green-400 border-green-500/30">
                        {ws.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {formatDistanceToNow(new Date(ws.created_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
