import Link from "next/link"
import { getPartnerFromHost } from "@/lib/api/partner"
import { workspacePlans, formatLimit } from "@/config/plans"
import { Check, Sparkles, Building2, ArrowRight, Zap, Clock, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { prisma } from "@/lib/prisma"

interface AgencyPlan {
  id: string
  slug: string
  name: string
  description: string | null
  monthlyPriceCents: number
  includedMinutes: number
  overageRateCents: number
  features: string[]
  maxAgents: number | null
  maxConversationsPerMonth: number | null
  sortOrder: number
}

/**
 * Fetch agency's public plans directly from database (server-side)
 */
async function getAgencyPlans(partnerId: string): Promise<AgencyPlan[]> {
  if (!prisma) return []

  const plans = await prisma.workspaceSubscriptionPlan.findMany({
    where: {
      partnerId,
      isActive: true,
      isPublic: true,
    },
    orderBy: [
      { sortOrder: "asc" },
      { monthlyPriceCents: "asc" },
    ],
  })

  return plans.map((plan) => ({
    id: plan.id,
    slug: plan.slug || plan.name.toLowerCase().replace(/\s+/g, "-"),
    name: plan.name,
    description: plan.description,
    monthlyPriceCents: plan.monthlyPriceCents,
    includedMinutes: plan.includedMinutes,
    overageRateCents: plan.overageRateCents,
    features: (plan.features as string[]) || [],
    maxAgents: plan.maxAgents,
    maxConversationsPerMonth: plan.maxConversationsPerMonth,
    sortOrder: plan.sortOrder,
  }))
}

export default async function PricingPage() {
  const partner = await getPartnerFromHost()
  
  // Platform partner: show hardcoded plans
  if (partner.is_platform_partner) {
    return <PlatformPricingPage />
  }

  // White-label partner: show their custom plans
  const agencyPlans = await getAgencyPlans(partner.id)

  // If agency has no plans, show a message
  if (agencyPlans.length === 0) {
    return (
      <div className="py-20 lg:py-28 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold mb-6">Pricing Coming Soon</h1>
          <p className="text-lg text-muted-foreground mb-8">
            {partner.branding?.company_name || partner.name} is setting up their pricing plans.
            Please check back later or contact us for more information.
          </p>
          <Button asChild>
            <Link href="/login">
              Sign In
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const companyName = partner.branding?.company_name || partner.name
  const primaryColor = partner.branding?.primary_color

  return (
    <div className="py-20 lg:py-28 px-6">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-6 gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Choose Your Plan
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Start building with
            <br />
            <span className="text-muted-foreground">{companyName}</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that best fits your needs. Upgrade or downgrade anytime.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className={`grid grid-cols-1 gap-6 mb-20 ${
          agencyPlans.length === 1 ? 'md:grid-cols-1 max-w-md mx-auto' :
          agencyPlans.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' :
          agencyPlans.length >= 3 ? 'md:grid-cols-3' : ''
        }`}>
          {agencyPlans.map((plan, index) => {
            const isPopular = agencyPlans.length >= 2 && index === 1
            const isFree = plan.monthlyPriceCents === 0

            return (
              <Card 
                key={plan.id} 
                className={`relative hover:shadow-lg transition-all ${
                  isPopular ? 'border-primary shadow-lg shadow-primary/10' : ''
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="shadow-sm">Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description || `Get started with ${plan.name}`}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    {isFree ? (
                      <>
                        <span className="text-4xl font-bold">Free</span>
                        <span className="text-muted-foreground ml-2">to start</span>
                      </>
                    ) : (
                      <>
                        <span className="text-4xl font-bold">${plan.monthlyPriceCents / 100}</span>
                        <span className="text-muted-foreground ml-2">/month</span>
                      </>
                    )}
                  </div>

                  <Button 
                    asChild 
                    className="w-full" 
                    variant={isPopular ? "default" : "outline"}
                  >
                    <Link href={`/signup?plan=${plan.id}`}>
                      {isFree ? "Start Free" : `Get ${plan.name}`}
                      {isPopular ? <Zap className="ml-2 h-4 w-4" /> : <ArrowRight className="ml-2 h-4 w-4" />}
                    </Link>
                  </Button>

                  {/* Key limits */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {plan.includedMinutes > 0 
                          ? `${plan.includedMinutes.toLocaleString()} minutes/month`
                          : "Pay-as-you-go"
                        }
                      </span>
                    </div>
                    {plan.maxAgents && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {plan.maxAgents === -1 ? "Unlimited" : plan.maxAgents} AI agents
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Features list */}
                  {plan.features.length > 0 && (
                    <ul className="space-y-3">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <Check className={`h-5 w-5 shrink-0 mt-0.5 ${isPopular ? 'text-primary' : 'text-green-500'}`} />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* FAQ Section */}
        <div className="mb-20">
          <h2 className="text-2xl font-bold text-center mb-4">Frequently Asked Questions</h2>
          <p className="text-center text-muted-foreground mb-8">Got questions? We've got answers.</p>
          
          <div className="max-w-3xl mx-auto space-y-4">
            {[
              {
                question: "How does billing work?",
                answer: "Plans are billed monthly. For paid plans, you'll be charged at the beginning of each billing cycle. You can upgrade or downgrade at any time."
              },
              {
                question: "What happens if I exceed my included minutes?",
                answer: `Additional minutes are charged at the overage rate specified in your plan. You'll receive notifications before running low on minutes.`
              },
              {
                question: "Can I change plans later?",
                answer: "Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately for upgrades, or at the end of your billing cycle for downgrades."
              },
              {
                question: "Is there a free trial?",
                answer: "Most plans include a free tier or trial period. Sign up to get started and see what works best for your needs."
              }
            ].map((faq, i) => (
              <Card key={i} className="hover:shadow-md transition-all">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-2">{faq.question}</h3>
                  <p className="text-muted-foreground text-sm">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to get started?</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Choose a plan and start building with AI voice agents today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {agencyPlans[0] && (
                <Button size="lg" asChild className="h-12 px-8">
                  <Link href={`/signup?plan=${agencyPlans[0].id}`}>
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Button size="lg" variant="outline" asChild className="h-12 px-8">
                <Link href="/login">
                  Already have an account? Sign in
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/**
 * Platform Partner Pricing Page (Genius365)
 * Shows the hardcoded Free, Pro, and Agency plans
 */
function PlatformPricingPage() {
  const { free, pro, agency } = workspacePlans

  return (
    <div className="py-20 lg:py-28 px-6">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-6 gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Simple, transparent pricing
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Start free, upgrade
            <br />
            <span className="text-muted-foreground">when you're ready</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Begin with $10 in free credits. No credit card required. 
            Upgrade to Pro when you need more power.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {/* Free Plan */}
          <Card className="relative hover:shadow-lg transition-all">
            <CardHeader>
              <CardTitle>{free.name}</CardTitle>
              <CardDescription>{free.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <span className="text-4xl font-bold">Free</span>
                <span className="text-muted-foreground ml-2">to start</span>
              </div>

              <Button asChild className="w-full" variant="outline">
                <Link href="/signup?plan=free">
                  Start Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>

              <ul className="space-y-3">
                {free.featuresList.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Pro Plan - Highlighted */}
          <Card className="relative border-primary shadow-lg shadow-primary/10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="shadow-sm">Most Popular</Badge>
            </div>
            <CardHeader>
              <CardTitle>{pro.name}</CardTitle>
              <CardDescription>{pro.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <span className="text-4xl font-bold">${pro.monthlyPriceCents / 100}</span>
                <span className="text-muted-foreground ml-2">/month</span>
              </div>

              <Button asChild className="w-full">
                <Link href="/signup?plan=pro">
                  Get Pro
                  <Zap className="ml-2 h-4 w-4" />
                </Link>
              </Button>

              <ul className="space-y-3">
                {pro.featuresList.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Agency Plan */}
          <Card className="relative hover:shadow-lg transition-all border-2 border-dashed border-primary/30">
            <div className="absolute -top-3 left-6">
              <Badge variant="secondary" className="gap-1 bg-gradient-to-r from-primary/20 to-primary/10">
                <Building2 className="h-3 w-3" />
                White-Label
              </Badge>
            </div>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {agency.name}
                <Badge variant="outline" className="text-xs font-normal">
                  30 Workspaces
                </Badge>
              </CardTitle>
              <CardDescription>{agency.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <span className="text-4xl font-bold">Custom</span>
                <span className="text-muted-foreground ml-2">pricing</span>
              </div>

              <Button asChild variant="outline" className="w-full border-primary/50 hover:bg-primary/5">
                <Link href="/request-partner">
                  Request Access
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>

              <ul className="space-y-3">
                {agency.featuresList.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Feature Comparison */}
        <div className="mb-20">
          <h2 className="text-2xl font-bold text-center mb-4">Compare Plans</h2>
          <p className="text-center text-muted-foreground mb-8">
            Everything you need to know about each plan
          </p>
          
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-4 px-6 font-medium text-muted-foreground">Feature</th>
                      <th className="text-center py-4 px-6 font-medium">Free</th>
                      <th className="text-center py-4 px-6 font-medium bg-primary/5">Pro</th>
                      <th className="text-center py-4 px-6 font-medium">Agency</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {[
                      { feature: "Monthly Price", free: "Free", pro: "$99/mo", agency: "Custom" },
                      { feature: "Starting Credits", free: `$${free.features.freeCredits}`, pro: "—", agency: "—" },
                      { feature: "Workspaces", free: "1", pro: "1", agency: `${agency.features.maxWorkspaces} included` },
                      { feature: "AI Agents", free: formatLimit(free.features.maxAgents), pro: formatLimit(pro.features.maxAgents), agency: formatLimit(agency.features.maxAgents) },
                      { feature: "Minutes per Month", free: "Pay-as-you-go", pro: `${pro.features.maxMinutesPerMonth.toLocaleString()} included`, agency: "Custom" },
                      { feature: "Provider Integrations", free: formatLimit(free.features.maxIntegrations), pro: formatLimit(pro.features.maxIntegrations), agency: formatLimit(agency.features.maxIntegrations) },
                      { feature: "Storage", free: `${free.features.storageGB}GB`, pro: `${pro.features.storageGB}GB`, agency: formatLimit(agency.features.storageGB) },
                      { feature: "API Access", free: free.features.hasApiAccess, pro: pro.features.hasApiAccess, agency: agency.features.hasApiAccess },
                      { feature: "Priority Support", free: free.features.hasPrioritySupport, pro: pro.features.hasPrioritySupport, agency: agency.features.hasPrioritySupport },
                      { feature: "Custom Branding", free: free.features.hasCustomBranding, pro: pro.features.hasCustomBranding, agency: agency.features.hasCustomBranding },
                      { feature: "Advanced Analytics", free: free.features.hasAdvancedAnalytics, pro: pro.features.hasAdvancedAnalytics, agency: agency.features.hasAdvancedAnalytics },
                      { feature: "White-Label Platform", free: false, pro: false, agency: true },
                      { feature: "Custom Domain", free: false, pro: false, agency: true },
                      { feature: "Dedicated Account Manager", free: false, pro: false, agency: true },
                    ].map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-4 px-6 text-muted-foreground">{row.feature}</td>
                        <td className="text-center py-4 px-6">
                          {typeof row.free === "boolean" ? (
                            row.free ? <Check className="h-5 w-5 text-green-500 mx-auto" /> : <span className="text-muted-foreground/50">—</span>
                          ) : (
                            <span className={row.free === "Free" || row.free.startsWith("$") ? "text-green-600 font-medium" : ""}>{row.free}</span>
                          )}
                        </td>
                        <td className="text-center py-4 px-6 bg-primary/5">
                          {typeof row.pro === "boolean" ? (
                            row.pro ? <Check className="h-5 w-5 text-primary mx-auto" /> : <span className="text-muted-foreground/50">—</span>
                          ) : (
                            row.pro
                          )}
                        </td>
                        <td className="text-center py-4 px-6">
                          {typeof row.agency === "boolean" ? (
                            row.agency ? <Check className="h-5 w-5 text-primary mx-auto" /> : <span className="text-muted-foreground/50">—</span>
                          ) : (
                            row.agency
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* FAQ Section */}
        <div className="mb-20">
          <h2 className="text-2xl font-bold text-center mb-4">Frequently Asked Questions</h2>
          <p className="text-center text-muted-foreground mb-8">Got questions? We've got answers.</p>
          
          <div className="max-w-3xl mx-auto space-y-4">
            {[
              {
                question: "How does the Free plan work?",
                answer: "Start with $10 in free credits—no credit card required. Use them to build and test your AI agents. Once your credits are used up, you can add more credits or upgrade to Pro for included minutes."
              },
              {
                question: "What's included in Pro?",
                answer: "Pro includes 3,000 minutes per month, 25 AI agents, unlimited integrations, priority support, custom branding, and API access. Perfect for growing businesses."
              },
              {
                question: "What happens if I exceed my minutes?",
                answer: "On Pro, overage minutes are billed at $0.08/minute. On Free, you simply add credits as needed—we'll notify you when running low."
              },
              {
                question: "Can I change plans later?",
                answer: "Yes! Upgrade from Free to Pro anytime. If you downgrade, changes take effect at the end of your billing cycle."
              },
              {
                question: "What's the Agency plan?",
                answer: "Agency is for businesses who want to resell or white-label our platform. You get 30 workspaces included, your own branded domain, can create custom pricing plans for your customers, and earn revenue share. Perfect for agencies managing multiple client accounts."
              }
            ].map((faq, i) => (
              <Card key={i} className="hover:shadow-md transition-all">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-2">{faq.question}</h3>
                  <p className="text-muted-foreground text-sm">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to get started?</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Join thousands of businesses using AI voice agents to transform their customer experience.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="h-12 px-8">
                <Link href="/signup?plan=free">
                  Start Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-8">
                <Link href="/signup?plan=pro">
                  Get Pro - $99/mo
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
