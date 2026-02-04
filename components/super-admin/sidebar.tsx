"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Building2,
  CreditCard,
  LayoutDashboard,
  FileText,
  Layers,
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/super-admin", icon: LayoutDashboard },
  { name: "Agencies", href: "/super-admin/partners", icon: Building2 },
  { name: "Partner Requests", href: "/super-admin/partner-requests", icon: FileText },
  { name: "Plans", href: "/super-admin/plans", icon: Layers },
  { name: "Billing", href: "/super-admin/billing", icon: CreditCard },
]

export function SuperAdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-card border-r border-border min-h-[calc(100vh-4rem)]">
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
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
