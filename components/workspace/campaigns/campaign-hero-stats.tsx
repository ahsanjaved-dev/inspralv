"use client"

/**
 * Campaign Hero Stats Component
 * 
 * A stunning stats overview with:
 * - Animated counters
 * - Gradient backgrounds
 * - Hover interactions
 * - Responsive layout
 */

import { motion } from "framer-motion"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  Phone,
  PhoneCall,
  Users,
  CheckCircle2,
  TrendingUp,
  Zap,
  Activity,
} from "lucide-react"

interface HeroStatProps {
  label: string
  value: number
  icon: React.ReactNode
  gradient: string
  textGradient: string
  suffix?: string
  trend?: { value: number; isPositive: boolean }
  delay?: number
}

function HeroStat({
  label,
  value,
  icon,
  gradient,
  textGradient,
  suffix,
  trend,
  delay = 0,
}: HeroStatProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <Card
        className={cn(
          "relative overflow-hidden p-6 border-0",
          "bg-gradient-to-br",
          gradient,
          "hover:shadow-xl transition-all duration-300"
        )}
      >
        {/* Decorative element */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/5 rounded-full blur-xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">{icon}</div>
            {trend && (
              <div
                className={cn(
                  "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-white/20 backdrop-blur-sm",
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
            <p className={cn("text-4xl font-bold tracking-tight", textGradient)}>
              {value.toLocaleString()}
              {suffix && <span className="text-2xl ml-1">{suffix}</span>}
            </p>
            <p className="text-sm font-medium text-white/80">{label}</p>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

interface CampaignHeroStatsProps {
  totalCampaigns: number
  activeCampaigns: number
  totalRecipients: number
  processedCalls: number
  successRate?: number
  isLoading?: boolean
  className?: string
}

export function CampaignHeroStats({
  totalCampaigns,
  activeCampaigns,
  totalRecipients,
  processedCalls,
  successRate,
  isLoading = false,
  className,
}: CampaignHeroStatsProps) {
  if (isLoading) {
    return (
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
        {[...Array(4)].map((_, i) => (
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
      textGradient: "text-white",
      delay: 0,
    },
    {
      label: "Active Campaigns",
      value: activeCampaigns,
      icon: <PhoneCall className="h-5 w-5 text-white" />,
      gradient: "from-emerald-500 to-teal-600",
      textGradient: "text-white",
      delay: 0.1,
      trend: activeCampaigns > 0 ? { value: activeCampaigns, isPositive: true } : undefined,
    },
    {
      label: "Total Recipients",
      value: totalRecipients,
      icon: <Users className="h-5 w-5 text-white" />,
      gradient: "from-blue-500 to-cyan-600",
      textGradient: "text-white",
      delay: 0.2,
    },
    {
      label: "Processed Calls",
      value: processedCalls,
      icon: <CheckCircle2 className="h-5 w-5 text-white" />,
      gradient: "from-violet-500 to-fuchsia-600",
      textGradient: "text-white",
      delay: 0.3,
      trend: successRate ? { value: successRate, isPositive: successRate >= 50 } : undefined,
    },
  ]

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
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
        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
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

