"use client"

/**
 * Campaign Hero Stats Component (OPTIMIZED)
 * 
 * Lightweight stats overview without heavy animations.
 * Shows only scalable aggregate stats (Total Campaigns, Active Campaigns).
 * Removed per-call stats that don't scale well for millions of calls.
 */

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  Phone,
  PhoneCall,
  TrendingUp,
} from "lucide-react"

interface HeroStatProps {
  label: string
  value: number
  icon: React.ReactNode
  gradient: string
  suffix?: string
  trend?: { value: number; isPositive: boolean }
}

function HeroStat({ label, value, icon, gradient, suffix, trend }: HeroStatProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden p-6 border-0 bg-gradient-to-br",
        gradient,
        "hover:shadow-lg transition-shadow duration-200"
      )}
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="p-2 bg-white/20 rounded-lg">{icon}</div>
          {trend && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-white/20",
                trend.isPositive ? "text-emerald-100" : "text-rose-100"
              )}
            >
              <TrendingUp
                className={cn("h-3 w-3", !trend.isPositive && "rotate-180")}
              />
              {trend.value}%
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-4xl font-bold tracking-tight text-white tabular-nums">
            {value.toLocaleString()}
            {suffix && <span className="text-2xl ml-1">{suffix}</span>}
          </p>
          <p className="text-sm font-medium text-white/80">{label}</p>
        </div>
      </div>
    </Card>
  )
}

interface CampaignHeroStatsProps {
  totalCampaigns: number
  activeCampaigns: number
  /** @deprecated Not used - removed for scalability */
  totalRecipients?: number
  /** @deprecated Not used - removed for scalability */
  processedCalls?: number
  /** @deprecated Not used - removed for scalability */
  successRate?: number
  isLoading?: boolean
  className?: string
}

export function CampaignHeroStats({
  totalCampaigns,
  activeCampaigns,
  isLoading = false,
  className,
}: CampaignHeroStatsProps) {
  if (isLoading) {
    return (
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4", className)}>
        {[...Array(2)].map((_, i) => (
          <Card key={i} className="p-6 animate-pulse bg-muted/50">
            <div className="h-10 w-10 bg-muted rounded-lg mb-4" />
            <div className="h-8 w-20 bg-muted rounded mb-2" />
            <div className="h-4 w-16 bg-muted rounded" />
          </Card>
        ))}
      </div>
    )
  }

  const stats: HeroStatProps[] = [
    {
      label: "Total Campaigns",
      value: totalCampaigns,
      icon: <Phone className="h-5 w-5 text-white" />,
      gradient: "from-indigo-500 to-purple-600",
    },
    {
      label: "Active Campaigns",
      value: activeCampaigns,
      icon: <PhoneCall className="h-5 w-5 text-white" />,
      gradient: "from-emerald-500 to-teal-600",
      trend: activeCampaigns > 0 ? { value: activeCampaigns, isPositive: true } : undefined,
    },
  ]

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4", className)}>
      {stats.map((stat) => (
        <HeroStat key={stat.label} {...stat} />
      ))}
    </div>
  )
}

// Compact version for smaller spaces
export function CampaignQuickStats({
  active,
  pending,
  completed,
  className,
}: {
  active: number
  pending: number
  completed: number
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-4 text-sm", className)}>
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="font-medium">{active}</span>
        <span className="text-muted-foreground">active</span>
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-amber-500" />
        <span className="font-medium">{pending}</span>
        <span className="text-muted-foreground">pending</span>
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-blue-500" />
        <span className="font-medium">{completed}</span>
        <span className="text-muted-foreground">completed</span>
      </div>
    </div>
  )
}
