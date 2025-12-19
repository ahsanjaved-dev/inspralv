"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  BarChart3,
  Settings,
  LogOut,
  Users,
  Building2,
  ChevronDown,
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
import type { AccessibleWorkspace } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

interface Props {
  partner: ResolvedPartner
  currentWorkspace: AccessibleWorkspace
  workspaces: AccessibleWorkspace[]
}

export function WorkspaceSidebar({ partner, currentWorkspace, workspaces }: Props) {
  const pathname = usePathname()
  const { logout } = useAuth()

  const branding = partner.branding
  const companyName = branding.company_name || partner.name
  const primaryColor = branding.primary_color || "#7c3aed"

  // Navigation items scoped to current workspace
  const baseUrl = `/w/${currentWorkspace.slug}`
  const navigation = [
    { title: "Dashboard", href: `${baseUrl}/dashboard`, icon: LayoutDashboard },
    { title: "Agents", href: `${baseUrl}/agents`, icon: Bot },
    { title: "Conversations", href: `${baseUrl}/conversations`, icon: MessageSquare },
    { title: "Members", href: `${baseUrl}/members`, icon: Users },
    { title: "Analytics", href: `${baseUrl}/analytics`, icon: BarChart3 },
    { title: "Settings", href: `${baseUrl}/settings`, icon: Settings },
  ]

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white w-64">
      {/* Partner Logo/Company Section */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt={companyName}
              className="h-8 w-8 rounded-lg object-contain"
            />
          ) : (
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: primaryColor }}
            >
              {companyName[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold truncate max-w-[160px]">{companyName}</h1>
            <p className="text-xs text-gray-400">AI Voice Platform</p>
          </div>
        </div>
      </div>

      {/* Workspace Selector */}
      <div className="px-4 py-3 border-b border-gray-800">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between text-left h-auto py-2 px-3 hover:bg-gray-800"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{currentWorkspace.name}</p>
                  <p className="text-xs text-gray-400 capitalize">{currentWorkspace.role}</p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Switch Workspace</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {workspaces.map((ws) => (
              <DropdownMenuItem key={ws.id} asChild>
                <Link
                  href={`/w/${ws.slug}/dashboard`}
                  className={cn(
                    "flex items-center gap-2 cursor-pointer",
                    ws.id === currentWorkspace.id && "bg-muted"
                  )}
                >
                  <Building2 className="h-4 w-4" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{ws.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{ws.role}</p>
                  </div>
                  {ws.id === currentWorkspace.id && (
                    <span className="text-xs text-primary">Current</span>
                  )}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/select-workspace" className="flex items-center gap-2 cursor-pointer">
                <LayoutDashboard className="h-4 w-4" />
                View All Workspaces
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                isActive ? "text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
              )}
              style={isActive ? { backgroundColor: primaryColor } : undefined}
            >
              <Icon className="w-5 h-5" />
              <span>{item.title}</span>
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-800">
        <Button
          variant="ghost"
          className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800"
          onClick={logout}
        >
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  )
}
