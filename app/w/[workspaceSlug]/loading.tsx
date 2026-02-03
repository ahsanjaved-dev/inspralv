"use client"

import { Skeleton } from "@/components/ui/skeleton"

/**
 * Loading skeleton for workspace pages
 * Shows a full dashboard skeleton while workspace data is being fetched
 */
export default function WorkspaceLoading() {
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar Skeleton */}
      <div className="hidden lg:flex w-64 flex-col border-r border-border/50 bg-card">
        {/* Workspace Selector */}
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-5 w-5 rounded" />
          </div>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 p-4 space-y-6">
          {/* Section Label */}
          <Skeleton className="h-3 w-20" />
          
          {/* Nav Items */}
          <div className="space-y-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>

          {/* Second Section */}
          <Skeleton className="h-3 w-24" />
          
          <div className="space-y-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={`sec-${i}`} className="flex items-center gap-3 px-3 py-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>

        {/* User Section */}
        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-14 border-b border-border/50 flex items-center justify-between px-6 bg-card/50">
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-5 rounded lg:hidden" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </header>

        {/* Page Content Skeleton */}
        <main className="flex-1 overflow-auto p-6">
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
              <Skeleton className="h-10 w-32 rounded" />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-card p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-8 w-16" />
                    </div>
                    <Skeleton className="h-12 w-12 rounded-full" />
                  </div>
                  <Skeleton className="mt-3 h-3 w-20" />
                </div>
              ))}
            </div>

            {/* Charts/Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart 1 */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-8 w-32 rounded" />
                </div>
                <Skeleton className="w-full h-64 rounded" />
              </div>

              {/* Chart 2 */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-8 w-32 rounded" />
                </div>
                <Skeleton className="w-full h-64 rounded" />
              </div>
            </div>

            {/* Table/List Section */}
            <div className="rounded-lg border bg-card">
              {/* Table Header */}
              <div className="flex items-center gap-4 border-b bg-muted/50 px-4 py-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className={`h-3 ${i === 0 ? "w-32" : "w-20"} ${i === 3 ? "ml-auto w-16" : ""}`}
                  />
                ))}
              </div>
              {/* Table Rows */}
              <div className="divide-y px-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-4">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20 ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

