"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  LayoutDashboard,
  LayoutGrid,
  Bot,
  Users,
  BookOpen,
  CreditCard,
  BarChart3,
  Phone,
  ChevronDown,
  Check,
  Crown,
  Shield,
  User,
  Megaphone,
  Search,
  ExternalLink,
  Building2,
  Settings,
  Plug,
} from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { AccessibleWorkspace } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

interface Props {
  partner: ResolvedPartner
  currentWorkspace: AccessibleWorkspace
  workspaces: AccessibleWorkspace[]
  partnerRole?: "owner" | "admin" | "member" | null
  isOpen: boolean
  onClose: () => void
}

// Max workspaces to show before showing "View all" link
const MAX_MOBILE_WORKSPACES = 5

// Generate a consistent gradient based on string
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

// Get initials from workspace name
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

const roleConfig = {
  owner: { icon: Crown, label: "Owner" },
  admin: { icon: Shield, label: "Admin" },
  member: { icon: User, label: "Member" },
  viewer: { icon: User, label: "Viewer" },
}

export function WorkspaceMobileSidebar({ 
  partner, 
  currentWorkspace, 
  workspaces, 
  partnerRole,
  isOpen,
  onClose 
}: Props) {
  const pathname = usePathname()
  const [searchQuery, setSearchQuery] = useState("")
  const [isWorkspacesOpen, setIsWorkspacesOpen] = useState(false)

  const branding = partner.branding
  const primaryColor = branding.primary_color || "#7c3aed"
  const companyName = branding.company_name || partner.name

  // Navigation items scoped to current workspace
  const baseUrl = `/w/${currentWorkspace.slug}`
  
  // Role-based navigation - some items only for admins/owners
  const isWorkspaceAdmin = currentWorkspace.role === "owner" || currentWorkspace.role === "admin"
  const isPartnerAdmin = partnerRole === "owner" || partnerRole === "admin"

  // Filter and sort workspaces
  const filteredWorkspaces = useMemo(() => {
    let filtered = workspaces
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = workspaces.filter(
        (ws) =>
          ws.name.toLowerCase().includes(query) ||
          ws.slug.toLowerCase().includes(query) ||
          ws.owner_email?.toLowerCase().includes(query)
      )
    }
    
    return filtered
  }, [workspaces, searchQuery])

  // Determine if we should show search
  const showSearch = workspaces.length > MAX_MOBILE_WORKSPACES
  const showViewAll = workspaces.length > MAX_MOBILE_WORKSPACES && !searchQuery

  // Limit displayed workspaces
  const displayedWorkspaces = showViewAll 
    ? filteredWorkspaces.slice(0, MAX_MOBILE_WORKSPACES)
    : filteredWorkspaces

  const navigation = [
    { title: "Dashboard", href: `${baseUrl}/dashboard`, icon: LayoutDashboard },
    { title: "Agents", href: `${baseUrl}/agents`, icon: Bot },
    { title: "Campaigns", href: `${baseUrl}/campaigns`, icon: Megaphone },
    { title: "Knowledge Base", href: `${baseUrl}/knowledge-base`, icon: BookOpen },
    ...(isWorkspaceAdmin ? [{ title: "Billing", href: `${baseUrl}/billing`, icon: CreditCard }] : []),
    { title: "Analytics", href: `${baseUrl}/analytics`, icon: BarChart3 },
    { title: "Calls", href: `${baseUrl}/calls`, icon: Phone },
    ...(isWorkspaceAdmin ? [{ title: "Workspace Team", href: `${baseUrl}/members`, icon: Users }] : []),
    ...(isWorkspaceAdmin ? [{ title: "Integrations", href: `${baseUrl}/integrations`, icon: Plug }] : []),
    ...(isWorkspaceAdmin ? [{ title: "Settings", href: `${baseUrl}/settings`, icon: Settings }] : []),
  ]
  
  // Organization-level navigation (for partner admins/owners)
  const orgNavigation = isPartnerAdmin ? [
    { title: "Organization", href: `/org`, icon: Building2 },
  ] : []

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="left" className="w-[85vw] max-w-sm p-0 flex flex-col">
        {/* Partner Logo - Fixed at top */}
        <div className="p-4 border-b border-border shrink-0">
          <Link
            href={`${baseUrl}/dashboard`}
            className="flex items-center gap-3"
            onClick={onClose}
          >
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt={companyName}
                className="h-8 max-w-[10rem] object-contain"
              />
            ) : (
              <>
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-sm flex-shrink-0"
                  style={{ backgroundColor: primaryColor }}
                >
                  {companyName[0]}
                </div>
                <span className="text-xl font-bold text-foreground">{companyName}</span>
              </>
            )}
          </Link>
        </div>

        {/* Workspace Selector - Collapsible */}
        <div className="p-3 shrink-0">
          <Collapsible open={isWorkspacesOpen} onOpenChange={setIsWorkspacesOpen}>
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl transition-all group outline-none p-2.5",
                  "bg-muted/50 hover:bg-muted border border-border/50 hover:border-border"
                )}
              >
                <div
                  className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center text-white font-semibold text-xs shrink-0 bg-gradient-to-br shadow-sm",
                    getWorkspaceGradient(currentWorkspace.name)
                  )}
                >
                  {getInitials(currentWorkspace.name)}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-foreground truncate">{currentWorkspace.name}</p>
                    {currentWorkspace.is_partner_admin_access && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-purple-500/10 text-purple-600 border-purple-500/20">
                        Admin
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{currentWorkspace.role}</p>
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground group-hover:text-foreground transition-all shrink-0",
                  isWorkspacesOpen && "rotate-180"
                )} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="rounded-lg border border-border bg-card">
                {/* Header */}
                <div className="px-3 py-2.5 border-b border-border">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Switch workspace</p>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                      {workspaces.length}
                    </Badge>
                  </div>
                </div>

                {/* Search Input */}
                {showSearch && (
                  <div className="px-2 py-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search workspaces..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 pl-8 text-sm bg-muted/50 border-0 focus-visible:ring-1"
                      />
                    </div>
                  </div>
                )}

                {/* Workspace List */}
                <ScrollArea className="max-h-64">
                  <div className="p-1.5 space-y-0.5">
                    {displayedWorkspaces.length === 0 ? (
                      <div className="px-3 py-6 text-center">
                        <p className="text-sm text-muted-foreground">No workspaces found</p>
                        {searchQuery && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Try a different search term
                          </p>
                        )}
                      </div>
                    ) : (
                      displayedWorkspaces.map((ws) => {
                        const isCurrent = ws.id === currentWorkspace.id
                        const roleInfo = roleConfig[ws.role as keyof typeof roleConfig] || roleConfig.member

                        return (
                          <Link
                            key={ws.id}
                            href={`/w/${ws.slug}/dashboard`}
                            onClick={onClose}
                            className={cn(
                              "flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer w-full transition-colors",
                              isCurrent 
                                ? "bg-primary/10 border border-primary/20" 
                                : "hover:bg-muted border border-transparent"
                            )}
                          >
                            <div
                              className={cn(
                                "h-9 w-9 rounded-lg flex items-center justify-center text-white font-semibold text-xs shrink-0 bg-gradient-to-br shadow-sm",
                                getWorkspaceGradient(ws.name)
                              )}
                            >
                              {getInitials(ws.name)}
                            </div>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="flex items-center gap-1.5 mb-1">
                                <p className="font-medium text-sm text-foreground truncate flex-1">{ws.name}</p>
                                {isCurrent && (
                                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                )}
                                {ws.is_partner_admin_access && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-purple-500/10 text-purple-600 border-purple-500/20 shrink-0">
                                    Admin
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <div className="flex items-center gap-1">
                                  <roleInfo.icon className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">{roleInfo.label}</span>
                                </div>
                                {ws.is_partner_admin_access && ws.owner_email && (
                                  <>
                                    <span className="text-muted-foreground/50 shrink-0">•</span>
                                    <span className="text-xs text-muted-foreground truncate flex-1 min-w-0" title={ws.owner_email}>
                                      {ws.owner_email}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </Link>
                        )
                      })
                    )}
                  </div>
                </ScrollArea>

                {/* Actions */}
                {isPartnerAdmin && (
                  <>
                    <Separator className="my-0" />
                    <div className="p-1.5">
                      <Link
                        href="/select-workspace"
                        onClick={onClose}
                        className="flex items-center gap-2.5 px-2.5 py-2 cursor-pointer rounded-lg hover:bg-muted"
                      >
                        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block">View all workspaces</span>
                          <span className="text-xs text-muted-foreground">Browse all {workspaces.length} workspaces</span>
                        </div>
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <Separator className="mx-3 shrink-0" />

        {/* Navigation - Scrollable area */}
        <ScrollArea className="flex-1 min-h-0">
          <nav className="space-y-1 py-4 px-3">
            {/* Workspace Navigation */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
              Workspace
            </p>
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors px-3 py-2.5",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.title}</span>
                </Link>
              )
            })}
            
            {/* Organization Navigation */}
            {orgNavigation.length > 0 && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2 mt-4">
                  Organization
                </p>
                {orgNavigation.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors px-3 py-2.5",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span>{item.title}</span>
                    </Link>
                  )
                })}
              </>
            )}
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

