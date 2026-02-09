"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { AccessibleWorkspace } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

interface Props {
  partner: ResolvedPartner
  currentWorkspace: AccessibleWorkspace
  workspaces: AccessibleWorkspace[]
  isCollapsed: boolean
  partnerRole?: "owner" | "admin" | "member" | null
}

// Max workspaces to show in dropdown before showing search
const MAX_DROPDOWN_WORKSPACES = 5

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

export function WorkspaceSidebar({ partner, currentWorkspace, workspaces, isCollapsed, partnerRole }: Props) {
  const pathname = usePathname()
  const [searchQuery, setSearchQuery] = useState("")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

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

  // Determine if we should show search (more than MAX_DROPDOWN_WORKSPACES workspaces)
  const showSearch = workspaces.length > MAX_DROPDOWN_WORKSPACES

  // Show all filtered workspaces with scrolling
  const displayedWorkspaces = filteredWorkspaces

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
  // Single entry point to org management
  const orgNavigation = isPartnerAdmin ? [
    { title: "Organization", href: `/org`, icon: Building2 },
  ] : []

  // Reset search when dropdown closes
  const handleOpenChange = (open: boolean) => {
    setIsDropdownOpen(open)
    if (!open) {
      setSearchQuery("")
    }
  }

  return (
    <div
      className={cn(
        "hidden lg:flex flex-col h-full bg-card border-r border-border shrink-0 transition-[width] duration-300",
        isCollapsed ? "w-[4.5rem]" : "w-64"
      )}
    >
      {/* Partner Logo - Fixed at top */}
      <div className={cn("p-4 border-b border-border shrink-0", isCollapsed && "px-2")}>
        <Link
          href={`${baseUrl}/dashboard`}
          className={cn("flex items-center gap-3", isCollapsed && "justify-center")}
        >
          {branding.logo_url ? (
            isCollapsed ? (
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-sm"
                style={{ backgroundColor: primaryColor }}
              >
                {companyName[0]}
              </div>
            ) : (
              <img
                src={branding.logo_url}
                alt={companyName}
                className="h-8 max-w-[10rem] object-contain"
              />
            )
          ) : (
            <>
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-sm flex-shrink-0"
                style={{ backgroundColor: primaryColor }}
              >
                {companyName[0]}
              </div>
              {!isCollapsed && (
                <span className="text-xl font-bold text-foreground">{companyName}</span>
              )}
            </>
          )}
        </Link>
      </div>

      {/* Workspace Selector - Redesigned with Search */}
      <div className={cn("p-3 shrink-0", isCollapsed && "px-2")}>
        <DropdownMenu open={isDropdownOpen} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center gap-3 rounded-xl transition-all group outline-none",
                "bg-muted/50 hover:bg-muted border border-border/50 hover:border-border",
                isCollapsed ? "p-2 justify-center" : "p-2.5"
              )}
              title={isCollapsed ? currentWorkspace.name : undefined}
            >
              <div
                className={cn(
                  "rounded-lg flex items-center justify-center text-white font-semibold text-xs shrink-0 bg-gradient-to-br shadow-sm",
                  isCollapsed ? "h-8 w-8" : "h-9 w-9",
                  getWorkspaceGradient(currentWorkspace.name)
                )}
              >
                {getInitials(currentWorkspace.name)}
              </div>
              {!isCollapsed && (
                <>
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
                    isDropdownOpen && "rotate-180"
                  )} />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            align="start" 
            className="w-[min(calc(100vw-1rem),16rem)] p-0 flex flex-col max-h-[min(calc(100vh-8rem),22rem)]" 
            sideOffset={6}
          >
            {/* Header with workspace count */}
            <div className="px-2.5 py-1.5 border-b border-border shrink-0">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground">Switch workspace</p>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-3.5">
                  {workspaces.length}
                </Badge>
              </div>
            </div>

            {/* Search Input (only show if many workspaces) */}
            {showSearch && (
              <div className="px-1.5 py-1.5 border-b border-border shrink-0">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-7 pl-7 text-xs bg-muted/50 border-0 focus-visible:ring-1"
                    autoFocus
                  />
                </div>
              </div>
            )}

            {/* Workspace List - Scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="p-1 space-y-0.5">
                {displayedWorkspaces.length === 0 ? (
                  <div className="px-2 py-3 text-center">
                    <p className="text-xs text-muted-foreground">No workspaces found</p>
                    {searchQuery && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Try a different search term
                      </p>
                    )}
                  </div>
                ) : (
                  displayedWorkspaces.map((ws) => {
                    const isCurrent = ws.id === currentWorkspace.id
                    const roleInfo = roleConfig[ws.role as keyof typeof roleConfig] || roleConfig.member

                    return (
                      <DropdownMenuItem key={ws.id} asChild className="p-0 focus:bg-transparent">
                        <Link
                          href={`/w/${ws.slug}/dashboard`}
                          className={cn(
                            "flex items-center gap-2 p-1.5 rounded-md cursor-pointer w-full transition-colors",
                            isCurrent 
                              ? "bg-primary/10 border border-primary/20" 
                              : "hover:bg-muted border border-transparent"
                          )}
                        >
                          <div
                            className={cn(
                              "h-7 w-7 rounded-md flex items-center justify-center text-white font-semibold text-[10px] shrink-0 bg-gradient-to-br shadow-sm",
                              getWorkspaceGradient(ws.name)
                            )}
                          >
                            {getInitials(ws.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="font-medium text-xs text-foreground truncate">{ws.name}</p>
                              {isCurrent && (
                                <Check className="h-3 w-3 text-primary shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <roleInfo.icon className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                              <span className="text-[10px] text-muted-foreground">{roleInfo.label}</span>
                              {ws.is_partner_admin_access && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 bg-purple-500/10 text-purple-600 border-purple-500/20 shrink-0 ml-0.5">
                                  Admin
                                </Badge>
                              )}
                            </div>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    )
                  })
                )}
              </div>
            </div>

            {/* Footer - View all workspaces (for partner admins) */}
            {isPartnerAdmin && (
              <div className="border-t border-border shrink-0">
                <div className="p-1">
                  <DropdownMenuItem asChild>
                    <Link
                      href="/select-workspace"
                      className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-md hover:bg-muted"
                    >
                      <div className="h-5 w-5 rounded bg-muted flex items-center justify-center shrink-0">
                        <LayoutGrid className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <span className="text-xs font-medium">View all workspaces</span>
                    </Link>
                  </DropdownMenuItem>
                </div>
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator className="mx-3 shrink-0" />

      {/* Navigation - Scrollable area that takes remaining space */}
      <ScrollArea className="flex-1 min-h-0">
        <nav className={cn("space-y-1 py-4", isCollapsed ? "px-2" : "px-3")}>
          {/* Workspace Navigation */}
          {!isCollapsed && (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
              Workspace
            </p>
          )}
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

            return (
              <Link
                key={item.href}
                href={item.href}
                title={isCollapsed ? item.title : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
                  isCollapsed ? "justify-center p-3" : "px-3 py-2.5",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>{item.title}</span>}
              </Link>
            )
          })}
          
          {/* Organization Navigation (for partner admins/owners) */}
          {orgNavigation.length > 0 && (
            <>
              {!isCollapsed && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2 mt-4">
                  Organization
                </p>
              )}
              {isCollapsed && <Separator className="my-2" />}
              {orgNavigation.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isCollapsed ? item.title : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
                      isCollapsed ? "justify-center p-3" : "px-3 py-2.5",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!isCollapsed && <span>{item.title}</span>}
                  </Link>
                )
              })}
            </>
          )}
        </nav>
      </ScrollArea>

    </div>
  )
}
