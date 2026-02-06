"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Calculator,
  Clock,
  Gift,
  Zap,
  CheckCircle2,
  Plus,
  ArrowRight,
  Phone,
  Bot,
  Users,
  Mic,
  BarChart3,
  Globe,
  X,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

// ============================================================================
// PLAN CONFIGURATION (matches config/plans.ts)
// Note: Per-minute rate is set by organization (default $0.15/min for platform)
// ============================================================================
const PLATFORM_RATE_PER_MINUTE = 0.15 // Platform partner default rate

const PLANS = {
  free: {
    name: "Free",
    slug: "free",
    freeCredits: 10,                    // $10 free credits
    perMinuteRate: PLATFORM_RATE_PER_MINUTE,
    maxAgents: 1,
    maxPhoneNumbers: 0,
    hasWebCalls: true,
    hasPhoneCalls: false,
    hasCampaigns: false,
    hasAnalytics: false,
    teamMembers: 1,
  },
  pro: {
    name: "Pro",
    slug: "pro",
    monthlyPrice: 99,
    includedMinutes: 3000,
    overageRate: 0.08,                  // $0.08/min (47% savings)
    maxAgents: 10,
    maxPhoneNumbers: 3,
    hasWebCalls: true,
    hasPhoneCalls: true,
    hasCampaigns: true,
    hasAnalytics: true,
    teamMembers: 5,
  },
}

interface CallCostCalculatorProps {
  className?: string
}

export function CallCostCalculator({ className }: CallCostCalculatorProps) {
  const [minutes, setMinutes] = useState(500)
  const [inputValue, setInputValue] = useState("500")

  // Calculate minutes covered by free credits
  const freeMinutes = Math.floor(PLANS.free.freeCredits / PLANS.free.perMinuteRate)

  // Calculate costs for each plan
  const costs = useMemo(() => {
    // FREE PLAN: $10 credits = ~66 minutes, then add more credits at $0.15/min
    const freeUsedMinutes = Math.min(minutes, freeMinutes)
    const freeExtraMinutes = Math.max(0, minutes - freeMinutes)
    const freeExtraCost = freeExtraMinutes * PLANS.free.perMinuteRate
    const freeTotalCost = freeExtraCost

    // PRO PLAN: $99/mo with 3,000 min included, then $0.08/min overage
    const proUsedIncluded = Math.min(minutes, PLANS.pro.includedMinutes)
    const proOverageMinutes = Math.max(0, minutes - PLANS.pro.includedMinutes)
    const proOverageCost = proOverageMinutes * PLANS.pro.overageRate
    const proTotalCost = PLANS.pro.monthlyPrice + proOverageCost

    // Calculate effective cost per minute
    const freeCostPerMin = minutes > 0 ? freeTotalCost / minutes : 0
    const proCostPerMin = minutes > 0 ? proTotalCost / minutes : 0

    // Savings vs pay-as-you-go (what you'd pay at full rate)
    const fullRateCost = minutes * PLANS.free.perMinuteRate
    const proSavings = fullRateCost - proTotalCost

    return {
      free: {
        usedFreeMinutes: freeUsedMinutes,
        extraMinutes: freeExtraMinutes,
        extraCost: freeExtraCost,
        totalCost: freeTotalCost,
        costPerMin: freeCostPerMin,
        isCoveredByCredits: minutes <= freeMinutes,
      },
      pro: {
        usedIncluded: proUsedIncluded,
        overageMinutes: proOverageMinutes,
        overageCost: proOverageCost,
        totalCost: proTotalCost,
        costPerMin: proCostPerMin,
        isCoveredByPlan: minutes <= PLANS.pro.includedMinutes,
        savings: proSavings,
      },
    }
  }, [minutes, freeMinutes])

  // Determine which plan is better value
  const bestPlan = costs.free.totalCost <= costs.pro.totalCost ? "free" : "pro"

  // Handle slider change
  const handleSliderChange = (value: number[]) => {
    const newMinutes = value[0] ?? 0
    setMinutes(newMinutes)
    setInputValue(newMinutes.toString())
  }

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, "")
    setInputValue(value)
    const numValue = parseInt(value, 10)
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 20000) {
      setMinutes(numValue)
    }
  }

  // Preset buttons
  const presets = [100, 500, 1000, 3000, 5000, 10000]

  // Feature comparison helper
  const FeatureCheck = ({ included }: { included: boolean }) => (
    included ? (
      <CheckCircle2 className="h-4 w-4 text-green-500" />
    ) : (
      <X className="h-4 w-4 text-muted-foreground/50" />
    )
  )

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="bg-linear-to-r from-primary/5 via-primary/10 to-transparent border-b">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Calculator className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl">Cost Calculator</CardTitle>
            <CardDescription>
              Compare plans based on your expected monthly call volume
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Minutes Input */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Expected Monthly Minutes</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                className="w-24 text-right font-mono text-lg h-10"
              />
              <span className="text-muted-foreground text-sm">min</span>
            </div>
          </div>

          <Slider
            value={[minutes]}
            onValueChange={handleSliderChange}
            min={0}
            max={15000}
            step={50}
            className="py-2"
          />

          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset}
                variant={minutes === preset ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setMinutes(preset)
                  setInputValue(preset.toString())
                }}
              >
                {preset.toLocaleString()}
              </Button>
            ))}
          </div>
        </div>

        {/* Plan Comparison */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* FREE PLAN */}
          <div
            className={cn(
              "rounded-xl border-2 p-5 transition-all",
              bestPlan === "free"
                ? "border-green-500 bg-green-500/5 ring-2 ring-green-500/20"
                : "border-border"
            )}
          >
            {bestPlan === "free" && (
              <Badge className="mb-3 bg-green-500 hover:bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Best for your usage
              </Badge>
            )}
            
            <div className="flex items-center gap-2 mb-1">
              <Gift className="h-5 w-5 text-green-500" />
              <h3 className="font-bold text-lg">{PLANS.free.name}</h3>
            </div>

            <p className="text-2xl font-bold mb-3">
              $0<span className="text-sm font-normal text-muted-foreground">/month</span>
            </p>

            <p className="text-sm text-muted-foreground mb-4">
              Start with ${PLANS.free.freeCredits} credits (~{freeMinutes} min)
            </p>

            {/* What you get */}
            <div className="space-y-2 text-sm mb-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  AI Agents
                </span>
                <span className="font-medium">{PLANS.free.maxAgents}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Web Calls
                </span>
                <FeatureCheck included={PLANS.free.hasWebCalls} />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Phone Calls
                </span>
                <FeatureCheck included={PLANS.free.hasPhoneCalls} />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  Campaigns
                </span>
                <FeatureCheck included={PLANS.free.hasCampaigns} />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Analytics
                </span>
                <FeatureCheck included={PLANS.free.hasAnalytics} />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Team
                </span>
                <span className="font-medium">{PLANS.free.teamMembers}</span>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground mb-2">
                Cost for {minutes.toLocaleString()} minutes:
              </div>
              {costs.free.isCoveredByCredits ? (
                <>
                  <div className="text-2xl font-bold text-green-600">$0</div>
                  <div className="text-xs text-green-600">
                    ✓ Covered by free credits
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    ${costs.free.totalCost.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Plus className="h-3 w-3" />
                    ${costs.free.extraCost.toFixed(2)} additional credits needed
                  </div>
                </>
              )}
              <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                Rate: ${PLANS.free.perMinuteRate.toFixed(2)}/min
              </div>
            </div>
          </div>

          {/* PRO PLAN */}
          <div
            className={cn(
              "rounded-xl border-2 p-5 transition-all",
              bestPlan === "pro"
                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                : "border-border"
            )}
          >
            {bestPlan === "pro" && (
              <Badge className="mb-3">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Best for your usage
              </Badge>
            )}

            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-lg">{PLANS.pro.name}</h3>
              <Badge variant="secondary" className="text-xs">Popular</Badge>
            </div>

            <p className="text-2xl font-bold mb-3">
              ${PLANS.pro.monthlyPrice}<span className="text-sm font-normal text-muted-foreground">/month</span>
            </p>

            <p className="text-sm text-muted-foreground mb-4">
              {PLANS.pro.includedMinutes.toLocaleString()} minutes included
            </p>

            {/* What you get */}
            <div className="space-y-2 text-sm mb-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  AI Agents
                </span>
                <span className="font-medium">{PLANS.pro.maxAgents}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Web Calls
                </span>
                <FeatureCheck included={PLANS.pro.hasWebCalls} />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Phone Calls
                </span>
                <FeatureCheck included={PLANS.pro.hasPhoneCalls} />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  Campaigns
                </span>
                <FeatureCheck included={PLANS.pro.hasCampaigns} />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Analytics
                </span>
                <FeatureCheck included={PLANS.pro.hasAnalytics} />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Team
                </span>
                <span className="font-medium">{PLANS.pro.teamMembers}</span>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground mb-2">
                Cost for {minutes.toLocaleString()} minutes:
              </div>
              <div className={cn(
                "text-2xl font-bold",
                bestPlan === "pro" && "text-primary"
              )}>
                ${costs.pro.totalCost.toFixed(2)}
              </div>
              {costs.pro.isCoveredByPlan ? (
                <div className="text-xs text-green-600">
                  ✓ All minutes included in plan
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Includes ${costs.pro.overageCost.toFixed(2)} overage ({costs.pro.overageMinutes.toLocaleString()} min)
                </div>
              )}
              {costs.pro.savings > 0 && (
                <div className="text-xs text-green-600 mt-1">
                  Save ${costs.pro.savings.toFixed(2)} vs pay-as-you-go
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                Overage: ${PLANS.pro.overageRate.toFixed(2)}/min
              </div>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        {minutes > 0 && (
          <div className={cn(
            "rounded-xl p-4 border",
            bestPlan === "free" 
              ? "bg-green-500/5 border-green-500/20" 
              : "bg-primary/5 border-primary/20"
          )}>
            <div className="flex items-start gap-3">
              {bestPlan === "free" ? (
                <Gift className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              ) : (
                <Zap className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h4 className="font-semibold">
                  {bestPlan === "free" ? (
                    costs.free.isCoveredByCredits 
                      ? "Start free with $10 credits! 🎉" 
                      : "Free plan is more economical"
                  ) : (
                    "Pro plan gives you the best value"
                  )}
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {bestPlan === "free" ? (
                    costs.free.isCoveredByCredits
                      ? `Your ${minutes.toLocaleString()} minutes are fully covered by the $${PLANS.free.freeCredits} free credits. Perfect for testing!`
                      : `At ${minutes.toLocaleString()} min/month, Free costs $${costs.free.totalCost.toFixed(2)} vs Pro at $${costs.pro.totalCost.toFixed(2)}. Add credits as you go.`
                  ) : (
                    `At ${minutes.toLocaleString()} min/month, Pro saves you $${(costs.free.totalCost - costs.pro.totalCost).toFixed(2)} compared to Free. Plus you get ${PLANS.pro.maxAgents} agents, phone calls, and campaigns.`
                  )}
                </p>
                <Button 
                  asChild 
                  size="sm" 
                  className="mt-3"
                  variant={bestPlan === "free" ? "outline" : "default"}
                >
                  <Link href={`/signup?plan=${bestPlan}`}>
                    Get Started with {bestPlan === "free" ? "Free" : "Pro"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Note */}
        <p className="text-xs text-center text-muted-foreground">
          Per-minute rate is set by your organization. Platform default: ${PLATFORM_RATE_PER_MINUTE.toFixed(2)}/min.
          All plans include call recording, transcription, and knowledge base.
        </p>
      </CardContent>
    </Card>
  )
}
