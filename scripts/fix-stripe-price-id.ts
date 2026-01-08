/**
 * Script to update the Stripe price ID for the Pro plan
 * This fixes the mismatch between the database and the .env STRIPE_PRICE_PRO
 */

import { prisma } from '../lib/prisma'

async function main() {
  console.log('🔍 Finding platform partner...')

  // Find the platform partner
  const platformPartner = await prisma.partner.findFirst({
    where: {
      isPlatformPartner: true,
    },
  })

  if (!platformPartner) {
    console.error('❌ No platform partner found')
    process.exit(1)
  }

  console.log(`✅ Found platform partner: ${platformPartner.name} (ID: ${platformPartner.id})`)

  // Find the Pro plan
  console.log('🔍 Finding Pro subscription plan...')
  const proPlan = await prisma.workspaceSubscriptionPlan.findFirst({
    where: {
      partnerId: platformPartner.id,
      slug: 'pro',
    },
  })

  if (!proPlan) {
    console.error('❌ No Pro plan found for platform partner')
    console.log('Creating Pro plan...')

    // Create the Pro plan if it doesn't exist
    const newPlan = await prisma.workspaceSubscriptionPlan.create({
      data: {
        partnerId: platformPartner.id,
        name: 'Pro',
        slug: 'pro',
        description: '3,000 minutes per month, 25 agents, priority support',
        monthlyPriceCents: 9900, // $99.00
        stripePriceId: 'price_1Sn8dO1E4RCcPHk3ABGrcj2W', // From .env STRIPE_PRICE_PRO
        isActive: true,
        isPublic: true,
      },
    })
    console.log(`✅ Created Pro plan with ID: ${newPlan.id}`)
    console.log(`   Stripe Price ID: ${newPlan.stripePriceId}`)
  } else {
    console.log(`✅ Found Pro plan: ${proPlan.name} (ID: ${proPlan.id})`)
    console.log(`   Current Stripe Price ID: ${proPlan.stripePriceId}`)

    // Update the Stripe price ID
    const correctPriceId = 'price_1Sn8dO1E4RCcPHk3ABGrcj2W' // From .env STRIPE_PRICE_PRO

    if (proPlan.stripePriceId === correctPriceId) {
      console.log('✅ Stripe Price ID is already correct!')
    } else {
      console.log(`🔧 Updating Stripe Price ID to: ${correctPriceId}`)

      const updatedPlan = await prisma.workspaceSubscriptionPlan.update({
        where: { id: proPlan.id },
        data: {
          stripePriceId: correctPriceId,
        },
      })

      console.log(`✅ Updated Pro plan Stripe Price ID`)
      console.log(`   Old: ${proPlan.stripePriceId}`)
      console.log(`   New: ${updatedPlan.stripePriceId}`)
    }
  }

  console.log('\n✅ Done!')
}

main()
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect()
    }
  })
