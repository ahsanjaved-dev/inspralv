"use client"

import { useEffect } from "react"
import type { ResolvedPartner } from "@/lib/api/partner"

interface Props {
  partner: ResolvedPartner
  children: React.ReactNode
}

export function AuthLayoutClient({ partner, children }: Props) {
  const branding = partner.branding
  const companyName = branding.company_name || partner.name
  const primaryColor = branding.primary_color || "#7c3aed"

  // Apply partner branding to document
  useEffect(() => {
    const root = document.documentElement

    if (branding.primary_color) {
      root.style.setProperty("--brand-primary", branding.primary_color)
    }
    if (branding.secondary_color) {
      root.style.setProperty("--brand-secondary", branding.secondary_color)
    }

    // Update title
    document.title = `${companyName} | Sign In`

    // Update favicon
    if (branding.favicon_url) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement
      if (!link) {
        link = document.createElement("link")
        link.rel = "icon"
        document.head.appendChild(link)
      }
      link.href = branding.favicon_url
    }

    return () => {
      root.style.removeProperty("--brand-primary")
      root.style.removeProperty("--brand-secondary")
    }
  }, [branding, companyName])

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md p-8">
        {/* Partner Logo/Name */}
        <div className="text-center mb-8">
          {branding.logo_url ? (
            <img src={branding.logo_url} alt={companyName} className="h-12 mx-auto mb-4" />
          ) : (
            <div
              className="h-14 w-14 mx-auto mb-4 rounded-xl flex items-center justify-center text-white font-bold text-2xl shadow-lg"
              style={{ backgroundColor: primaryColor }}
            >
              {companyName[0]}
            </div>
          )}
          <h1 className="text-3xl font-bold">{companyName}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">AI Voice Platform</p>
        </div>
        {children}
      </div>
    </div>
  )
}
