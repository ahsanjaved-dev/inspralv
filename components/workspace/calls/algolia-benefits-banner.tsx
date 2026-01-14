"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Zap, Sparkles, Layers, TrendingUp, X, Settings } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import type { AlgoliaSearchConfig } from "@/lib/algolia/types"
import { cn } from "@/lib/utils"

interface AlgoliaBenefitsBannerProps {
  benefits: AlgoliaSearchConfig["benefits"]
  className?: string
  dismissible?: boolean
  variant?: "banner" | "card" | "inline"
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  zap: Zap,
  sparkles: Sparkles,
  layers: Layers,
  "trending-up": TrendingUp,
}

export function AlgoliaBenefitsBanner({
  benefits,
  className,
  dismissible = true,
  variant = "banner",
}: AlgoliaBenefitsBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false)
  const router = useRouter()

  if (!benefits || isDismissed) {
    return null
  }

  const handleConfigureClick = () => {
    // Navigate to org integrations page
    router.push("/org/integrations")
  }

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-500/5 to-purple-500/5 border border-blue-200/50 dark:border-blue-800/50",
          className
        )}
      >
        <Zap className="h-4 w-4 text-blue-500 flex-shrink-0" />
        <span className="text-sm text-muted-foreground">
          Enable Algolia for instant search with autocomplete
        </span>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-blue-600 hover:text-blue-700"
          onClick={handleConfigureClick}
        >
          Configure
        </Button>
      </div>
    )
  }

  if (variant === "card") {
    return (
      <Card className={cn("relative overflow-hidden", className)}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5" />
        <CardContent className="relative p-6">
          {dismissible && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8"
              onClick={() => setIsDismissed(true)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
              <Zap className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">{benefits.title}</h3>
              <div className="grid grid-cols-2 gap-3 mt-4">
                {benefits.features.map((feature, index) => {
                  const Icon = iconMap[feature.icon] || Zap
                  return (
                    <div key={index} className="flex items-start gap-2">
                      <Icon className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{feature.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <Button
                className="mt-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                onClick={handleConfigureClick}
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure Algolia
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Default: banner variant
  return (
    <div
      className={cn(
        "relative rounded-lg border bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 p-4",
        className
      )}
    >
      {dismissible && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-6 w-6"
          onClick={() => setIsDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-medium">{benefits.title}</h4>
            <p className="text-sm text-muted-foreground">{benefits.cta}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 md:ml-auto">
          {benefits.features.slice(0, 3).map((feature, index) => {
            const Icon = iconMap[feature.icon] || Zap
            return (
              <div
                key={index}
                className="flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                <Icon className="h-4 w-4 text-blue-500" />
                <span>{feature.title}</span>
              </div>
            )
          })}
        </div>

        <Button
          size="sm"
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 md:ml-4"
          onClick={handleConfigureClick}
        >
          Configure
        </Button>
      </div>
    </div>
  )
}

