"use client"

/**
 * Campaign Stats Card Component
 * 
 * A beautiful, animated stats display with:
 * - Animated counters
 * - Trend indicators
 * - Sparkline visualization
 * - Color-coded metrics
 */

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Phone,
  PhoneCall,
  TrendingUp,
  TrendingDown,
  Activity,
  Timer,
} from "lucide-react"

interface StatCardProps {
  label: string
  value: number
  icon: React.ReactNode
  color: string
  bgColor: string
  trend?: number // percentage change
  suffix?: string
  delay?: number
}

function AnimatedValue({ value, suffix = "" }: { value: number; suffix?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="tabular-nums"
    >
      {value.toLocaleString()}
      {suffix}
    </motion.span>
  )
}

function StatCard({ label, value, icon, color, bgColor, trend, suffix, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-4",
        "hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5"
      )}
    >
      {/* Decorative gradient */}
      <div
        className={cn(
          "absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20",
          bgColor
        )}
      />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <div className={cn("p-2 rounded-lg", bgColor)}>
            <span className={color}>{icon}</span>
          </div>
          {trend !== undefined && trend !== 0 && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                trend > 0
                  ? "text-green-600 bg-green-100 dark:bg-green-900/30"
                  : "text-red-600 bg-red-100 dark:bg-red-900/30"
              )}
            >
              {trend > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(trend)}%
            </div>
          )}
        </div>

        <p className="text-2xl font-bold tracking-tight">
          <AnimatedValue value={value} suffix={suffix} />
        </p>
        <p className="text-sm text-muted-foreground mt-1">{label}</p>
      </div>
    </motion.div>
  )
}

interface CampaignStatsGridProps {
  totalRecipients: number
  pendingCalls: number
  completedCalls: number
  successfulCalls: number
  failedCalls: number
  callsPerMinute?: number
  avgDuration?: number // seconds
  className?: string
}

export function CampaignStatsGrid({
  totalRecipients,
  pendingCalls,
  completedCalls,
  successfulCalls,
  failedCalls,
  callsPerMinute,
  avgDuration,
  className,
}: CampaignStatsGridProps) {
  const stats: Array<{
    label: string
    value: number
    icon: React.ReactNode
    color: string
    bgColor: string
    trend?: number
    suffix?: string
  }> = [
    {
      label: "Total Recipients",
      value: totalRecipients,
      icon: <Users className="h-5 w-5" />,
      color: "text-indigo-600 dark:text-indigo-400",
      bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    },
    {
      label: "Pending",
      value: pendingCalls,
      icon: <Clock className="h-5 w-5" />,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
    },
    {
      label: "Answered",
      value: successfulCalls,
      icon: <CheckCircle2 className="h-5 w-5" />,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
      trend: completedCalls > 0 ? Math.round((successfulCalls / completedCalls) * 100) : undefined,
    },
    {
      label: "Failed",
      value: failedCalls,
      icon: <XCircle className="h-5 w-5" />,
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-100 dark:bg-red-900/30",
    },
  ]

  // Add optional metrics
  if (callsPerMinute !== undefined && callsPerMinute > 0) {
    stats.push({
      label: "Calls/Minute",
      value: callsPerMinute,
      icon: <Activity className="h-5 w-5" />,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
    })
  }

  if (avgDuration !== undefined && avgDuration > 0) {
    const minutes = Math.floor(avgDuration / 60)
    const seconds = avgDuration % 60
    stats.push({
      label: "Avg Duration",
      value: minutes * 60 + seconds,
      icon: <Timer className="h-5 w-5" />,
      color: "text-cyan-600 dark:text-cyan-400",
      bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
      suffix: "s",
    })
  }

  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4", className)}>
      {stats.map((stat, index) => (
        <StatCard key={stat.label} {...stat} delay={index * 0.1} />
      ))}
    </div>
  )
}

// Compact version for campaign list
export function CampaignStatsCompact({
  total,
  completed,
  successful,
  failed,
  isActive,
}: {
  total: number
  completed: number
  successful: number
  failed: number
  isActive?: boolean
}) {
  const successRate = completed > 0 ? Math.round((successful / completed) * 100) : 0

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-1.5">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{total.toLocaleString()}</span>
      </div>

      {isActive && (
        <>
          <span className="text-muted-foreground">•</span>
          <div className="flex items-center gap-1.5 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span>{successful}</span>
          </div>
          {failed > 0 && (
            <>
              <span className="text-muted-foreground">•</span>
              <div className="flex items-center gap-1.5 text-red-500">
                <XCircle className="h-4 w-4" />
                <span>{failed}</span>
              </div>
            </>
          )}
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">{successRate}% success</span>
        </>
      )}
    </div>
  )
}

