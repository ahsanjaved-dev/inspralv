"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Building2, 
  ChevronRight, 
  Plus, 
  LogOut, 
  Sparkles,
  Crown,
  Shield,
  User,
  Eye,
  Search,
  LayoutGrid,
  List,
  ExternalLink,
  Users,
  Bot,
  Calendar,
} from "lucide-react"
import type { AccessibleWorkspace, PartnerAuthUser } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

interface Props {
  workspaces: AccessibleWorkspace[]
  partner: ResolvedPartner
  user: PartnerAuthUser
  canCreateWorkspace?: boolean
}

// Threshold for showing search and compact view
const COMPACT_VIEW_THRESHOLD = 6

// Generate a consistent color based on string
function getWorkspaceColor(str: string): string {
  const colors = [
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
  return colors[Math.abs(hash) % colors.length] ?? "from-violet-500 to-purple-600"
}

// Get initials from workspace name
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

// Format relative time
function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

const roleConfig = {
  owner: { icon: Crown, label: "Owner", variant: "default" as const, className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  admin: { icon: Shield, label: "Admin", variant: "secondary" as const, className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  member: { icon: User, label: "Member", variant: "outline" as const, className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  viewer: { icon: Eye, label: "Viewer", variant: "outline" as const, className: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
}

type ViewMode = "card" | "list"
type SortBy = "name" | "created" | "role"

export function WorkspaceSelector({
  workspaces,
  partner,
  user,
  canCreateWorkspace = false,
}: Props) {
  const branding = partner.branding
  const primaryColor = branding.primary_color || "#7c3aed"
  const companyName = branding.company_name || partner.name

  // State for search, view mode, and sorting
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>(
    workspaces.length > COMPACT_VIEW_THRESHOLD ? "list" : "card"
  )
  const [sortBy, setSortBy] = useState<SortBy>("name")

  // Show controls only if there are many workspaces
  const showControls = workspaces.length > COMPACT_VIEW_THRESHOLD

  // Filter and sort workspaces
  const filteredWorkspaces = useMemo(() => {
    let filtered = workspaces

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = workspaces.filter(
        (ws) =>
          ws.name.toLowerCase().includes(query) ||
          ws.slug.toLowerCase().includes(query) ||
          ws.owner_email?.toLowerCase().includes(query) ||
          ws.description?.toLowerCase().includes(query)
      )
    }

    // Apply sorting
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "created":
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        case "role":
          const roleOrder = { owner: 0, admin: 1, member: 2, viewer: 3 }
          return (roleOrder[a.role] || 4) - (roleOrder[b.role] || 4)
        case "name":
        default:
          return a.name.localeCompare(b.name)
      }
    })
  }, [workspaces, searchQuery, sortBy])

  // Separate direct access vs partner admin access workspaces
  const directWorkspaces = filteredWorkspaces.filter((ws) => !ws.is_partner_admin_access)
  const adminAccessWorkspaces = filteredWorkspaces.filter((ws) => ws.is_partner_admin_access)

  return (
    <div className={cn("w-full", showControls ? "max-w-3xl" : "max-w-xl")}>
      {/* Header Section */}
      <div className="text-center mb-6">
        {branding.logo_url ? (
          <img src={branding.logo_url} alt={companyName} className="h-10 mx-auto mb-4" />
        ) : (
          <div
            className="h-12 w-12 mx-auto mb-4 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary/25"
            style={{ backgroundColor: primaryColor }}
          >
            {companyName[0]}
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
          Welcome back!
        </h1>
        <p className="text-muted-foreground text-sm">
          Select a workspace to continue
          {workspaces.length > 0 && (
            <span className="text-muted-foreground/70"> • {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}</span>
          )}
        </p>
      </div>

      {/* Search and Controls */}
      {showControls && (
        <div className="flex items-center gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-card"
            />
          </div>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-32 h-9 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="created">Recent</SelectItem>
              <SelectItem value="role">Role</SelectItem>
            </SelectContent>
          </Select>

          {/* View Toggle */}
          <div className="flex items-center gap-0.5 p-1 bg-muted rounded-lg">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMode("card")}
              className={cn(
                "h-7 w-7 rounded-md",
                viewMode === "card"
                  ? "bg-background shadow-sm"
                  : "hover:bg-transparent"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMode("list")}
              className={cn(
                "h-7 w-7 rounded-md",
                viewMode === "list"
                  ? "bg-background shadow-sm"
                  : "hover:bg-transparent"
              )}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Workspace List/Grid */}
      <ScrollArea className={cn(showControls ? "h-[400px]" : "max-h-[500px]")}>
        <div className={cn("space-y-4 pr-2", showControls && "pb-2")}>
          {/* Direct Access Workspaces */}
          {directWorkspaces.length > 0 && (
            <div>
              {adminAccessWorkspaces.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Your Workspaces
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                    {directWorkspaces.length}
                  </Badge>
                </div>
              )}
              <div className={cn(
                viewMode === "card" ? "space-y-2" : "space-y-1"
              )}>
                {directWorkspaces.map((workspace) => (
                  <WorkspaceItem
                    key={workspace.id}
                    workspace={workspace}
                    viewMode={viewMode}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Partner Admin Access Workspaces */}
          {adminAccessWorkspaces.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Organization Workspaces
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-purple-500/10 text-purple-600 border-purple-500/20">
                  Admin Access
                </Badge>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {adminAccessWorkspaces.length}
                </Badge>
              </div>
              <div className={cn(
                viewMode === "card" ? "space-y-2" : "space-y-1"
              )}>
                {adminAccessWorkspaces.map((workspace) => (
                  <WorkspaceItem
                    key={workspace.id}
                    workspace={workspace}
                    viewMode={viewMode}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {filteredWorkspaces.length === 0 && (
            <div className="text-center py-8">
              <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No workspaces found</p>
              {searchQuery && (
                <p className="text-xs text-muted-foreground mt-1">
                  Try a different search term
                </p>
              )}
            </div>
          )}

          {/* Create Workspace Button */}
          {canCreateWorkspace && (
            <Link
              href="/workspace-onboarding"
              className={cn(
                "group flex items-center gap-3 rounded-xl",
                "border-2 border-dashed border-muted-foreground/20",
                "hover:border-primary/40 hover:bg-primary/5",
                "text-muted-foreground hover:text-primary",
                "transition-all duration-200",
                viewMode === "card" ? "p-4 justify-center" : "p-3"
              )}
            >
              <div className={cn(
                "rounded-lg border-2 border-current border-dashed flex items-center justify-center group-hover:border-solid",
                viewMode === "card" ? "h-10 w-10" : "h-8 w-8"
              )}>
                <Plus className={cn(viewMode === "card" ? "h-5 w-5" : "h-4 w-4")} />
              </div>
              <span className="font-medium text-sm">Create New Workspace</span>
            </Link>
          )}
        </div>
      </ScrollArea>

      {/* User Footer */}
      <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/50">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
            {user.first_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Signed in as </span>
            <span className="font-medium text-foreground">{user.email}</span>
          </div>
        </div>
        <form action="/api/auth/signout" method="POST">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign out
          </Button>
        </form>
      </div>
    </div>
  )
}

// Workspace Item Component
function WorkspaceItem({
  workspace,
  viewMode,
}: {
  workspace: AccessibleWorkspace
  viewMode: ViewMode
}) {
  const roleInfo = roleConfig[workspace.role as keyof typeof roleConfig] || roleConfig.member
  const RoleIcon = roleInfo.icon
  const gradientClass = getWorkspaceColor(workspace.name)

  if (viewMode === "list") {
    return (
      <Link
        href={`/w/${workspace.slug}/dashboard`}
        className={cn(
          "group flex items-center gap-3 p-2.5 rounded-lg",
          "bg-card border border-border/50",
          "hover:border-primary/30 hover:bg-muted/50",
          "transition-all duration-150"
        )}
      >
        {/* Avatar */}
        <div className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center",
          "text-white font-semibold text-xs shrink-0",
          "bg-gradient-to-br",
          gradientClass
        )}>
          {getInitials(workspace.name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm text-foreground truncate">
                {workspace.name}
              </span>
              {workspace.is_partner_admin_access && (
                <ExternalLink className="h-3 w-3 text-purple-500 shrink-0" />
              )}
            </div>
          </div>

          {/* Stats (for admin access workspaces) */}
          {workspace.is_partner_admin_access && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
              {workspace.member_count !== undefined && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {workspace.member_count}
                </span>
              )}
              {workspace.agent_count !== undefined && (
                <span className="flex items-center gap-1">
                  <Bot className="h-3 w-3" />
                  {workspace.agent_count}
                </span>
              )}
            </div>
          )}

          {/* Role Badge */}
          <Badge 
            variant="outline" 
            className={cn("text-[10px] px-1.5 py-0 h-5 font-medium border shrink-0", roleInfo.className)}
          >
            <RoleIcon className="h-3 w-3 mr-0.5" />
            {roleInfo.label}
          </Badge>

          {/* Owner Email (for admin access) */}
          {workspace.is_partner_admin_access && workspace.owner_email && (
            <span className="hidden md:block text-xs text-muted-foreground truncate max-w-[120px]">
              {workspace.owner_email}
            </span>
          )}
        </div>

        {/* Arrow */}
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
      </Link>
    )
  }

  // Card View
  return (
    <Link
      href={`/w/${workspace.slug}/dashboard`}
      className={cn(
        "group relative flex items-center gap-4 p-4 rounded-xl",
        "bg-card border border-border/50",
        "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
        "transition-all duration-200 ease-out",
        "hover:-translate-y-0.5"
      )}
    >
      {/* Workspace Avatar */}
      <div className={cn(
        "relative h-11 w-11 rounded-xl flex items-center justify-center",
        "text-white font-semibold text-sm shrink-0",
        "bg-gradient-to-br shadow-md",
        gradientClass
      )}>
        {getInitials(workspace.name)}
        <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Workspace Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-foreground truncate">
            {workspace.name}
          </h3>
          {workspace.is_partner_admin_access && (
            <ExternalLink className="h-3.5 w-3.5 text-purple-500 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge 
            variant="outline" 
            className={cn("text-xs font-medium border", roleInfo.className)}
          >
            <RoleIcon className="h-3 w-3 mr-1" />
            {roleInfo.label}
          </Badge>
          {workspace.is_partner_admin_access && workspace.owner_email && (
            <span className="text-xs text-muted-foreground truncate">
              {workspace.owner_email}
            </span>
          )}
          {workspace.is_partner_admin_access && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {workspace.member_count !== undefined && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {workspace.member_count}
                </span>
              )}
              {workspace.agent_count !== undefined && (
                <span className="flex items-center gap-1">
                  <Bot className="h-3 w-3" />
                  {workspace.agent_count}
                </span>
              )}
            </div>
          )}
          {!workspace.is_partner_admin_access && workspace.description && (
            <span className="text-xs text-muted-foreground truncate hidden sm:inline">
              {workspace.description}
            </span>
          )}
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  )
}
