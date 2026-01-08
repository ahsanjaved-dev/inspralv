/**
 * Billing System E2E Test Script
 * 
 * Run with: pnpm tsx scripts/test-billing.ts
 * 
 * Prerequisites:
 * 1. Dev server running: pnpm dev
 * 2. Stripe CLI forwarding webhooks: stripe listen --forward-to localhost:3000/api/webhooks/stripe
 * 3. .env.local configured with Stripe keys
 */

import Stripe from "stripe"

// Configuration
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000"
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY not set in environment")
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-11-17.clover",
})

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
}

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logSection(title: string) {
  console.log("\n" + "=".repeat(60))
  log(`  ${title}`, "cyan")
  console.log("=".repeat(60) + "\n")
}

function logSuccess(message: string) {
  log(`✅ ${message}`, "green")
}

function logError(message: string) {
  log(`❌ ${message}`, "red")
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, "blue")
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, "yellow")
}

// =============================================================================
// TEST 1: Verify Stripe Configuration
// =============================================================================

async function testStripeConfiguration() {
  logSection("TEST 1: Stripe Configuration")
  
  try {
    // Test API connection
    const balance = await stripe.balance.retrieve()
    logSuccess(`Connected to Stripe (Available: ${balance.available.map(b => `${b.amount / 100} ${b.currency.toUpperCase()}`).join(", ")})`)
    
    // Check for required price IDs (canonical)
    const priceIds = [
      process.env.STRIPE_PRICE_FREE,
      process.env.STRIPE_PRICE_PRO,
      process.env.STRIPE_PRICE_AGENCY,
    ]
    
    for (const priceId of priceIds) {
      if (priceId) {
        try {
          const price = await stripe.prices.retrieve(priceId)
          logSuccess(`Price found: ${price.id} - $${(price.unit_amount || 0) / 100}/${price.recurring?.interval || "one-time"}`)
        } catch {
          logError(`Price not found: ${priceId}`)
        }
      }
    }
    
    return true
  } catch (error) {
    logError(`Failed to connect to Stripe: ${(error as Error).message}`)
    return false
  }
}

// =============================================================================
// TEST 2: Create Test Customer & PaymentIntent
// =============================================================================

async function testPaymentIntent() {
  logSection("TEST 2: Create PaymentIntent (Simulates Credits Top-up)")
  
  try {
    // Create a test customer
    const customer = await stripe.customers.create({
      email: "test@example.com",
      name: "Test Partner",
      metadata: {
        partner_id: "test-partner-id",
        test: "true",
      },
    })
    logSuccess(`Created test customer: ${customer.id}`)
    
    // Create a PaymentIntent (like credits top-up)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 2500, // $25
      currency: "usd",
      customer: customer.id,
      metadata: {
        partner_id: "test-partner-id",
        type: "credits_topup",
        amount_cents: "2500",
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    })
    logSuccess(`Created PaymentIntent: ${paymentIntent.id}`)
    logInfo(`Client secret: ${paymentIntent.client_secret?.substring(0, 30)}...`)
    
    // Confirm with test card (only works in test mode)
    const confirmedIntent = await stripe.paymentIntents.confirm(paymentIntent.id, {
      payment_method: "pm_card_visa", // Test Visa card
    })
    
    if (confirmedIntent.status === "succeeded") {
      logSuccess(`PaymentIntent succeeded! Status: ${confirmedIntent.status}`)
      logInfo("This should trigger a webhook event. Check your Stripe CLI logs.")
    } else {
      logWarning(`PaymentIntent status: ${confirmedIntent.status}`)
    }
    
    // Cleanup - cancel the customer (optional)
    await stripe.customers.del(customer.id)
    logInfo(`Cleaned up test customer`)
    
    return true
  } catch (error) {
    logError(`PaymentIntent test failed: ${(error as Error).message}`)
    return false
  }
}

// =============================================================================
// TEST 3: Create Checkout Session
// =============================================================================

async function testCheckoutSession() {
  logSection("TEST 3: Create Checkout Session (Simulates Subscription)")
  
  const priceId = process.env.STRIPE_PRICE_PRO
  if (!priceId) {
    logWarning("STRIPE_PRICE_PRO not set, skipping checkout test")
    return true
  }
  
  try {
    // Create a test customer
    const customer = await stripe.customers.create({
      email: "checkout-test@example.com",
      name: "Checkout Test Partner",
      metadata: {
        partner_id: "test-checkout-partner",
        test: "true",
      },
    })
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${BASE_URL}/org/billing?checkout=success`,
      cancel_url: `${BASE_URL}/org/billing?checkout=cancelled`,
      metadata: {
        partner_id: "test-checkout-partner",
        plan_tier: "pro",
      },
    })
    
    logSuccess(`Created Checkout Session: ${session.id}`)
    logInfo(`Checkout URL: ${session.url}`)
    logInfo("Open this URL in a browser to complete the checkout flow")
    
    // Cleanup
    await stripe.customers.del(customer.id)
    
    return true
  } catch (error) {
    logError(`Checkout session test failed: ${(error as Error).message}`)
    return false
  }
}

// =============================================================================
// TEST 4: Trigger Webhook Events via Stripe CLI
// =============================================================================

function printWebhookTestCommands() {
  logSection("TEST 4: Webhook Event Commands")
  
  logInfo("Run these commands in another terminal to trigger webhook events:\n")
  
  console.log(`${colors.yellow}# Test checkout.session.completed:${colors.reset}`)
  console.log(`stripe trigger checkout.session.completed\n`)
  
  console.log(`${colors.yellow}# Test payment_intent.succeeded:${colors.reset}`)
  console.log(`stripe trigger payment_intent.succeeded\n`)
  
  console.log(`${colors.yellow}# Test invoice.paid:${colors.reset}`)
  console.log(`stripe trigger invoice.paid\n`)
  
  console.log(`${colors.yellow}# Test invoice.payment_failed:${colors.reset}`)
  console.log(`stripe trigger invoice.payment_failed\n`)
  
  console.log(`${colors.yellow}# Test customer.subscription.updated:${colors.reset}`)
  console.log(`stripe trigger customer.subscription.updated\n`)
  
  console.log(`${colors.yellow}# Test customer.subscription.deleted:${colors.reset}`)
  console.log(`stripe trigger customer.subscription.deleted\n`)
}

// =============================================================================
// TEST 5: API Endpoint Tests (requires running server)
// =============================================================================

async function testAPIEndpoints() {
  logSection("TEST 5: API Endpoints (Manual)")
  
  logInfo("To test API endpoints, use these curl commands while logged in:\n")
  
  console.log(`${colors.yellow}# Get billing info:${colors.reset}`)
  console.log(`curl -X GET ${BASE_URL}/api/partner/billing -H "Cookie: <your-session-cookie>"\n`)
  
  console.log(`${colors.yellow}# Get credits balance:${colors.reset}`)
  console.log(`curl -X GET ${BASE_URL}/api/partner/credits -H "Cookie: <your-session-cookie>"\n`)
  
  console.log(`${colors.yellow}# Create checkout session:${colors.reset}`)
  console.log(`curl -X POST ${BASE_URL}/api/partner/billing/checkout \\
  -H "Content-Type: application/json" \\
  -H "Cookie: <your-session-cookie>" \\
  -d '{"plan": "pro"}'\n`)
  
  console.log(`${colors.yellow}# Create credits top-up:${colors.reset}`)
  console.log(`curl -X POST ${BASE_URL}/api/partner/credits/topup \\
  -H "Content-Type: application/json" \\
  -H "Cookie: <your-session-cookie>" \\
  -d '{"amountCents": 2500}'\n`)
  
  console.log(`${colors.yellow}# Get Stripe Connect status:${colors.reset}`)
  console.log(`curl -X GET ${BASE_URL}/api/partner/stripe/connect -H "Cookie: <your-session-cookie>"\n`)
}

// =============================================================================
// TEST 6: Credits Deduction Simulation
// =============================================================================

function printCreditsDeductionTest() {
  logSection("TEST 6: Credits Deduction (Code Snippet)")
  
  logInfo("Add this to a test file or run in a script to test usage deduction:\n")
  
  console.log(`${colors.cyan}
// Test credits deduction
import { deductUsage, checkAndSendLowBalanceAlert } from "@/lib/stripe/credits"

async function testDeduction() {
  const partnerId = "your-partner-id" // Get from database
  
  try {
    // Simulate a 5-minute call
    const result = await deductUsage(partnerId, 300, undefined, "Test call")
    
    console.log("Deducted:", result.amountDeducted / 100, "USD")
    console.log("New Balance:", result.newBalanceCents / 100, "USD")
    console.log("Is Low Balance:", result.isLowBalance)
    
    // Trigger low balance alert if needed
    if (result.isLowBalance) {
      await checkAndSendLowBalanceAlert(
        partnerId,
        result.newBalanceCents,
        result.isLowBalance
      )
    }
  } catch (error) {
    console.error("Deduction failed:", error.message)
  }
}
${colors.reset}`)
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log("\n")
  log("🧪 BILLING SYSTEM E2E TEST SUITE", "cyan")
  console.log("=".repeat(60) + "\n")
  
  // Check prerequisites
  logInfo("Prerequisites:")
  logInfo("1. Dev server running at " + BASE_URL)
  logInfo("2. Stripe CLI: stripe listen --forward-to localhost:3000/api/webhooks/stripe")
  logInfo("3. For Connect webhooks: stripe listen --forward-to localhost:3000/api/webhooks/stripe-connect")
  console.log("")
  
  // Run tests
  const results = {
    stripeConfig: await testStripeConfiguration(),
    paymentIntent: await testPaymentIntent(),
    checkoutSession: await testCheckoutSession(),
  }
  
  // Print manual test commands
  printWebhookTestCommands()
  await testAPIEndpoints()
  printCreditsDeductionTest()
  
  // Summary
  logSection("TEST SUMMARY")
  
  Object.entries(results).forEach(([test, passed]) => {
    if (passed) {
      logSuccess(`${test}: PASSED`)
    } else {
      logError(`${test}: FAILED`)
    }
  })
  
  console.log("\n")
  logInfo("Next Steps:")
  logInfo("1. Open browser and navigate to /org/billing to test UI")
  logInfo("2. Use Stripe CLI to trigger webhook events (see commands above)")
  logInfo("3. Check server logs for webhook handling")
  logInfo("4. Use Stripe Dashboard to verify events are received")
  console.log("\n")
}

main().catch(console.error)

