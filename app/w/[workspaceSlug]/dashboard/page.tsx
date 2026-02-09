"use client"

import { useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Bot,
  Phone,
  LayoutGrid,
  Loader2,
  Plus,
  TrendingUp,
  ArrowRight,
  Activity,
  Clock,
  DollarSign,
  Users,
  Building2,
  Shield,
  Crown,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle,
  XCircle,
  Monitor,
  CalendarIcon,
} from "lucide-react"
import Link from "next/link"
import { useDashboardData, type DashboardDateFilter } from "@/lib/hooks/use-dashboard-data"
import { useDashboardCharts, formatDuration, formatRelativeTime } from "@/lib/hooks/use-dashboard-charts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { format, startOfDay, endOfDay } from "date-fns"

// ============================================================================
// ROLE BADGE COMPONENT
// ============================================================================

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null
  
  const config = {
    owner: { icon: Crown, label: "Owner", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    admin: { icon: Shield, label: "Admin", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    member: { icon: Users, label: "Member", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
    viewer: { icon: Users, label: "Viewer", className: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
  }
  
  const roleConfig = config[role as keyof typeof config] || config.member
  const Icon = roleConfig.icon
  
  return (
    <Badge variant="outline" className={cn("gap-1", roleConfig.className)}>
      <Icon className="h-3 w-3" />
      {roleConfig.label}
    </Badge>
  )
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ElementType
  iconClassName?: string
  trend?: string
  isLoading?: boolean
}

function StatCard({ label, value, icon: Icon, iconClassName, trend, isLoading }: StatCardProps) {
  return (
    <Card className="stat-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="stat-label">{label}</p>
          {isLoading ? (
            <div className="flex items-center gap-2 mt-1">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <p className="stat-value">{value}</p>
          )}
        </div>
        <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", iconClassName || "bg-primary/10")}>
          <Icon className="w-6 h-6 text-inherit" />
        </div>
      </div>
      {trend && (
        <div className="stat-trend positive">
          <TrendingUp className="w-3 h-3" />
          <span>{trend}</span>
        </div>
      )}
    </Card>
  )
}

// ============================================================================
// SIMPLE BAR CHART COMPONENT
// ============================================================================

interface BarChartProps {
  data: { date: string; calls: number }[]
  isLoading?: boolean
}

function SimpleBarChart({ data, isLoading }: BarChartProps) {
  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const maxCalls = Math.max(...data.map((d) => d.calls), 1)
  const hasData = data.some((d) => d.calls > 0)

  if (!hasData) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No call data yet</p>
          <p className="text-xs">Charts will appear when you have calls</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-64 flex flex-col">
      {/* Chart area */}
      <div className="flex-1 flex items-end gap-1 px-2">
        {data.map((item, index) => {
          const height = (item.calls / maxCalls) * 100
          return (
            <div
              key={item.date}
              className="flex-1 flex flex-col items-center group"
            >
              {/* Bar */}
              <div className="relative w-full flex justify-center">
                <div
                  className="w-full max-w-8 bg-primary/80 rounded-t transition-all hover:bg-primary group-hover:bg-primary"
                  style={{ height: `${Math.max(height, 2)}%`, minHeight: item.calls > 0 ? "4px" : "2px" }}
                />
                {/* Tooltip */}
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border">
                  {item.calls} calls
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex gap-1 px-2 mt-2 border-t pt-2">
        {data.map((item, index) => {
          // Show label for first, last, and every 3rd item
          const showLabel = index === 0 || index === data.length - 1 || index % 3 === 0
          return (
            <div key={item.date} className="flex-1 text-center">
              {showLabel && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(item.date), "MMM d")}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// SIMPLE DONUT CHART COMPONENT
// ============================================================================

interface DonutChartProps {
  data: { status: string; label: string; count: number; color: string }[]
  isLoading?: boolean
}

function SimpleDonutChart({ data, isLoading }: DonutChartProps) {
  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const total = data.reduce((sum, d) => sum + d.count, 0)

  if (total === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No outcome data yet</p>
          <p className="text-xs">Charts will appear when you have calls</p>
        </div>
      </div>
    )
  }

  // Calculate SVG arcs
  const size = 120
  const strokeWidth = 24
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  let currentOffset = 0
  const arcs = data.map((item) => {
    const percentage = item.count / total
    const dashLength = circumference * percentage
    const dashOffset = circumference - currentOffset
    currentOffset += dashLength
    return {
      ...item,
      percentage,
      dashLength,
      dashOffset,
    }
  })

  return (
    <div className="h-64 flex items-center justify-center gap-6">
      {/* Donut Chart */}
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />
          {/* Data arcs */}
          {arcs.map((arc, index) => (
            <circle
              key={arc.status}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${arc.dashLength} ${circumference - arc.dashLength}`}
              strokeDashoffset={arc.dashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              className="transition-all"
            />
          ))}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{total}</span>
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
      </div>
      
      {/* Legend */}
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.status} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-medium ml-auto">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// RECENT CALLS LIST COMPONENT
// ============================================================================

interface RecentCallsProps {
  calls: {
    id: string
    status: string
    direction: string
    duration_seconds: number | null
    total_cost: number | null
    created_at: string
    caller_phone_number: string | null
    call_type: string
    agent: { id: string; name: string }
  }[]
  isLoading?: boolean
  baseUrl: string
}

const statusConfig: Record<string, { icon: React.ElementType; className: string }> = {
  completed: { icon: CheckCircle, className: "text-green-500" },
  failed: { icon: XCircle, className: "text-red-500" },
  in_progress: { icon: Phone, className: "text-blue-500 animate-pulse" },
  initiated: { icon: Phone, className: "text-yellow-500" },
  no_answer: { icon: Phone, className: "text-gray-500" },
  busy: { icon: Phone, className: "text-orange-500" },
  canceled: { icon: XCircle, className: "text-slate-500" },
}

function RecentCallsList({ calls, isLoading, baseUrl }: RecentCallsProps) {
  if (isLoading) {
    return (
      <div className="py-8 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!calls || calls.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No recent calls</p>
        <p className="text-xs">Calls will appear here as they happen</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {calls.map((call) => {
        const StatusIcon = statusConfig[call.status]?.icon || Phone
        const statusClass = statusConfig[call.status]?.className || "text-gray-500"
        
        return (
          <div
            key={call.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            {/* Direction & Status Icon */}
            <div className="flex items-center gap-2">
              {call.direction === "inbound" ? (
                <ArrowDownLeft className="h-4 w-4 text-green-500" />
              ) : call.direction === "outbound" ? (
                <ArrowUpRight className="h-4 w-4 text-blue-500" />
              ) : (
                <Monitor className="h-4 w-4 text-purple-500" />
              )}
              <StatusIcon className={cn("h-4 w-4", statusClass)} />
            </div>

            {/* Call Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">
                  {call.caller_phone_number || "Web Call"}
                </span>
                <Badge variant="outline" className="text-xs">
                  {call.agent.name}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>{formatRelativeTime(call.created_at)}</span>
                {call.duration_seconds && (
                  <>
                    <span>•</span>
                    <span>{formatDuration(call.duration_seconds)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Cost */}
            {call.total_cost !== null && call.total_cost > 0 && (
              <span className="text-sm font-medium text-muted-foreground">
                ${call.total_cost.toFixed(2)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// MAIN DASHBOARD PAGE
// ============================================================================

// Filter label mapping
const filterLabels: Record<DashboardDateFilter, string> = {
  today: "Today",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  manual: "Custom Range",
  all: "All Time",
}

export default function WorkspaceDashboardPage() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const baseUrl = `/w/${workspaceSlug}`

  // Date filter state - default to "today"
  const [dateFilter, setDateFilter] = useState<DashboardDateFilter>("today")
  const [manualStartDate, setManualStartDate] = useState<Date | undefined>(undefined)
  const [manualEndDate, setManualEndDate] = useState<Date | undefined>(undefined)

  // Compute filter options for both hooks (shared filter)
  const filterOptions = useMemo(() => ({
    filter: dateFilter,
    startDate: dateFilter === "manual" ? manualStartDate : undefined,
    endDate: dateFilter === "manual" ? manualEndDate : undefined,
  }), [dateFilter, manualStartDate, manualEndDate])

  const { 
    workspace: workspaceStats, 
    partner: partnerStats, 
    roles,
    isLoading,
    isLoadingWorkspace,
    isLoadingPartner,
    error 
  } = useDashboardData(filterOptions)

  // Charts now use the same filter as workspace overview
  const { 
    data: chartsData, 
    isLoading: isLoadingCharts 
  } = useDashboardCharts(filterOptions)

  const { workspaceRole, partnerRole, canViewPartnerStats, isWorkspaceAdmin, isPartnerAdmin } = roles

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">Dashboard</h1>
            <RoleBadge role={workspaceRole} />
          </div>
          <p className="text-muted-foreground mt-1">
            {canViewPartnerStats 
              ? "Overview of your workspace and organization performance"
              : "Overview of your workspace performance"
            }
          </p>
        </div>
        <Button asChild>
          <Link href={`${baseUrl}/agents/new`}>
            <Plus className="mr-2 h-4 w-4" />
            Create Agent
          </Link>
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-destructive">
              Failed to load dashboard stats. Please try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Workspace Stats - Always visible for workspace members */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Workspace Overview</h2>
            <Badge variant="secondary" className="text-xs">This Workspace</Badge>
          </div>
          
          {/* Date Filter Controls */}
          <div className="flex items-center gap-2">
            <Select
              value={dateFilter}
              onValueChange={(value) => {
                setDateFilter(value as DashboardDateFilter)
                // Clear manual dates if not in manual mode
                if (value !== "manual") {
                  setManualStartDate(undefined)
                  setManualEndDate(undefined)
                }
              }}
            >
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="manual">Custom Range</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Manual Date Pickers */}
            {dateFilter === "manual" && (
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-9 w-[130px] justify-start text-left font-normal",
                        !manualStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {manualStartDate ? format(manualStartDate, "MMM d, yyyy") : "Start"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={manualStartDate}
                      onSelect={(date) => setManualStartDate(date ? startOfDay(date) : undefined)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground">to</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-9 w-[130px] justify-start text-left font-normal",
                        !manualEndDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {manualEndDate ? format(manualEndDate, "MMM d, yyyy") : "End"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={manualEndDate}
                      onSelect={(date) => setManualEndDate(date ? endOfDay(date) : undefined)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Agents in this workspace */}
          <StatCard
            label="Agents"
            value={workspaceStats?.total_agents ?? 0}
            icon={Bot}
            iconClassName="bg-primary/10 text-primary"
            trend="In this workspace"
            isLoading={isLoadingWorkspace}
          />

          {/* Conversations */}
          <StatCard
            label="Conversations"
            value={workspaceStats?.conversations_this_month ?? 0}
            icon={MessageSquare}
            iconClassName="bg-blue-500/10 text-blue-600"
            trend={filterLabels[dateFilter]}
            isLoading={isLoadingWorkspace}
          />

          {/* Minutes */}
          <StatCard
            label="Minutes"
            value={Math.round(workspaceStats?.minutes_this_month ?? 0)}
            icon={Clock}
            iconClassName="bg-amber-500/10 text-amber-600"
            trend={filterLabels[dateFilter]}
            isLoading={isLoadingWorkspace}
          />

          {/* Cost */}
          <StatCard
            label="Cost"
            value={`$${(workspaceStats?.cost_this_month ?? 0).toFixed(2)}`}
            icon={DollarSign}
            iconClassName="bg-green-500/10 text-green-600"
            trend={filterLabels[dateFilter]}
            isLoading={isLoadingWorkspace}
          />
        </div>
      </div>

      {/* Organization Stats - Only visible for partner admins/owners */}
      {canViewPartnerStats && (
        <>
          <Separator className="my-6" />
          
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Organization Overview</h2>
              <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/20">
                Admin View
              </Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Total Workspaces */}
              <StatCard
                label="Total Workspaces"
                value={partnerStats?.total_workspaces ?? 0}
                icon={LayoutGrid}
                iconClassName="bg-violet-500/10 text-violet-600"
                trend="Across organization"
                isLoading={isLoadingPartner}
              />

              {/* Total Agents (All Workspaces) */}
              <StatCard
                label="Total Agents"
                value={partnerStats?.total_agents_all_workspaces ?? 0}
                icon={Bot}
                iconClassName="bg-emerald-500/10 text-emerald-600"
                trend="Across all workspaces"
                isLoading={isLoadingPartner}
              />

              {/* Total Calls Today */}
              <StatCard
                label="Total Calls Today"
                value={partnerStats?.total_calls_today ?? 0}
                icon={Phone}
                iconClassName="bg-orange-500/10 text-orange-600"
                trend="Across all workspaces"
                isLoading={isLoadingPartner}
              />
            </div>
          </div>
        </>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calls Over Time Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Calls Over Time</CardTitle>
              <Badge variant="secondary">
                {filterLabels[dateFilter]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <SimpleBarChart 
              data={chartsData?.calls_over_time || []} 
              isLoading={isLoadingCharts} 
            />
          </CardContent>
        </Card>

        {/* Call Outcomes Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Call Outcomes</CardTitle>
              <Badge variant="secondary">
                {filterLabels[dateFilter]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <SimpleDonutChart 
              data={chartsData?.call_outcomes || []} 
              isLoading={isLoadingCharts} 
            />
          </CardContent>
        </Card>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Calls */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Calls</CardTitle>
              <Link
                href={`${baseUrl}/calls`}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <RecentCallsList 
              calls={chartsData?.recent_calls || []} 
              isLoading={isLoadingCharts}
              baseUrl={baseUrl}
            />
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <CardDescription>Get started with common tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full justify-start">
              <Link href={`${baseUrl}/agents/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Create New Agent
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`${baseUrl}/agents`}>
                <Bot className="mr-2 h-4 w-4" />
                View All Agents
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`${baseUrl}/calls`}>
                <Phone className="mr-2 h-4 w-4" />
                View Call Logs
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`${baseUrl}/analytics`}>
                <Activity className="mr-2 h-4 w-4" />
                View Analytics
              </Link>
            </Button>
            {isWorkspaceAdmin && (
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href={`${baseUrl}/members`}>
                  <Users className="mr-2 h-4 w-4" />
                  Manage Team
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Empty State for Agents */}
      {!isLoading && workspaceStats?.total_agents === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 bg-primary/10 rounded-full mb-4">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No agents yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mt-2">
              Create your first AI voice agent to start handling calls and automating conversations.
            </p>
            <Button asChild className="mt-6">
              <Link href={`${baseUrl}/agents/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Agent
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
