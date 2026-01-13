"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface CampaignLoadingProps {
  message?: string
  submessage?: string
}

/**
 * Full-page loading component for campaign wizard
 * Shows a visually appealing loading state with animated elements
 */
export function CampaignLoading({ 
  message = "Setting up your campaign...",
  submessage = "This will only take a moment"
}: CampaignLoadingProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* Progress Steps Skeleton */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Step Indicators */}
            <div className="flex items-center justify-between">
              {[1, 2, 3, 4].map((step, index) => (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-2">
                    <div 
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        step === 1 
                          ? "bg-primary/20 animate-pulse" 
                          : "bg-muted"
                      )}
                    >
                      {step === 1 ? (
                        <div className="w-4 h-4 rounded-full bg-primary animate-ping" />
                      ) : (
                        <Skeleton className="h-5 w-5 rounded" />
                      )}
                    </div>
                    <Skeleton className="h-4 w-20 hidden md:block" />
                    <Skeleton className="h-3 w-24 hidden md:block" />
                  </div>
                  {index < 3 && (
                    <div className="flex-1 h-0.5 mx-2 bg-muted overflow-hidden">
                      {step === 1 && (
                        <div className="h-full bg-primary/30 animate-[shimmer_2s_infinite]" 
                             style={{ 
                               background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.3), transparent)',
                               backgroundSize: '200% 100%',
                               animation: 'shimmer 1.5s infinite'
                             }} 
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary/50 rounded-full animate-pulse"
                style={{ width: '25%' }}
              />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Loading Card */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="relative flex flex-col items-center justify-center py-20 px-6">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
            
            {/* Animated Rings */}
            <div className="relative mb-8">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" 
                   style={{ animationDuration: '2s' }} />
              <div className="absolute inset-2 rounded-full border-4 border-primary/30 animate-ping" 
                   style={{ animationDuration: '2s', animationDelay: '0.3s' }} />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/25">
                <svg 
                  className="w-10 h-10 text-primary-foreground animate-spin"
                  style={{ animationDuration: '1.5s' }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                </svg>
              </div>
            </div>

            {/* Loading Text */}
            <div className="text-center relative z-10 space-y-2">
              <h3 className="text-xl font-semibold text-foreground">
                {message}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {submessage}
              </p>
            </div>

            {/* Animated Dots */}
            <div className="flex gap-1.5 mt-6">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary"
                  style={{
                    animation: 'bounce 1s infinite',
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation Skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-24" />
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}

