import { cache } from "react"
import { getPartnerAuthContext, type PartnerAuthContext } from "./auth"

/**
 * React cache wrapper for getPartnerAuthContext
 * Ensures auth context is only fetched once per request in RSC
 *
 * Use this in Server Components and layouts
 */
export const getPartnerAuthCached = cache(async (): Promise<PartnerAuthContext | null> => {
  return getPartnerAuthContext()
})
