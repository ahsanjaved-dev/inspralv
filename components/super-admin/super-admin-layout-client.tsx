"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  LayoutDashboard,
  Building2,
  Settings,
  LogOut,
  Shield,
  Users,
  BarChart3,
  Briefcase, // ← Add this import
  Globe,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { SuperAdmin } from "@/types/database.types"

const navigation = [
  { title: "Dashboard", href: "/super-admin", icon: LayoutDashboard },
  { title: "Partners", href: "/super-admin/partners", icon: Briefcase }, // ← Add this
  { title: "Organizations", href: "/super-admin/organizations", icon: Building2 },
  { title: "Analytics", href: "/super-admin/analytics", icon: BarChart3 },
  { title: "Settings", href: "/super-admin/settings", icon: Settings },
]

interface SuperAdminLayoutClientProps {
  superAdmin: SuperAdmin
  children: React.ReactNode
}

export function SuperAdminLayoutClient({ superAdmin, children }: SuperAdminLayoutClientProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/super-admin/login")
    router.refresh()
  }

  const initials =
    `${superAdmin.first_name?.[0] || ""}${superAdmin.last_name?.[0] || ""}`.toUpperCase() || "SA"

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900">
      {/* Sidebar */}
      <div className="flex flex-col w-64 bg-slate-800 border-r border-slate-700">
        {/* Logo */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-linear-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Inspralv</h1>
              <p className="text-xs text-slate-400">Super Admin</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive =
              pathname === item.href ||
              (item.href !== "/super-admin" && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                  isActive
                    ? "bg-violet-500/20 text-violet-400"
                    : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.title}</span>
              </Link>
            )
          })}
        </nav>

        {/* User Menu */}
        <div className="p-4 border-t border-slate-700">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-700/50"
              >
                <Avatar className="h-8 w-8 mr-3">
                  <AvatarFallback className="bg-violet-500/20 text-violet-400 text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">
                    {superAdmin.first_name} {superAdmin.last_name}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{superAdmin.email}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Super Admin Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-slate-700 bg-slate-800/50 backdrop-blur flex items-center px-6">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">
              {navigation.find(
                (n) =>
                  pathname === n.href || (n.href !== "/super-admin" && pathname.startsWith(n.href))
              )?.title || "Dashboard"}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">Platform Administration</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-slate-900 p-6">{children}</main>
      </div>
    </div>
  )
}
