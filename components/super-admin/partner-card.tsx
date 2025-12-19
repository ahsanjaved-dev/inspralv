"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Briefcase, Globe, Building2, ExternalLink } from "lucide-react"
import type { Partner, PartnerDomain } from "@/types/database.types"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"

interface PartnerCardProps {
  partner: Partner & {
    partner_domains?: PartnerDomain[]
    workspace_count?: number
  }
}

const planColors: Record<string, string> = {
  free: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  starter: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  pro: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  enterprise: "bg-amber-500/20 text-amber-400 border-amber-500/30",
}

export function PartnerCard({ partner }: PartnerCardProps) {
  const primaryDomain = partner.partner_domains?.find((d) => d.is_primary)
  const domainCount = partner.partner_domains?.length || 0

  return (
    <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: partner.branding?.primary_color || "#7c3aed" }}
            >
              {partner.branding?.logo_url ? (
                <img
                  src={partner.branding.logo_url}
                  alt={partner.name}
                  className="w-6 h-6 object-contain"
                />
              ) : (
                <Briefcase className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <CardTitle className="text-white text-lg">{partner.name}</CardTitle>
              <p className="text-sm text-slate-500">/{partner.slug}</p>
            </div>
          </div>
          {partner.is_platform_partner && (
            <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30">
              Platform
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={planColors[partner.plan_tier] || planColors.starter}>
            {partner.plan_tier}
          </Badge>
          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
            {partner.subscription_status}
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" />
            <span className="text-slate-400">Workspaces:</span>
            <span className="text-white font-medium">{partner.workspace_count || 0}</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-500" />
            <span className="text-slate-400">Domains:</span>
            <span className="text-white font-medium">{domainCount}</span>
          </div>
        </div>

        {/* Primary Domain */}
        {primaryDomain && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Globe className="w-4 h-4" />
            <span className="truncate">{primaryDomain.hostname}</span>
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 border-t border-slate-700">
          <Button
            variant="outline"
            size="sm"
            className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
            asChild
          >
            <Link href={`/super-admin/partners/${partner.id}`}>
              <ExternalLink className="mr-2 h-3 w-3" />
              View Details
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
