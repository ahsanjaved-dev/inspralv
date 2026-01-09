/**
 * Plan Change API Routes (DEPRECATED)
 *
 * Partner plan changes are now managed via WhiteLabelVariants assigned by super admin.
 * Partners cannot self-service change their plan tier.
 *
 * To change a partner's plan:
 * 1. Super admin updates the partner's whiteLabelVariantId
 * 2. Partner cancels current subscription and re-subscribes (if needed)
 *
 * These endpoints now return error messages directing users to contact support.
 */

import { NextRequest } from "next/server"
import { getPartnerAuthContext, isPartnerAdmin } from "@/lib/api/auth"
import { apiError, unauthorized, forbidden } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"

const DEPRECATION_MESSAGE = 
  "Partner plan changes are managed by the platform administrator. " +
  "Please contact support to change your plan tier."

/**
 * GET - Preview plan change (DEPRECATED)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth || !auth.partner) {
      return unauthorized()
    }

    if (!isPartnerAdmin(auth)) {
      return forbidden("Only partner admins can manage subscriptions")
    }

    // Check if partner has assigned variant
    if (prisma) {
      const partner = await prisma.partner.findUnique({
        where: { id: auth.partner.id },
        select: {
          whiteLabelVariantId: true,
          whiteLabelVariant: {
            select: { name: true }
          }
        }
      })

      if (partner?.whiteLabelVariant) {
        return apiError(
          `You are currently on the ${partner.whiteLabelVariant.name} plan. ` +
          DEPRECATION_MESSAGE,
          400
        )
      }
    }

    return apiError(DEPRECATION_MESSAGE, 400)
  } catch (error) {
    console.error("GET /api/partner/billing/change-plan error:", error)
    return apiError(DEPRECATION_MESSAGE, 400)
  }
}

/**
 * POST - Change subscription plan (DEPRECATED)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getPartnerAuthContext()
    if (!auth || !auth.partner) {
      return unauthorized()
    }

    if (!isPartnerAdmin(auth)) {
      return forbidden("Only partner admins can manage subscriptions")
    }

    // Check if partner has assigned variant
    if (prisma) {
      const partner = await prisma.partner.findUnique({
        where: { id: auth.partner.id },
        select: {
          whiteLabelVariantId: true,
          whiteLabelVariant: {
            select: { name: true }
          }
        }
      })

      if (partner?.whiteLabelVariant) {
        return apiError(
          `You are currently on the ${partner.whiteLabelVariant.name} plan. ` +
          DEPRECATION_MESSAGE,
          400
        )
      }
    }

    return apiError(DEPRECATION_MESSAGE, 400)
  } catch (error) {
    console.error("POST /api/partner/billing/change-plan error:", error)
    return apiError(DEPRECATION_MESSAGE, 400)
  }
}
