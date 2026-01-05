/**
 * GET /api/partner/credits
 * Returns the partner's current credits balance and recent transactions
 */

import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, unauthorized, serverError } from "@/lib/api/helpers"
import { getPartnerCreditsInfo, getPartnerTransactions } from "@/lib/stripe/credits"

export async function GET() {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth || !auth.partner) {
      return unauthorized()
    }

    const [creditsInfo, transactions] = await Promise.all([
      getPartnerCreditsInfo(auth.partner.id),
      getPartnerTransactions(auth.partner.id, 10),
    ])

    return apiResponse({
      credits: creditsInfo,
      transactions,
    })
  } catch (error) {
    console.error("GET /api/partner/credits error:", error)
    return serverError((error as Error).message)
  }
}

