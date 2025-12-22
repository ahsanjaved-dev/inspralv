"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  LayoutDashboard,
  LayoutGrid,
  Bot,
  Users,
  BookOpen,
  Plug,
  PhoneCall,
  CreditCard,
  BarChart3,
  Phone,
  Settings,
  LogOut,
  ChevronRight,
  MoreVertical,
  HelpCircle,
  ShieldCheck,
  Building2,
  UserPlus,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/lib/hooks/use-auth"
import type { AccessibleWorkspace, PartnerAuthUser } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

interface Props {
  partner: ResolvedPartner
  currentWorkspace: AccessibleWorkspace
  workspaces: AccessibleWorkspace[]
  isCollapsed: boolean
  partnerRole?: "owner" | "admin" | "member" | null
  user?: PartnerAuthUser
}

// Generate a consistent color based on string
function getAvatarColor(str: string): string {
  const colors = [
    "bg-blue-500",
    "bg-purple-500",
    "bg-green-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-indigo-500",
    "bg-teal-500",
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colorIndex = Math.abs(hash) % colors.length
  return colors[colorIndex] ?? "bg-purple-500"
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

export function WorkspaceSidebar({ partner, currentWorkspace, workspaces, isCollapsed, partnerRole, user }: Props) {
  const pathname = usePathname()
  const { logout } = useAuth()

  const branding = partner.branding
  
  // User display data
  const userName = user?.first_name 
    ? `${user.first_name} ${user.last_name || ""}`.trim() 
    : user?.email || "User"
  const userEmail = user?.email || ""
  const userInitials = user?.first_name 
    ? `${user.first_name[0]}${user.last_name?.[0] || ""}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "U"
  const companyName = branding.company_name || partner.name

  // Navigation items scoped to current workspace
  const baseUrl = `/w/${currentWorkspace.slug}`
  
  // Role-based navigation - some items only for admins/owners
  const isWorkspaceAdmin = currentWorkspace.role === "owner" || currentWorkspace.role === "admin"
  const isPartnerAdmin = partnerRole === "owner" || partnerRole === "admin"
  
  const navigation = [
    { title: "Dashboard", href: `${baseUrl}/dashboard`, icon: LayoutDashboard },
    { title: "Agents", href: `${baseUrl}/agents`, icon: Bot },
    { title: "Leads", href: `${baseUrl}/leads`, icon: Users },
    { title: "Knowledge Base", href: `${baseUrl}/knowledge-base`, icon: BookOpen },
    { title: "Integrations", href: `${baseUrl}/integrations`, icon: Plug },
    { title: "Telephony", href: `${baseUrl}/telephony`, icon: PhoneCall },
    ...(isWorkspaceAdmin ? [{ title: "Billing", href: `${baseUrl}/billing`, icon: CreditCard }] : []),
    { title: "Analytics", href: `${baseUrl}/analytics`, icon: BarChart3 },
    { title: "Calls", href: `${baseUrl}/calls`, icon: Phone },
    ...(isWorkspaceAdmin ? [{ title: "Workspace Team", href: `${baseUrl}/members`, icon: Users }] : []),
  ]
  
  // Organization-level navigation (for partner admins/owners)
  const orgNavigation = isPartnerAdmin ? [
    { title: "Organization Team", href: `/org/team`, icon: Building2 },
    { title: "Invite Members", href: `/org/invitations`, icon: UserPlus },
  ] : []

  return (
    <div
      className={cn(
        "hidden lg:flex flex-col h-full bg-card border-r border-border shrink-0 transition-[width] duration-300",
        isCollapsed ? "w-[4.5rem]" : "w-64"
      )}
    >
      {/* Partner Logo */}
      <div className={cn("p-4 border-b border-border", isCollapsed && "px-2")}>
        <Link
          href={`${baseUrl}/dashboard`}
          className={cn("flex items-center gap-3", isCollapsed && "justify-center")}
        >
          {branding.logo_url ? (
            isCollapsed ? (
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-bold">{companyName[0]}</span>
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
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-bold">{companyName[0]}</span>
              </div>
              {!isCollapsed && (
                <span className="text-xl font-bold text-foreground">{companyName}</span>
              )}
            </>
          )}
        </Link>
      </div>

      {/* Workspace Selector - Zapworks Inspired */}
      <div className={cn("p-3", isCollapsed && "px-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center gap-3 rounded-xl border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/30 transition-all group outline-none focus:ring-2 focus:ring-primary/20",
                isCollapsed ? "p-2 justify-center" : "p-3"
              )}
              title={isCollapsed ? currentWorkspace.name : undefined}
            >
              <div
                className={cn(
                  "rounded-lg flex items-center justify-center text-white font-semibold text-sm shrink-0",
                  isCollapsed ? "h-8 w-8" : "h-10 w-10",
                  getAvatarColor(currentWorkspace.name)
                )}
              >
                {getInitials(currentWorkspace.name)}
              </div>
              {!isCollapsed && (
                <>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-semibold text-foreground truncate">{currentWorkspace.name}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72" sideOffset={8}>
            <DropdownMenuLabel className="text-base font-semibold">My workspaces</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-y-auto">
              {workspaces.map((ws) => (
                <DropdownMenuItem key={ws.id} asChild className="p-0">
                  <Link
                    href={`/w/${ws.slug}/dashboard`}
                    className={cn(
                      "flex items-center gap-3 p-3 cursor-pointer w-full",
                      ws.id === currentWorkspace.id && "bg-primary/5"
                    )}
                  >
                    <div
                      className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm shrink-0",
                        getAvatarColor(ws.name)
                      )}
                    >
                      {getInitials(ws.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{ws.name}</p>
                      {ws.id === currentWorkspace.id && (
                        <p className="text-xs text-primary">Current workspace</p>
                      )}
                    </div>
                  </Link>
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href="/select-workspace"
                className="flex items-center gap-3 p-3 cursor-pointer"
              >
                <LayoutGrid className="h-5 w-5" />
                <span className="font-medium">View all workspaces</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator className="mx-3" />

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className={cn("space-y-1", isCollapsed ? "px-2" : "px-3")}>
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

      {/* User Footer */}
      <div className={cn("p-3 border-t border-border", isCollapsed && "px-2")}>
        {isCollapsed ? (
          <div className="flex justify-center">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{userInitials}</AvatarFallback>
            </Avatar>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{userInitials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={`${baseUrl}/settings`} className="flex items-center gap-2 cursor-pointer">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center gap-2 cursor-pointer">
                  <ShieldCheck className="h-4 w-4" />
                  Agent Review
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center gap-2 cursor-pointer">
                  <Users className="h-4 w-4" />
                  Join Community
                </DropdownMenuItem>
                <DropdownMenuItem className="flex items-center gap-2 cursor-pointer">
                  <HelpCircle className="h-4 w-4" />
                  Help Center
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  )
}
