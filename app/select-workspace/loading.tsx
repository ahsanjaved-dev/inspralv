"use client"

import { CheckCircle2 } from "lucide-react"

/**
 * Loading state for the select-workspace page
 * 
 * Shows a clean "Signing you in..." animation that works for both:
 * - Single workspace users (who will be auto-redirected to their workspace)
 * - Multiple workspace users (who will see the workspace selector)
 * 
 * This avoids showing a complex skeleton that would be jarring for single-workspace
 * users who never actually see the workspace selector.
 */
export default function SelectWorkspaceLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      {/* Subtle grid pattern background */}
      <div 
        className="fixed inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      
      {/* Gradient orbs */}
      <div className="fixed top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10 bg-primary" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-10 bg-primary" />

      {/* Centered Loading State */}
      <div className="relative z-10 text-center space-y-4 animate-in fade-in-0 zoom-in-95 duration-300">
        {/* Animated spinner with checkmark */}
        <div className="relative mx-auto w-16 h-16">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
          {/* Spinning ring */}
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
          {/* Inner checkmark */}
          <div className="absolute inset-2 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-primary animate-in zoom-in-50 duration-500 delay-200" />
          </div>
        </div>
        
        {/* Text */}
        <div className="space-y-1">
          <p className="text-lg font-medium text-foreground">Signing you in...</p>
          <p className="text-sm text-muted-foreground">Please wait</p>
        </div>
      </div>
    </div>
  )
}

