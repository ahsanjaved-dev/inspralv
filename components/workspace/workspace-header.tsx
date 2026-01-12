"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Settings,
  LogOut,
  Building2,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
  CreditCard,
  PanelLeft,
  PanelLeftClose,
  Menu,
} from "lucide-react"
import { useAuth } from "@/lib/hooks/use-auth"
import { useTheme } from "@/context/theme-context"
import { cn } from "@/lib/utils"
import type { PartnerAuthUser, AccessibleWorkspace, PartnerMemberRole } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

interface Props {
  user: PartnerAuthUser
  partner: ResolvedPartner
  currentWorkspace: AccessibleWorkspace
  workspaces: AccessibleWorkspace[]
  isCollapsed: boolean
  onToggleSidebar: () => void
  partnerRole?: PartnerMemberRole | null
}

// Page name mapping for breadcrumbs
const pageNames: Record<string, string> = {
  dashboard: "Dashboard",
  agents: "Voice Agents",
  leads: "Leads",
  "knowledge-base": "Knowledge Base",
  integrations: "Integrations",
  billing: "Billing",
  analytics: "Analytics",
  calls: "Calls",
  members: "Members",
  settings: "Settings",
  conversations: "Conversations",
}

export function WorkspaceHeader({
  user,
  partner,
  currentWorkspace,
  workspaces,
  isCollapsed,
  onToggleSidebar,
  partnerRole,
}: Props) {
  // Check if user is a partner admin/owner
  const isPartnerAdmin = partnerRole === "owner" || partnerRole === "admin"
  const { logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const getInitials = () => {
    if (user.first_name && user.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    }
    return user.email[0]?.toUpperCase() || "U"
  }

  const getDisplayName = () => {
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`
    }
    return user.email
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
      case "admin":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
      case "member":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
    }
  }

  // Generate breadcrumbs from pathname
  const getBreadcrumbs = () => {
    const segments = pathname.split("/").filter(Boolean)
    const crumbs: { label: string; href?: string }[] = [{ label: "Home", href: `/w/${currentWorkspace.slug}/dashboard` }]

    // Find the page segment (after /w/[slug]/)
    if (segments.length >= 3) {
      const pageSegment = segments[2]
      if (pageSegment) {
        const pageName = pageNames[pageSegment] || pageSegment
        crumbs.push({ label: pageName })
      }
    }

    return crumbs
  }

  const breadcrumbs = getBreadcrumbs()

  return (
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6 shrink-0">
      {/* Left side - Collapse Button + Breadcrumbs */}
      <div className="flex items-center gap-4">
        {/* Desktop Collapse Button */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:flex h-9 w-9"
          onClick={onToggleSidebar}
        >
          {isCollapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </Button>

        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-9 w-9"
          onClick={onToggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Breadcrumbs */}
        <nav className="hidden md:flex items-center gap-2 text-sm">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1
            return (
              <div key={index} className="flex items-center gap-2">
                {index > 0 && <span className="text-muted-foreground">/</span>}
                {crumb.href && !isLast ? (
                  <a
                    href={crumb.href}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span className={cn(isLast ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {crumb.label}
                  </span>
                )}
              </div>
            )
          })}
        </nav>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Theme Selector - Segmented Control */}
        <div className="hidden sm:flex items-center gap-0.5 p-1 bg-muted rounded-lg">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme("light")}
            className={cn(
              "h-7 w-7 rounded-md transition-all",
              mounted && theme === "light"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-transparent"
            )}
            title="Light mode"
          >
            <Sun className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme("system")}
            className={cn(
              "h-7 w-7 rounded-md transition-all",
              mounted && theme === "system"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-transparent"
            )}
            title="System preference"
          >
            <Monitor className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme("dark")}
            className={cn(
              "h-7 w-7 rounded-md transition-all",
              mounted && theme === "dark"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-transparent"
            )}
            title="Dark mode"
          >
            <Moon className="h-4 w-4" />
          </Button>
        </div>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-9 px-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user.avatar_url || undefined} />
                <AvatarFallback className="text-xs">{getInitials()}</AvatarFallback>
              </Avatar>
              <div className="text-left hidden md:block">
                <p className="text-sm font-medium leading-none">{getDisplayName()}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{getDisplayName()}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(`/w/${currentWorkspace.slug}/settings`)}>
              <Settings className="w-4 h-4 mr-2" />
              Workspace Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/w/${currentWorkspace.slug}/billing`)}>
              <CreditCard className="w-4 h-4 mr-2" />
              Billing
            </DropdownMenuItem>
            {isPartnerAdmin && (
              <DropdownMenuItem onClick={() => router.push("/select-workspace")}>
                <Building2 className="w-4 h-4 mr-2" />
                Switch Workspace
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
