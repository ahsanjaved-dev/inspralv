import { PartnerRequestForm } from "@/components/marketing/partner-request-form"
import { getPartnerFromHost } from "@/lib/api/partner"
import { env } from "@/lib/env"

export default async function RequestPartnerPage() {
  const partner = await getPartnerFromHost()
  const primaryColor = partner.branding.primary_color || "#7c3aed"
  const platformDomain = env.platformDomain

  return (
    <div className="py-20 px-4">
      <div className="container mx-auto max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Become a White-Label Partner</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Launch your own branded AI voice platform. Complete the form below and our team will
            review your request within 24-48 hours.
          </p>
        </div>

        {/* Form */}
        <PartnerRequestForm primaryColor={primaryColor} platformDomain={platformDomain} />

        {/* Benefits Section */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "Full White-Label",
              description: "Your brand, your domain, your platform",
            },
            {
              title: "Dedicated Support",
              description: "Priority support and account management",
            },
            {
              title: "Unlimited Scale",
              description: "No limits on agents, users, or minutes",
            },
          ].map((benefit, index) => (
            <div key={index} className="text-center p-6 border rounded-lg">
              <h3 className="font-semibold text-lg mb-2">{benefit.title}</h3>
              <p className="text-sm text-muted-foreground">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
