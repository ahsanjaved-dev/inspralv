import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
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
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <div
        className="flex-1 flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}15 0%, ${primaryColor}05 50%, transparent 100%)`,
        }}
      >
        <div className="text-center space-y-8 p-8 max-w-2xl">
          {/* Logo */}
          {branding.logo_url ? (
            <img src={branding.logo_url} alt={companyName} className="h-16 mx-auto" />
          ) : (
            <div
              className="h-20 w-20 mx-auto rounded-2xl flex items-center justify-center text-white font-bold text-4xl shadow-xl"
              style={{ backgroundColor: primaryColor }}
            >
              {companyName[0]}
            </div>
          )}

          {/* Title */}
          <div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight">{companyName}</h1>
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 mt-4">
              AI Voice Integration Platform
            </p>
          </div>

          {/* Description */}
          <p className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            Create intelligent voice agents, automate conversations, and deliver exceptional
            customer experiences with AI-powered voice technology.
          </p>

          {/* CTA Buttons */}
          <div className="flex gap-4 justify-center pt-4">
            <Button
              asChild
              size="lg"
              style={{ backgroundColor: primaryColor }}
              className="text-white hover:opacity-90"
            >
              <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Get Started</Link>
            </Button>
          </div>

          {/* Features Preview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12">
            <div className="p-6 rounded-xl bg-white dark:bg-gray-800 shadow-md">
              <div
                className="h-12 w-12 rounded-lg flex items-center justify-center text-white mb-4"
                style={{ backgroundColor: primaryColor }}
              >
                🤖
              </div>
              <h3 className="font-semibold text-lg">AI Voice Agents</h3>
              <p className="text-sm text-gray-500 mt-2">
                Deploy intelligent voice agents in minutes
              </p>
            </div>
            <div className="p-6 rounded-xl bg-white dark:bg-gray-800 shadow-md">
              <div
                className="h-12 w-12 rounded-lg flex items-center justify-center text-white mb-4"
                style={{ backgroundColor: primaryColor }}
              >
                📞
              </div>
              <h3 className="font-semibold text-lg">Smart Conversations</h3>
              <p className="text-sm text-gray-500 mt-2">
                Natural language processing for seamless interactions
              </p>
            </div>
            <div className="p-6 rounded-xl bg-white dark:bg-gray-800 shadow-md">
              <div
                className="h-12 w-12 rounded-lg flex items-center justify-center text-white mb-4"
                style={{ backgroundColor: primaryColor }}
              >
                📊
              </div>
              <h3 className="font-semibold text-lg">Analytics</h3>
              <p className="text-sm text-gray-500 mt-2">Deep insights into every conversation</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-gray-500 border-t">
        <p>
          © {new Date().getFullYear()} {companyName}. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
