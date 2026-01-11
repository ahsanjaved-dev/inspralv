import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Phone,
  Mic,
  BarChart3,
  Zap,
  Shield,
  Globe,
  ArrowRight,
  Sparkles,
  Bot,
  MessageSquare,
  Headphones,
  Building2,
  Users,
  Clock,
  Check,
  Play,
} from "lucide-react"
import { getPartnerFromHost } from "@/lib/api/partner"
import { getPartnerAuthCached } from "@/lib/api/get-auth-cached"
import { ThemeToggle } from "@/components/ui/theme-toggle"

export default async function Home() {
  // Get partner branding first
  const partner = await getPartnerFromHost()
  
  // For white-label partners: redirect to login (marketing site not available)
  if (!partner.is_platform_partner) {
    redirect("/login")
  }

  // Check if user is already logged in
  const auth = await getPartnerAuthCached()

  if (auth) {
    const firstWorkspace = auth.workspaces[0]
    if (auth.workspaces.length === 1 && firstWorkspace) {
      redirect(`/w/${firstWorkspace.slug}/dashboard`)
    }
    redirect("/select-workspace")
  }

  const branding = partner.branding
  const companyName = branding.company_name || partner.name

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt={companyName} className="h-8" />
            ) : (
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
                  <Mic className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-bold text-xl tracking-tight">{companyName}</span>
              </div>
            )}
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link
              href="#features"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </Link>
            <Link
              href="#use-cases"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Use Cases
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/pricing">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-20 lg:py-32 px-6 overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-linear-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 rounded-full blur-[100px] opacity-50" />

        <div className="container mx-auto max-w-6xl relative">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <Badge variant="secondary" className="px-4 py-1.5 gap-2">
              <Sparkles className="h-3.5 w-3.5" />
              Powered by VAPI, Retell & Inspra
            </Badge>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-center leading-[1.1] tracking-tight mb-6">
            AI Voice Agents
            <br />
            <span className="text-primary">That Sound Human</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground text-center max-w-2xl mx-auto mb-10 leading-relaxed">
            Build intelligent voice agents in minutes. Automate customer calls, handle inquiries
            24/7, and scale your business with conversational AI.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <Button size="lg" asChild className="h-12 px-8">
              <Link href="/pricing">
                Start Building Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-12 px-8">
              <Link href="/request-partner">
                <Building2 className="mr-2 h-4 w-4" />
                Request White-Label
              </Link>
            </Button>
          </div>

          {/* Demo Preview Card */}
          <Card className="max-w-3xl mx-auto">
            <CardContent className="p-6 md:p-8">
              {/* Demo Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Sales Assistant</p>
                    <p className="text-sm text-muted-foreground">Active • 24/7</p>
                  </div>
                </div>
                <Badge variant="outline" className="gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Live
                </Badge>
              </div>

              {/* Waveform Visualization */}
              <div className="flex items-center justify-center gap-1 h-16 mb-6">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-primary rounded-full animate-pulse"
                    style={{
                      height: `${20 + Math.sin(i * 0.5) * 30 + Math.random() * 20}%`,
                      animationDelay: `${i * 50}ms`,
                      animationDuration: "1s",
                      opacity: 0.4 + Math.sin(i * 0.3) * 0.4,
                    }}
                  />
                ))}
              </div>

              {/* Demo Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">2.3s</p>
                  <p className="text-xs text-muted-foreground">Avg Response</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">98%</p>
                  <p className="text-xs text-muted-foreground">Satisfaction</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold">24/7</p>
                  <p className="text-xs text-muted-foreground">Availability</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Logos Section */}
      <section className="py-12 px-6 border-y bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <p className="text-center text-sm text-muted-foreground mb-6">
            TRUSTED BY INNOVATIVE COMPANIES
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 opacity-60">
            {["VAPI", "Retell", "Synthflow", "Twilio", "OpenAI"].map((name) => (
              <span key={name} className="text-lg font-semibold tracking-wider">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 lg:py-28 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">
              Features
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need to build
              <br />
              <span className="text-muted-foreground">voice-first experiences</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Mic,
                title: "Natural Voice AI",
                description:
                  "Ultra-realistic voices with emotion, tone, and natural speech patterns.",
              },
              {
                icon: MessageSquare,
                title: "Smart Conversations",
                description:
                  "Context-aware dialogue that understands intent and handles interruptions.",
              },
              {
                icon: Phone,
                title: "Phone Integration",
                description:
                  "Connect to any phone system. Handle inbound, outbound, and transfers.",
              },
              {
                icon: BarChart3,
                title: "Real-time Analytics",
                description: "Track conversations, measure sentiment, and monitor performance.",
              },
              {
                icon: Zap,
                title: "Instant Deployment",
                description: "Go live in minutes. No coding required. Connect your existing tools.",
              },
              {
                icon: Shield,
                title: "Enterprise Security",
                description: "SOC 2 compliant. End-to-end encryption. Your data stays protected.",
              },
            ].map((feature, index) => (
              <Card
                key={index}
                className="group hover:shadow-lg transition-all hover:border-primary/50"
              >
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section id="use-cases" className="py-20 lg:py-28 px-6 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">
              Use Cases
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for every industry</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our AI voice agents handle millions of conversations across industries.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                title: "Customer Support",
                description:
                  "Handle support tickets 24/7. Resolve issues instantly. Escalate when needed.",
                icon: Headphones,
                stats: "85% resolution rate",
              },
              {
                title: "Sales & Lead Qualification",
                description:
                  "Qualify leads automatically. Book meetings. Follow up at the perfect time.",
                icon: Users,
                stats: "3x more qualified leads",
              },
              {
                title: "Appointment Scheduling",
                description:
                  "Let customers book, reschedule, and cancel appointments over the phone.",
                icon: Clock,
                stats: "60% fewer no-shows",
              },
              {
                title: "Outbound Campaigns",
                description:
                  "Run personalized outbound campaigns at scale. Track results in real-time.",
                icon: Phone,
                stats: "10x call volume",
              },
            ].map((useCase, index) => (
              <Card key={index} className="group hover:shadow-lg transition-all">
                <CardContent className="p-6 md:p-8">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <useCase.icon className="h-7 w-7 text-primary" />
                    </div>
                    <Badge variant="secondary" className="text-green-600 bg-green-500/10">
                      {useCase.stats}
                    </Badge>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{useCase.title}</h3>
                  <p className="text-muted-foreground">{useCase.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-28 px-6">
        <div className="container mx-auto max-w-4xl">
          <Card className="border-primary/20 bg-linear-to-br from-primary/5 to-primary/10">
            <CardContent className="p-8 md:p-12 text-center">
              <h2 className="text-2xl md:text-4xl font-bold mb-4">
                Ready to transform your customer experience?
              </h2>
              <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
                Join thousands of businesses using AI voice agents to automate conversations and
                delight customers.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild className="h-12 px-8">
                  <Link href="/pricing">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="h-12 px-8">
                  <Link href="/request-partner">Request White-Label</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 px-6 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="md:col-span-2">
              <Link href="/" className="flex items-center gap-2 mb-4">
                {branding.logo_url ? (
                  <img src={branding.logo_url} alt={companyName} className="h-8" />
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
                      <Mic className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <span className="font-bold text-xl">{companyName}</span>
                  </div>
                )}
              </Link>
              <p className="text-sm text-muted-foreground max-w-sm">
                AI Voice Integration Platform. Build intelligent voice agents that automate
                conversations and deliver exceptional customer experiences.
              </p>
            </div>

            {/* Product */}
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/pricing" className="hover:text-foreground transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/request-partner" className="hover:text-foreground transition-colors">
                    White-Label
                  </Link>
                </li>
              </ul>
            </div>

            {/* Account */}
            <div>
              <h3 className="font-semibold mb-4">Account</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/login" className="hover:text-foreground transition-colors">
                    Sign In
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-foreground transition-colors">
                    Get Started
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} {companyName}. All rights reserved.
            </p>
            <ThemeToggle showLabel />
          </div>
        </div>
      </footer>
    </div>
  )
}
