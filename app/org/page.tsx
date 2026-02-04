"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  usePartnerTeam,
  useUpdatePartnerMemberRole,
  useRemovePartnerMember,
  type PartnerTeamMember,
} from "@/lib/hooks/use-partner-team"
import { usePartnerWorkspaces, type PartnerWorkspace } from "@/lib/hooks/use-partner-workspaces"
import { AssignWorkspaceDialog } from "@/components/org/assign-workspace-dialog"
import { WorkspaceIntegrationsDialog } from "@/components/org/integrations/workspace-integrations-dialog"
import { useAuthContext } from "@/lib/hooks/use-auth"
import {
  Users,
  Loader2,
  MoreVertical,
  RefreshCw,
  Pencil,
  Trash2,
  Crown,
  Shield,
  UserCheck,
  UserPlus,
  Search,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Bot,
  FolderPlus,
  Eye,
  Plug,
} from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"
import { cn } from "@/lib/utils"

const roleColors: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  member: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
}

const workspaceRoleColors: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  member: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  viewer: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
}

const roleIcons: Record<string, React.ElementType> = {
  owner: Crown,
  admin: Shield,
  member: UserCheck,
}

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

function getWorkspaceGradient(str: string): string {
  const gradients = [
    "from-violet-500 to-purple-600",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-orange-500 to-amber-500",
    "from-pink-500 to-rose-500",
    "from-indigo-500 to-blue-500",
    "from-cyan-500 to-teal-500",
    "from-fuchsia-500 to-pink-500",
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return gradients[Math.abs(hash) % gradients.length] ?? "from-violet-500 to-purple-600"
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

type TabType = "members" | "workspaces"

export default function OrgOverviewPage() {
  const [activeTab, setActiveTab] = useState<TabType>("members")
  const [editMember, setEditMember] = useState<{ id: string; role: string; name: string } | null>(null)
  const [deleteMember, setDeleteMember] = useState<{ id: string; name: string } | null>(null)
  const [assignMember, setAssignMember] = useState<PartnerTeamMember | null>(null)
  const [selectedRole, setSelectedRole] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set())
  const [integrationsWorkspace, setIntegrationsWorkspace] = useState<PartnerWorkspace | null>(null)

  const { data: authContext } = useAuthContext()
  const { data: members, isLoading: membersLoading, refetch: refetchMembers } = usePartnerTeam()
  const { data: workspaces, isLoading: workspacesLoading, refetch: refetchWorkspaces } = usePartnerWorkspaces()
  const updateRole = useUpdatePartnerMemberRole()
  const removeMember = useRemovePartnerMember()

  const currentUserRole = authContext?.partnerMembership?.role || "member"
  const isOwner = currentUserRole === "owner"
  const isAdmin = currentUserRole === "owner" || currentUserRole === "admin"

  // Filter members by search query
  const filteredMembers = useMemo(() => {
    if (!members) return []
    if (!searchQuery.trim()) return members

    const query = searchQuery.toLowerCase()
    return members.filter(
      (m) =>
        m.email.toLowerCase().includes(query) ||
        m.first_name?.toLowerCase().includes(query) ||
        m.last_name?.toLowerCase().includes(query) ||
        m.workspace_access.some((wa) => wa.workspace_name.toLowerCase().includes(query))
    )
  }, [members, searchQuery])

  // Filter workspaces by search query
  const filteredWorkspaces = useMemo(() => {
    if (!workspaces) return []
    if (!searchQuery.trim()) return workspaces

    const query = searchQuery.toLowerCase()
    return workspaces.filter(
      (ws) =>
        ws.name.toLowerCase().includes(query) ||
        ws.slug.toLowerCase().includes(query) ||
        ws.owner_name?.toLowerCase().includes(query) ||
        ws.owner_email?.toLowerCase().includes(query)
    )
  }, [workspaces, searchQuery])

  // Stats
  const stats = useMemo(() => {
    return {
      totalWorkspaces: workspaces?.length || 0,
      totalMembers: members?.length || 0,
      totalAgents: workspaces?.reduce((sum, ws) => sum + ws.agent_count, 0) || 0,
      workspaceOwners: members?.filter((m) => m.is_workspace_owner).length || 0,
    }
  }, [members, workspaces])

  const toggleWorkspace = (workspaceId: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev)
      if (next.has(workspaceId)) {
        next.delete(workspaceId)
      } else {
        next.add(workspaceId)
      }
      return next
    })
  }

  const handleUpdateRole = async () => {
    if (!editMember || !selectedRole) return

    try {
      await updateRole.mutateAsync({ memberId: editMember.id, role: selectedRole })
      toast.success("Role updated successfully")
      setEditMember(null)
    } catch (error: any) {
      toast.error(error.message || "Failed to update role")
    }
  }

  const handleRemoveMember = async () => {
    if (!deleteMember) return

    try {
      await removeMember.mutateAsync(deleteMember.id)
      toast.success("Member removed successfully")
      setDeleteMember(null)
    } catch (error: any) {
      toast.error(error.message || "Failed to remove member")
    }
  }

  const getMemberName = (member: PartnerTeamMember) => {
    return member.first_name ? `${member.first_name} ${member.last_name || ""}`.trim() : member.email
  }

  const handleRefresh = () => {
    refetchMembers()
    refetchWorkspaces()
  }

  const isLoading = membersLoading || workspacesLoading

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Organization Overview</h1>
          <p className="text-muted-foreground mt-1">
            Manage your organization's workspaces and team members
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button asChild variant="outline">
            <Link href="/org/invitations">
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Member
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Workspaces
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{stats.totalWorkspaces}</div>
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Team Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-blue-600">{stats.totalMembers}</div>
              <Users className="h-5 w-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              AI Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-purple-600">{stats.totalAgents}</div>
              <Bot className="h-5 w-5 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Workspace Owners
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-amber-600">{stats.workspaceOwners}</div>
              <Crown className="h-5 w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <TabsList>
            <TabsTrigger value="members" className="gap-2">
              <Users className="h-4 w-4" />
              Members ({members?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="workspaces" className="gap-2">
              <Building2 className="h-4 w-4" />
              Workspaces ({workspaces?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Search */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={activeTab === "members" ? "Search members..." : "Search workspaces..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Members Tab */}
        <TabsContent value="members" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
                {searchQuery && (
                  <Badge variant="secondary" className="ml-2">
                    {filteredMembers.length} results
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Organization members with their workspace access
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredMembers && filteredMembers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Org Role</TableHead>
                      <TableHead>Workspaces</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.map((member) => {
                      const RoleIcon = roleIcons[member.role] || UserCheck
                      const isCurrentUser = member.user_id === authContext?.user?.id
                      const canModify = !isCurrentUser && (isOwner || member.role !== "owner")
                      const memberName = getMemberName(member)

                      return (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-primary/10 text-primary">
                                  {member.first_name?.[0] || member.email?.[0]?.toUpperCase() || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium flex items-center gap-2">
                                  {memberName}
                                  {isCurrentUser && (
                                    <Badge variant="outline" className="text-xs">You</Badge>
                                  )}
                                  {member.is_workspace_owner && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <Crown className="h-3.5 w-3.5 text-amber-500" />
                                        </TooltipTrigger>
                                        <TooltipContent>Workspace Owner</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </p>
                                <p className="text-sm text-muted-foreground">{member.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={roleColors[member.role]}>
                              <RoleIcon className="h-3 w-3 mr-1" />
                              {roleLabels[member.role] || member.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {member.workspace_count > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {member.workspace_access.slice(0, 2).map((wa) => (
                                  <TooltipProvider key={wa.workspace_id}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Link href={`/w/${wa.workspace_slug}/members`}>
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              "text-xs cursor-pointer hover:bg-muted",
                                              workspaceRoleColors[wa.role]
                                            )}
                                          >
                                            {wa.workspace_name.length > 15
                                              ? wa.workspace_name.slice(0, 15) + "..."
                                              : wa.workspace_name}
                                          </Badge>
                                        </Link>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {wa.workspace_name} ({wa.role})
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ))}
                                {member.workspace_count > 2 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{member.workspace_count - 2} more
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">No workspaces</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {member.joined_at
                              ? formatDistanceToNow(new Date(member.joined_at), { addSuffix: true })
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {canModify && isAdmin ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setAssignMember(member)}>
                                    <FolderPlus className="h-4 w-4 mr-2" />
                                    Assign to Workspace
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditMember({ id: member.id, role: member.role, name: memberName })
                                      setSelectedRole(member.role)
                                    }}
                                  >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Change Org Role
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setDeleteMember({ id: member.id, name: memberName })}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Remove from Org
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{searchQuery ? "No members match your search" : "No team members yet"}</p>
                  {!searchQuery && (
                    <Button asChild variant="link" className="mt-2">
                      <Link href="/org/invitations">Invite your first team member</Link>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workspaces Tab */}
        <TabsContent value="workspaces" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Workspaces
                  {searchQuery && (
                    <Badge variant="secondary" className="ml-2">
                      {filteredWorkspaces.length} results
                    </Badge>
                  )}
              </CardTitle>
              <CardDescription>
                All workspaces in your organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workspacesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredWorkspaces && filteredWorkspaces.length > 0 ? (
                <div className="space-y-3">
                  {filteredWorkspaces.map((workspace) => (
                    <WorkspaceRow
                      key={workspace.id}
                      workspace={workspace}
                      expanded={expandedWorkspaces.has(workspace.id)}
                      onToggle={() => toggleWorkspace(workspace.id)}
                      onManageIntegrations={() => setIntegrationsWorkspace(workspace)}
                      members={members?.filter((m) =>
                        m.workspace_access.some((wa) => wa.workspace_id === workspace.id)
                      ) || []}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{searchQuery ? "No workspaces match your search" : "No workspaces yet"}</p>
                  <p className="text-sm mt-2">Workspaces are created based on your subscription plan</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Role Dialog */}
      <Dialog open={!!editMember} onOpenChange={(open) => !open && setEditMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Organization Role</DialogTitle>
            <DialogDescription>
              Change the organization role for {editMember?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {isOwner && (
                  <SelectItem value="owner">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-purple-600" />
                      Owner - Full organization access
                    </div>
                  </SelectItem>
                )}
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-600" />
                    Admin - Manage team & workspaces
                  </div>
                </SelectItem>
                <SelectItem value="member">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-green-600" />
                    Member - Access assigned workspaces
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMember(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateRole}
              disabled={updateRole.isPending || selectedRole === editMember?.role}
            >
              {updateRole.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Role"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog open={!!deleteMember} onOpenChange={(open) => !open && setDeleteMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {deleteMember?.name} from the organization?
              They will lose access to all workspaces.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteMember(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveMember}
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Member"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Workspace Dialog */}
      <AssignWorkspaceDialog
        open={!!assignMember}
        onOpenChange={(open) => !open && setAssignMember(null)}
        member={assignMember}
      />

      {/* Workspace Integrations Dialog */}
      <WorkspaceIntegrationsDialog
        open={!!integrationsWorkspace}
        onOpenChange={(open) => !open && setIntegrationsWorkspace(null)}
        workspace={integrationsWorkspace}
      />
    </div>
  )
}

// Workspace Row Component with expandable member list
function WorkspaceRow({
  workspace,
  expanded,
  onToggle,
  onManageIntegrations,
  members,
}: {
  workspace: PartnerWorkspace
  expanded: boolean
  onToggle: () => void
  onManageIntegrations: () => void
  members: PartnerTeamMember[]
}) {
  const gradientClass = getWorkspaceGradient(workspace.name)

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <div className={cn(
        "border rounded-lg transition-colors",
        expanded ? "border-primary/30 bg-primary/5" : "border-border hover:border-border/80"
      )}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-4 p-4 cursor-pointer">
            <div className="flex items-center gap-1 text-muted-foreground">
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </div>

            <div
              className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold text-xs bg-gradient-to-br shadow-sm shrink-0",
                gradientClass
              )}
            >
              {getInitials(workspace.name)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium">{workspace.name}</p>
                <Link href={`/w/${workspace.slug}/dashboard`} onClick={(e) => e.stopPropagation()}>
                  <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">/{workspace.slug}</p>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">{workspace.member_summary.total}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs space-y-1">
                      <p>{workspace.member_summary.owners} owner(s)</p>
                      <p>{workspace.member_summary.admins} admin(s)</p>
                      <p>{workspace.member_summary.members} member(s)</p>
                      <p>{workspace.member_summary.viewers} viewer(s)</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-purple-500" />
                <span className="font-medium">{workspace.agent_count}</span>
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0">
            <div className="border-t pt-4">
              {/* Owner Info */}
              <div className="flex items-center gap-2 text-sm mb-3">
                <Crown className="h-4 w-4 text-amber-500" />
                <span className="text-muted-foreground">Owner:</span>
                <span className="font-medium">
                  {workspace.owner_name || workspace.owner_email || "No owner assigned"}
                </span>
              </div>

              {/* Member List */}
              {members.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Team Members
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {members.map((member) => {
                      const wsAccess = member.workspace_access.find(
                        (wa) => wa.workspace_id === workspace.id
                      )
                      return (
                        <Badge
                          key={member.id}
                          variant="outline"
                          className={cn("py-1.5", workspaceRoleColors[wsAccess?.role || "member"])}
                        >
                          <Avatar className="h-4 w-4 mr-1.5">
                            <AvatarFallback className="text-[8px]">
                              {member.first_name?.[0] || member.email?.[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {member.first_name || member.email.split("@")[0]}
                          <span className="ml-1 text-muted-foreground">({wsAccess?.role})</span>
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No members assigned yet</p>
              )}

              {/* Quick Actions */}
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onManageIntegrations(); }}>
                  <Plug className="h-4 w-4 mr-2" />
                  Manage Integrations
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/w/${workspace.slug}/members`}>
                    <Users className="h-4 w-4 mr-2" />
                    Manage Members
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/w/${workspace.slug}/dashboard`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Workspace
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

