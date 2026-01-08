"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Briefcase,
  Users,
  Settings,
  BarChart3,
  CreditCard,
  Shield,
  LayoutDashboard,
  FileText,
  Layers,
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/super-admin", icon: LayoutDashboard },
  { name: "Partner Requests", href: "/super-admin/partner-requests", icon: FileText },
  { name: "Partners", href: "/super-admin/partners", icon: Briefcase },
  { name: "Plan Variants", href: "/super-admin/variants", icon: Layers },
  { name: "Users", href: "/super-admin/users", icon: Users },
  { name: "Analytics", href: "/super-admin/analytics", icon: BarChart3 },
  { name: "Billing", href: "/super-admin/billing", icon: CreditCard },
  { name: "Security", href: "/super-admin/security", icon: Shield },
  { name: "Settings", href: "/super-admin/settings", icon: Settings },
]

export function SuperAdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 min-h-[calc(100vh-4rem)]">
      <nav className="p-4 space-y-1">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/super-admin" && pathname.startsWith(item.href))
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-violet-500 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
