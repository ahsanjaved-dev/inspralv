"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import {
  LayoutDashboard,
  Briefcase,
  CreditCard,
  LogOut,
  Shield,
  PanelLeftClose,
  PanelLeft,
  Menu,
  FileText,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { SuperAdmin } from "@/types/database.types"

// Import ResolvedPartner type from api
import type { ResolvedPartner } from "@/lib/api/partner"
import { SuperAdminHeader } from "./super-admin-header"

const navigation = [
  { title: "Dashboard", href: "/super-admin", icon: LayoutDashboard },
  { title: "Agencies", href: "/super-admin/partners", icon: Briefcase },
  { title: "Partner Requests", href: "/super-admin/partner-requests", icon: FileText },
  { title: "Billing", href: "/super-admin/billing", icon: CreditCard },
]

interface SuperAdminLayoutClientProps {
  superAdmin: SuperAdmin
  partner: ResolvedPartner
  children: React.ReactNode
}

export function SuperAdminLayoutClient({ superAdmin, partner, children }: SuperAdminLayoutClientProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)

  // Load saved states on mount
  useEffect(() => {
    const savedCollapsed = localStorage.getItem("superadmin-sidebar-collapsed")
    if (savedCollapsed === "true") {
      setIsCollapsed(true)
    }
    const savedTheme = localStorage.getItem("superadmin-theme")
    if (savedTheme === "dark") {
      setIsDark(true)
    }
  }, [])

  const toggleSidebar = () => {
    const newCollapsed = !isCollapsed
    setIsCollapsed(newCollapsed)
    localStorage.setItem("superadmin-sidebar-collapsed", String(newCollapsed))
  }

  const initials =
    `${superAdmin.first_name?.[0] || ""}${superAdmin.last_name?.[0] || ""}`.toUpperCase() || "SA"

  // Get current page title for breadcrumb
  const currentNav = navigation.find(
    (n) => pathname === n.href || (n.href !== "/super-admin" && pathname.startsWith(n.href))
  )
  const pageTitle = currentNav?.title || "Dashboard"

  // Breadcrumb items
  const breadcrumbs = [
    { label: "Super Admin", href: "/super-admin" },
    ...(pageTitle !== "Dashboard" ? [{ label: pageTitle }] : []),
  ]

  const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <>
      {/* Logo */}
      <div className={cn("p-4 border-b border-border", collapsed && "px-2")}>
        <Link href="/super-admin" className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          {/* Logo Image from Partner Branding */}
          {partner.branding?.logo_url ? (
            <div className="w-10 h-10 flex-shrink-0 relative">
              <Image
                src={partner.branding.logo_url}
                alt="Platform Logo"
                fill
                className="object-contain rounded-lg"
                priority
              />
            </div>
          ) : (
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
          )}
          {!collapsed && (
            <div>
              <h1 className="text-lg font-bold text-foreground">Genius365</h1>
              <p className="text-xs text-muted-foreground">Super Admin</p>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className={cn("space-y-1", collapsed ? "px-2" : "px-3")}>
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive =
              pathname === item.href ||
              (item.href !== "/super-admin" && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.title : undefined}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg transition-colors",
                  collapsed ? "justify-center p-3" : "px-3 py-2.5",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="font-medium text-sm">{item.title}</span>}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      {/* User Menu - Moved to Header */}
    </>
  )

  return (
    <div className={cn("superadmin-theme min-h-screen", isDark && "dark")}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            "hidden lg:flex flex-col bg-card border-r border-border flex-shrink-0 transition-[width] duration-300",
            isCollapsed ? "w-[4.5rem]" : "w-64"
          )}
        >
          <SidebarContent collapsed={isCollapsed} />
        </aside>

        {/* Mobile Sidebar */}
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetContent side="left" className="w-64 p-0 bg-card">
            {/* Hidden title for accessibility (required by Dialog/Sheet) */}
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex flex-col h-full">
              <SidebarContent />
            </div>
          </SheetContent>
        </Sheet>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <header className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
            <div className="flex items-center justify-between h-full px-4 lg:px-6">
              <div className="flex items-center gap-4">
                {/* Mobile Menu Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  onClick={() => setIsMobileOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </Button>

                {/* Desktop Collapse Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden lg:flex"
                  onClick={toggleSidebar}
                >
                  {isCollapsed ? (
                    <PanelLeft className="h-5 w-5" />
                  ) : (
                    <PanelLeftClose className="h-5 w-5" />
                  )}
                </Button>

                {/* Breadcrumbs */}
                <nav className="hidden md:flex items-center gap-2 text-sm">
                  {breadcrumbs.map((crumb, idx) => (
                    <span key={idx} className="flex items-center gap-2">
                      {idx > 0 && <span className="text-muted-foreground">/</span>}
                      {crumb.href ? (
                        <Link
                          href={crumb.href}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="text-foreground font-medium">{crumb.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              </div>

              <div className="flex items-center gap-2">
                {/* New Header Component - Theme + User Menu */}
                <SuperAdminHeader superAdmin={superAdmin} isDark={isDark} setIsDark={setIsDark} />
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto bg-background">
            <div className="page-container p-6 max-w-[1400px] mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
