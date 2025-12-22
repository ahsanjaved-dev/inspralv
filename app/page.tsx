import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Bot, MessageSquare, BarChart3, Zap, Shield, Globe } from "lucide-react"
import { getPartnerFromHost } from "@/lib/api/partner"
import { getPartnerAuthCached } from "@/lib/api/get-auth-cached"

export default async function Home() {
  // Check if user is already logged in
  const auth = await getPartnerAuthCached()

  if (auth) {
    // User is logged in - redirect to workspace selector
    if (auth.workspaces.length === 1) {
      redirect(`/w/${auth.workspaces[0].slug}/dashboard`)
    }
    redirect("/select-workspace")
  }

  // Get partner branding for the landing page
  const partner = await getPartnerFromHost()
  const branding = partner.branding
  const companyName = branding.company_name || partner.name
  const primaryColor = branding.primary_color || "#7c3aed"

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section
        className="py-20 px-4"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}15 0%, ${primaryColor}05 50%, transparent 100%)`,
        }}
      >
        <div className="container mx-auto max-w-6xl text-center">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
            AI Voice Agents for
            <br />
            <span style={{ color: primaryColor }}>Modern Businesses</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Create intelligent voice agents in minutes. Automate conversations, handle customer
            inquiries, and scale your business with AI-powered voice technology.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild style={{ backgroundColor: primaryColor }}>
              <Link href="/signup">Start Free Trial</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to succeed</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Powerful features to create, manage, and optimize your AI voice agents
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Bot,
                title: "AI Voice Agents",
                description: "Deploy intelligent voice agents powered by the latest AI models",
              },
              {
                icon: MessageSquare,
                title: "Natural Conversations",
                description: "Advanced NLP for human-like, context-aware conversations",
              },
              {
                icon: BarChart3,
                title: "Analytics & Insights",
                description: "Deep insights into every conversation with detailed analytics",
              },
              {
                icon: Zap,
                title: "Quick Integration",
                description: "Connect with VAPI, Retell, and Synthflow in minutes",
              },
              {
                icon: Shield,
                title: "Enterprise Security",
                description: "Bank-level security with SOC 2 compliance",
              },
              {
                icon: Globe,
                title: "White-Label Ready",
                description: "Full white-label solution with custom branding",
              },
            ].map((feature, index) => (
              <Card key={index}>
                <CardContent className="p-6">
                  <div
                    className="h-12 w-12 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: `${primaryColor}20` }}
                  >
                    <feature.icon className="h-6 w-6" style={{ color: primaryColor }} />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <Card style={{ borderColor: primaryColor }}>
            <CardContent className="p-12 text-center">
              <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                Join hundreds of businesses using AI voice agents to transform their customer
                experience
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild style={{ backgroundColor: primaryColor }}>
                  <Link href="/signup">Start Free Trial</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/request-partner">Request White-Label</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
