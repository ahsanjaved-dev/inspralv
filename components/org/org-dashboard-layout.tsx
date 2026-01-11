"use client"

import { useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BrandingProvider } from "@/context/branding-context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Building2,
  Users,
  UserPlus,
  Settings,
  LogOut,
  MoreVertical,
  ChevronLeft,
  LayoutGrid,
  CreditCard,
  Package,
  Plug,
} from "lucide-react"
import { useAuth } from "@/lib/hooks/use-auth"
import type { PartnerAuthUser, AccessibleWorkspace, PartnerMemberRole } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

interface Props {
  user: PartnerAuthUser
  partner: ResolvedPartner
  partnerRole: PartnerMemberRole
  workspaces: AccessibleWorkspace[]
  children: React.ReactNode
}

/**
 * Convert HEX color to HSL string for CSS variables
 */
function hexToHsl(hex: string): string {
  hex = hex.replace(/^#/, "")
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

export function OrgDashboardLayout({
  user,
  partner,
  partnerRole,
  workspaces,
  children,
}: Props) {
  const pathname = usePathname()
  const { logout } = useAuth()

  const branding = partner.branding
  const companyName = branding.company_name || partner.name

  // Compute CSS custom properties from partner branding
  const brandingStyles = useMemo(() => {
    const styles: Record<string, string> = {}
    if (branding.primary_color) {
      const primaryHsl = hexToHsl(branding.primary_color)
      styles["--primary"] = `hsl(${primaryHsl})`
      styles["--sidebar-primary"] = `hsl(${primaryHsl})`
      styles["--ring"] = `hsl(${primaryHsl})`
      styles["--brand-primary"] = branding.primary_color
    }
    if (branding.secondary_color) {
      const secondaryHsl = hexToHsl(branding.secondary_color)
      styles["--secondary"] = `hsl(${secondaryHsl})`
      styles["--brand-secondary"] = branding.secondary_color
    }
    return styles
  }, [branding])

  const isPlatformPartner = partner.is_platform_partner
  
  const navigation = [
    { title: "Overview", href: "/org", icon: LayoutGrid },
    { title: "Integrations", href: "/org/integrations", icon: Plug },
    // Team invitations for org admins/members
    { title: "Team Invitations", href: "/org/invitations", icon: UserPlus },
    // Client invitations - only for white-label partners
    ...(!isPlatformPartner ? [{ title: "Client Invitations", href: "/org/clients", icon: Users }] : []),
    { title: "Billing", href: "/org/billing", icon: CreditCard },
    { title: "Subscription Plans", href: "/org/plans", icon: Package },
    { title: "Settings", href: "/org/settings", icon: Settings },
  ]

  return (
    <BrandingProvider partner={partner}>
      <div 
        className={cn("workspace-theme flex h-screen overflow-hidden bg-background text-foreground")}
        style={brandingStyles as React.CSSProperties}
      >
        {/* Sidebar */}
        <div className="hidden lg:flex flex-col h-full bg-card border-r border-border shrink-0 w-64">
          {/* Partner Logo */}
          <div className="p-4 border-b border-border">
            <Link href="/select-workspace" className="flex items-center gap-3">
              {branding.logo_url ? (
                <img
                  src={branding.logo_url}
                  alt={companyName}
                  className="h-8 max-w-[10rem] object-contain"
                />
              ) : (
                <>
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold">{companyName[0]}</span>
                  </div>
                  <span className="text-xl font-bold text-foreground">{companyName}</span>
                </>
              )}
            </Link>
          </div>

          {/* Organization Header */}
          <div className="p-4">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
              <Building2 className="h-5 w-5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Organization</p>
                <p className="text-xs text-muted-foreground capitalize">{partnerRole}</p>
              </div>
            </div>
          </div>

          <Separator className="mx-4" />

          {/* Navigation */}
          <ScrollArea className="flex-1 py-4">
            <nav className="space-y-1 px-3">
              {navigation.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

                return (
                  <Link
                    key={item.href}
                    href={item.href}
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
            </nav>

            {/* Back to Workspaces */}
            <div className="mt-6 px-3">
              <Separator className="mb-4" />
              <Link
                href="/select-workspace"
                className="flex items-center gap-3 rounded-lg text-sm font-medium px-3 py-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-5 h-5 shrink-0" />
                <span>Back to Workspaces</span>
              </Link>
            </div>
          </ScrollArea>

          {/* User Footer */}
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-3 px-2">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                  {user.first_name?.[0] || user.email?.[0]?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user.first_name ? `${user.first_name} ${user.last_name || ""}`.trim() : user.email}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href="/select-workspace" className="flex items-center gap-2 cursor-pointer">
                      <LayoutGrid className="h-4 w-4" />
                      Workspaces
                    </Link>
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
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-16 border-b border-border bg-card flex items-center px-6 gap-4">
            <div className="flex-1">
              <h1 className="text-lg font-semibold">Organization Management</h1>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
            <div className="max-w-[1400px] mx-auto">{children}</div>
          </main>
        </div>
      </div>
    </BrandingProvider>
  )
}

