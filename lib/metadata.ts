import type { Metadata } from "next"
import { getPartnerFromHost } from "./api/partner"

/**
 * Generate metadata based on partner branding
 */
export async function generatePartnerMetadata(pageTitle?: string): Promise<Metadata> {
  try {
    const partner = await getPartnerFromHost()
    const branding = partner.branding
    const companyName = branding.company_name || partner.name

    const title = pageTitle ? `${pageTitle} | ${companyName}` : `${companyName} | AI Voice Platform`

    return {
      title,
      description: `${companyName} - AI Voice Integration Platform`,
      icons: branding.favicon_url ? [{ url: branding.favicon_url }] : undefined,
    }
  } catch {
    return {
      title: "AI Voice Platform",
      description: "AI Voice Integration Platform",
    }
  }
}
