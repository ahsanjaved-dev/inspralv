import { PricingCard } from "@/components/marketing/pricing-card"
import { getPartnerFromHost } from "@/lib/api/partner"
import { plans } from "@/config/plans"

export default async function PricingPage() {
  const partner = await getPartnerFromHost()
  const primaryColor = partner.branding.primary_color || "#7c3aed"

  return (
    <div className="py-20 px-4">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the perfect plan for your business. All plans include core features.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {/* Starter Plan */}
          <PricingCard
            name="Starter"
            price={plans.starter.price}
            description="Perfect for small teams getting started"
            features={plans.starter.features_list}
            ctaText="Get Started"
            ctaHref="/signup?plan=starter"
            primaryColor={primaryColor}
          />

          {/* Professional Plan */}
          <PricingCard
            name="Professional"
            price={plans.professional.price}
            description="For growing businesses with advanced needs"
            features={plans.professional.features_list}
            ctaText="Get Started"
            ctaHref="/signup?plan=professional"
            highlighted={true}
            primaryColor={primaryColor}
          />

          {/* Enterprise Plan */}
          <PricingCard
            name="Enterprise"
            price={null}
            description="White-label solution for agencies and resellers"
            features={plans.enterprise.features_list}
            ctaText="Request White-Label"
            ctaHref="/request-partner"
            primaryColor={primaryColor}
          />
        </div>

        {/* Feature Comparison Table */}
        <div className="mt-20">
          <h2 className="text-3xl font-bold text-center mb-12">Compare Plans</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-4 px-6 font-semibold">Feature</th>
                  <th className="text-center py-4 px-6 font-semibold">Starter</th>
                  <th className="text-center py-4 px-6 font-semibold">Professional</th>
                  <th className="text-center py-4 px-6 font-semibold">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-4 px-6">AI Agents</td>
                  <td className="text-center py-4 px-6">{plans.starter.features.maxAgents}</td>
                  <td className="text-center py-4 px-6">{plans.professional.features.maxAgents}</td>
                  <td className="text-center py-4 px-6">Unlimited</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-4 px-6">Minutes per Month</td>
                  <td className="text-center py-4 px-6">
                    {plans.starter.features.maxMinutesPerMonth.toLocaleString()}
                  </td>
                  <td className="text-center py-4 px-6">
                    {plans.professional.features.maxMinutesPerMonth.toLocaleString()}
                  </td>
                  <td className="text-center py-4 px-6">Custom</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-4 px-6">Provider Integrations</td>
                  <td className="text-center py-4 px-6">
                    {plans.starter.features.maxIntegrations}
                  </td>
                  <td className="text-center py-4 px-6">Unlimited</td>
                  <td className="text-center py-4 px-6">Unlimited</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-4 px-6">Storage</td>
                  <td className="text-center py-4 px-6">{plans.starter.features.storageGB}GB</td>
                  <td className="text-center py-4 px-6">
                    {plans.professional.features.storageGB}GB
                  </td>
                  <td className="text-center py-4 px-6">Custom</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-4 px-6">Custom Branding</td>
                  <td className="text-center py-4 px-6">❌</td>
                  <td className="text-center py-4 px-6">✅</td>
                  <td className="text-center py-4 px-6">✅</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-4 px-6">White-Label</td>
                  <td className="text-center py-4 px-6">❌</td>
                  <td className="text-center py-4 px-6">❌</td>
                  <td className="text-center py-4 px-6">✅</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-4 px-6">Custom Domain</td>
                  <td className="text-center py-4 px-6">❌</td>
                  <td className="text-center py-4 px-6">❌</td>
                  <td className="text-center py-4 px-6">✅</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-4 px-6">API Access</td>
                  <td className="text-center py-4 px-6">❌</td>
                  <td className="text-center py-4 px-6">✅</td>
                  <td className="text-center py-4 px-6">✅</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="py-4 px-6">Priority Support</td>
                  <td className="text-center py-4 px-6">❌</td>
                  <td className="text-center py-4 px-6">✅</td>
                  <td className="text-center py-4 px-6">✅</td>
                </tr>
                <tr className="hover:bg-muted/50">
                  <td className="py-4 px-6">Dedicated Account Manager</td>
                  <td className="text-center py-4 px-6">❌</td>
                  <td className="text-center py-4 px-6">❌</td>
                  <td className="text-center py-4 px-6">✅</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-20">
          <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
          <div className="max-w-3xl mx-auto space-y-6">
            {[
              {
                question: "Can I change plans later?",
                answer:
                  "Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately.",
              },
              {
                question: "What happens if I exceed my minute limit?",
                answer:
                  "You'll be notified when you reach 80% of your limit. Overage is billed at $0.10 per minute.",
              },
              {
                question: "Is there a free trial?",
                answer: "Yes! All plans come with a 14-day free trial. No credit card required.",
              },
              {
                question: "What's included in the Enterprise plan?",
                answer:
                  "Enterprise includes full white-label capabilities, custom domain, unlimited resources, and dedicated support.",
              },
              {
                question: "How does white-label work?",
                answer:
                  "With Enterprise, you get your own branded platform with custom domain, logo, and colors. Perfect for agencies.",
              },
            ].map((faq, index) => (
              <div key={index} className="border rounded-lg p-6">
                <h3 className="font-semibold text-lg mb-2">{faq.question}</h3>
                <p className="text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
