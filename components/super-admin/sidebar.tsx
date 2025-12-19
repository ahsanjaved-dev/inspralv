"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Building2,
  Users,
  Settings,
  BarChart3,
  CreditCard,
  Shield,
  Bell,
  Briefcase,
} from "lucide-react"

const navigation = [
  { name: "Partners", href: "/super-admin/partners", icon: Briefcase },
  { name: "Organizations", href: "/super-admin", icon: Building2 }, // Keep for legacy viewing
  { name: "Users", href: "/super-admin/users", icon: Users },
  { name: "Analytics", href: "/super-admin/analytics", icon: BarChart3 },
  { name: "Billing", href: "/super-admin/billing", icon: CreditCard },
  { name: "Security", href: "/super-admin/security", icon: Shield },
  { name: "Notifications", href: "/super-admin/notifications", icon: Bell },
  { name: "Settings", href: "/super-admin/settings", icon: Settings },
]

export function SuperAdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-[calc(100vh-4rem)]">
      <nav className="p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
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
