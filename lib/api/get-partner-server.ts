import { cache } from "react"
import { getPartnerFromHost, type ResolvedPartner } from "./partner"

/**
 * React cache wrapper for getPartnerFromHost
 * Ensures partner is only fetched once per request in RSC
 */
export const getPartnerCached = cache(async (): Promise<ResolvedPartner> => {
  return getPartnerFromHost()
})
