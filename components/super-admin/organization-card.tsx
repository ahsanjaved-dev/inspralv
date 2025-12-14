"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Building2, Calendar, Copy, Check, ExternalLink } from "lucide-react"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { Organization } from "@/types/database.types"
import { formatDistanceToNow } from "date-fns"

interface OrganizationCardProps {
  organization: Organization
}

const statusColors: Record<string, string> = {
  pending_activation: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  onboarding: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  active: "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30",
  suspended: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
  churned: "bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30",
}

const planColors: Record<string, string> = {
  starter: "bg-slate-500/20 text-slate-600 dark:text-slate-300 border-slate-500/30",
  professional: "bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30",
  enterprise: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
  custom: "bg-pink-500/20 text-pink-600 dark:text-pink-400 border-pink-500/30",
}

export function OrganizationCard({ organization }: OrganizationCardProps) {
  const [copied, setCopied] = useState(false)

  // Fetch invitation for pending organizations
  const { data: invitationData } = useQuery({
    queryKey: ["org-invitation", organization.id],
    queryFn: async () => {
      const response = await fetch(`/api/super-admin/organizations/${organization.id}/invitation`)
      if (!response.ok) return null
      const data = await response.json()
      return data.data
    },
    enabled: organization.status === "pending_activation",
  })

  const copyInviteLink = async () => {
    if (invitationData?.invitation_link) {
      await navigator.clipboard.writeText(invitationData.invitation_link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <CardTitle className="text-white text-lg">{organization.name}</CardTitle>
              <p className="text-sm text-slate-500">/{organization.slug}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={statusColors[organization.status]}>
            {organization.status.replace(/_/g, " ")}
          </Badge>
          <Badge variant="outline" className={planColors[organization.plan_tier]}>
            {organization.plan_tier}
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Monthly Minutes</p>
            <p className="text-white font-medium">{organization.current_month_minutes}</p>
          </div>
          <div>
            <p className="text-slate-500">Monthly Cost</p>
            <p className="text-white font-medium">${organization.current_month_cost.toFixed(2)}</p>
          </div>
        </div>

        {/* Created */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Calendar className="w-4 h-4" />
          <span>
            Created {formatDistanceToNow(new Date(organization.created_at), { addSuffix: true })}
          </span>
        </div>

        {/* Invitation Link for Pending Orgs */}
        {organization.status === "pending_activation" && invitationData && (
          <div className="pt-2 border-t border-slate-700">
            <p className="text-xs text-slate-500 mb-2">Invited: {invitationData.email}</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
              onClick={copyInviteLink}
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-3 w-3" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-3 w-3" />
                  Copy Invitation Link
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
