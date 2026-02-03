import { cn } from "@/lib/utils"

/**
 * Skeleton Components
 * Phase 4.2.1: Create comprehensive skeleton library
 *
 * Provides loading state UI components for better perceived performance.
 */

// ============================================================================
// BASE SKELETON
// ============================================================================

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />
}

// ============================================================================
// SPECIALIZED SKELETONS
// ============================================================================

/**
 * Skeleton for text content
 */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  )
}

/**
 * Skeleton for avatar/image
 */
export function SkeletonAvatar({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-16 w-16",
  }

  return <Skeleton className={cn("rounded-full", sizeClasses[size], className)} />
}

/**
 * Skeleton for stat card
 */
export function SkeletonStatCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-5 shadow-sm", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  )
}

/**
 * Skeleton for agent card
 */
export function SkeletonAgentCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 shadow-sm", className)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 w-20 rounded" />
        <Skeleton className="h-8 w-20 rounded" />
      </div>
    </div>
  )
}

/**
 * Skeleton for table row
 */
export function SkeletonTableRow({
  columns = 4,
  className,
}: {
  columns?: number
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-4 border-b py-4", className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === 0 ? "w-40" : "w-24", i === columns - 1 ? "ml-auto w-20" : "")}
        />
      ))}
    </div>
  )
}

/**
 * Skeleton for table
 */
export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      {/* Header */}
      <div className="flex items-center gap-4 border-b bg-muted/50 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn(
              "h-3",
              i === 0 ? "w-32" : "w-20",
              i === columns - 1 ? "ml-auto w-16" : ""
            )}
          />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y px-4">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} columns={columns} />
        ))}
      </div>
    </div>
  )
}

/**
 * Skeleton for member list item
 */
export function SkeletonMemberItem({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 py-4", className)}>
      <SkeletonAvatar size="md" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  )
}

/**
 * Skeleton for conversation item
 */
export function SkeletonConversationItem({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 rounded-lg border p-4", className)}>
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  )
}

/**
 * Skeleton for dashboard stats grid
 */
export function SkeletonDashboardStats({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-4", className)}>
      <SkeletonStatCard />
      <SkeletonStatCard />
      <SkeletonStatCard />
    </div>
  )
}

/**
 * Skeleton for chart
 */
export function SkeletonChart({
  className,
  height = 256,
}: {
  className?: string
  height?: number
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-32 rounded" />
      </div>
      <Skeleton className="w-full rounded" style={{ height }} />
    </div>
  )
}

/**
 * Skeleton for page header
 */
export function SkeletonPageHeader({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6",
        className
      )}
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-32 rounded" />
    </div>
  )
}

/**
 * Skeleton for full dashboard page
 */
export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonDashboardStats />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonChart />
        <SkeletonChart />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SkeletonTable rows={5} columns={4} />
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// BILLING PAGE SKELETON
// ============================================================================

/**
 * Skeleton for subscription plan card
 */
export function SkeletonPlanCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 shadow-sm", className)}>
      <div className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="mt-2 h-4 w-full" />
      </div>
      <div className="space-y-4 pt-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded" />
      </div>
    </div>
  )
}

/**
 * Skeleton for current subscription card
 */
export function SkeletonCurrentSubscription({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border border-primary/20 bg-primary/5 p-6", className)}>
      <div className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-40" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="space-y-4 pt-3">
        <div className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-2 w-full rounded" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-32 rounded" />
        </div>
      </div>
    </div>
  )
}

/**
 * Skeleton for credits card
 */
export function SkeletonCreditsCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      <div className="p-6 pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
      <div className="p-6 pt-0 space-y-6">
        {/* Balance Display */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-28" />
            <div className="flex items-center gap-4 mt-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
        {/* Top-up Options */}
        <div>
          <Skeleton className="h-4 w-24 mb-3" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded" />
            ))}
          </div>
        </div>
        {/* Recent Transactions */}
        <div>
          <Skeleton className="h-4 w-28 mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Skeleton for billing page
 */
export function SkeletonBillingPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div className="space-y-1">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      {/* Current Subscription Skeleton */}
      <SkeletonCurrentSubscription />

      {/* Available Plans */}
      <div className="rounded-lg border bg-card">
        <div className="p-6 pb-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <div className="p-6 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <SkeletonPlanCard />
            <SkeletonPlanCard />
            <SkeletonPlanCard />
          </div>
        </div>
      </div>

      {/* Credits Card */}
      <SkeletonCreditsCard />

      {/* Usage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* Info Card */}
      <div className="rounded-lg border bg-card">
        <div className="p-6 pb-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-2 h-4 w-48" />
        </div>
        <div className="p-6 pt-0 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}