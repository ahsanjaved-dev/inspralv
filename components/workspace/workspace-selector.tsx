"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Building2, ChevronRight, Users, Bot, LogOut } from "lucide-react"
import { useAuth } from "@/lib/hooks/use-auth"
import type { AccessibleWorkspace, PartnerAuthUser } from "@/types/database.types"
import type { ResolvedPartner } from "@/lib/api/partner"

interface Props {
  workspaces: AccessibleWorkspace[]
  partner: ResolvedPartner
  user: PartnerAuthUser
}

export function WorkspaceSelector({ workspaces, partner, user }: Props) {
  const { logout } = useAuth()
  const branding = partner.branding
  const primaryColor = branding.primary_color || "#7c3aed"
  const companyName = branding.company_name || partner.name

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default"
      case "admin":
        return "secondary"
      default:
        return "outline"
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-xl">
      <CardHeader className="text-center pb-2">
        {/* Partner Logo */}
        {branding.logo_url ? (
          <img src={branding.logo_url} alt={companyName} className="h-12 mx-auto mb-4" />
        ) : (
          <div
            className="h-14 w-14 mx-auto mb-4 rounded-xl flex items-center justify-center text-white font-bold text-2xl shadow-lg"
            style={{ backgroundColor: primaryColor }}
          >
            {companyName[0]}
          </div>
        )}
        <CardTitle className="text-2xl">Welcome back!</CardTitle>
        <CardDescription className="text-base">Select a workspace to continue</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Workspace List */}
        {workspaces.map((workspace) => (
          <Link
            key={workspace.id}
            href={`/w/${workspace.slug}/dashboard`}
            className="flex items-center justify-between p-4 rounded-xl border-2 border-transparent hover:border-primary/20 hover:bg-muted/50 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg text-white" style={{ backgroundColor: primaryColor }}>
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-lg">{workspace.name}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant={getRoleBadgeVariant(workspace.role)} className="capitalize">
                    {workspace.role}
                  </Badge>
                  {workspace.description && (
                    <span className="truncate max-w-[150px]">{workspace.description}</span>
                  )}
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
          </Link>
        ))}

        {/* User Info & Logout */}
        <div className="pt-4 mt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{user.email}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-muted-foreground hover:text-red-600"
            >
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
