"use client"

// Import SDK error suppression EARLY to catch errors before Next.js overlay
import "@/lib/hooks/use-web-call/suppress-sdk-errors"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { useState } from "react"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000, // 2 minutes (reduced from 5 min for better freshness)
            gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
            refetchOnWindowFocus: true, // Refresh stale data when tab regains focus
            refetchOnMount: true, // Refresh stale data when component mounts
            refetchOnReconnect: true, // Refresh when network reconnects
            retry: 1, // Only retry once on failure
            // Add network mode for offline support indication
            networkMode: "online",
          },
          mutations: {
            // Retry mutations once on failure
            retry: 1,
            // Network mode for mutations
            networkMode: "online",
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* React Query DevTools - only in development */}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} position="bottom" />
      )}
    </QueryClientProvider>
  )
}
