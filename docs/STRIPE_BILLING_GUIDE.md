# 📚 Complete Stripe Billing System Guide

> **Author**: AI-assisted implementation  
> **Last Updated**: January 2026  
> **Stack**: Next.js 15, Stripe, Prisma, Supabase PostgreSQL

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Stripe Concepts](#2-core-stripe-concepts)
3. [The Three-Layer Billing Model](#3-the-three-layer-billing-model)
4. [Database Schema](#4-database-schema)
5. [API Route Structure](#5-api-route-structure)
6. [Webhook System Deep Dive](#6-webhook-system-deep-dive)
7. [Idempotency - Why & How](#7-idempotency---why--how)
8. [Race Conditions & Solutions](#8-race-conditions--solutions)
9. [Stripe Connect Explained](#9-stripe-connect-explained)
10. [Usage Deduction Flow](#10-usage-deduction-flow)
11. [Common Issues & Where to Fix](#11-common-issues--where-to-fix)
12. [Security Best Practices](#12-security-best-practices)
13. [Testing Checklist](#13-testing-checklist)
14. [Environment Variables](#14-environment-variables)

---

## 1. Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              YOUR PLATFORM                                   │
│                            (inspralv / Genius365)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
│  │   PARTNER    │ creates │    PLANS     │ offered │  WORKSPACE   │        │
│  │   (Agency)   │────────▶│ (Products)   │────────▶│  (Client)    │        │
│  └──────┬───────┘         └──────────────┘         └──────┬───────┘        │
│         │                                                  │                │
│         │ pays                                       pays  │                │
│         ▼                                                  ▼                │
│  ┌──────────────┐                                  ┌──────────────┐        │
│  │   PLATFORM   │                                  │   PARTNER    │        │
│  │   STRIPE     │                                  │   STRIPE     │        │
│  │   ACCOUNT    │◀─── 10% fee ────────────────────│   CONNECT    │        │
│  └──────────────┘                                  └──────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Money Flow Diagram

```
                    WORKSPACE PAYS $100
                           │
                           ▼
              ┌────────────────────────┐
              │  Partner's Stripe      │
              │  Connect Account       │
              │  (receives $90)        │
              └───────────┬────────────┘
                          │
                          │ application_fee_amount
                          ▼
              ┌────────────────────────┐
              │  Platform's Stripe     │
              │  Account               │
              │  (receives $10 = 10%)  │
              └────────────────────────┘
```

### High-Level Component Interaction

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│  Next.js    │────▶│   Prisma    │────▶│  PostgreSQL │
│   (React)   │     │  API Routes │     │   Client    │     │  (Supabase) │
└─────────────┘     └──────┬──────┘     └─────────────┘     └─────────────┘
                           │
                           │ Stripe SDK
                           ▼
                    ┌─────────────┐
                    │   Stripe    │
                    │   API       │
                    └──────┬──────┘
                           │
                           │ Webhooks
                           ▼
                    ┌─────────────┐
                    │  /api/      │
                    │  webhooks/  │
                    └─────────────┘
```

---

## 2. Core Stripe Concepts

### 2.1 Key Objects

| Object | What It Is | Your Use Case |
|--------|------------|---------------|
| **Customer** | A person/company that pays you | Each Partner & Workspace |
| **Product** | What you're selling | "Starter Plan", "Pro Plan" |
| **Price** | How much a Product costs | $49/month, $99/month |
| **Subscription** | Recurring payment for a Price | Partner subscribes to Starter |
| **PaymentIntent** | One-time payment attempt | Credits top-up |
| **Invoice** | Bill sent to Customer | Monthly subscription invoice |
| **Checkout Session** | Hosted payment page | "Subscribe" button → Stripe page |
| **Webhook** | HTTP callback from Stripe | "Payment succeeded" notification |
| **Connect Account** | Sub-account for marketplaces | Partner's payment account |

### 2.2 Object Relationships

```
Customer
    │
    ├── Subscription ─────┬── Price ──── Product
    │                     │
    │                     └── Invoice (monthly)
    │                              │
    │                              └── PaymentIntent
    │
    └── PaymentIntent (one-time, e.g., credits)
```

### 2.3 Payment Lifecycle

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Created │───▶│ Pending │───▶│Processing│───▶│Succeeded│───▶│ Webhook │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
                                   │
                                   ▼
                            ┌─────────┐
                            │ Failed  │───▶ Webhook (payment_failed)
                            └─────────┘
```

### 2.4 Subscription Lifecycle

```
┌────────────┐   checkout    ┌────────────┐   payment    ┌────────────┐
│ incomplete │──────────────▶│   active   │◀────────────▶│  past_due  │
└────────────┘   completes   └─────┬──────┘   fails/     └────────────┘
                                   │         succeeds           │
                    cancel_at_     │                            │
                    period_end     │                            │
                                   ▼                            ▼
                            ┌────────────┐              ┌────────────┐
                            │  canceled  │              │  unpaid    │
                            └────────────┘              └────────────┘
```

---

## 3. The Three-Layer Billing Model

### Layer 1: Platform ↔ Partner (Agency Subscriptions)

```
YOU (Platform Owner)
         │
         │  Partner pays you for using the platform
         │  e.g., $79/month for Starter plan
         ▼
┌────────────────────────────┐
│ Platform Stripe Account    │
│ (Your main Stripe account) │
└────────────────────────────┘
```

**Purpose**: Partners (agencies) pay YOU for access to the platform.

**Files involved:**
```
lib/stripe/index.ts              - Stripe client & helpers
app/api/partner/billing/
  ├── route.ts                   - GET subscription status
  ├── checkout/route.ts          - POST create checkout session
  └── portal/route.ts            - POST get customer portal URL
app/api/webhooks/stripe/route.ts - Platform webhook handler
```

**Flow:**
1. Partner clicks "Subscribe to Pro"
2. Your API creates Stripe Checkout Session
3. Partner pays on Stripe-hosted page
4. Stripe sends `checkout.session.completed` webhook
5. Your webhook handler activates subscription in DB

### Layer 2: Partner Credits (Prepaid Balance)

```
Partner buys $100 credits
         │
         │  Credits stored in database
         │  Deducted when calls complete
         ▼
┌────────────────────────────┐
│ billing_credits table      │
│ balance_cents: 10000       │
└────────────────────────────┘
```

**Purpose**: Partners prepay for usage (voice minutes). Deducted as they use.

**Files involved:**
```
lib/stripe/credits.ts                  - Credit management logic
app/api/partner/credits/
  ├── route.ts                         - GET balance & transactions
  └── topup/route.ts                   - POST create top-up PaymentIntent
```

**Flow:**
1. Partner clicks "Add $50 Credits"
2. Your API creates PaymentIntent
3. Partner pays via Stripe Elements
4. Stripe sends `payment_intent.succeeded` webhook
5. Your webhook handler adds credits to balance

### Layer 3: Partner ↔ Workspace (via Stripe Connect)

```
Workspace pays Partner
         │
         │  Money goes to Partner's Connect account
         │  Platform takes 10% fee automatically
         ▼
┌────────────────────────────┐
│ Partner's Connect Account  │
│ (Their Stripe sub-account) │
└────────────────────────────┘
```

**Purpose**: Workspaces (partner's clients) pay the PARTNER. You take a cut.

**Files involved:**
```
lib/stripe/workspace-credits.ts       - Workspace credit logic
app/api/partner/stripe/connect/
  └── route.ts                         - GET/POST Connect onboarding
app/api/w/[workspaceSlug]/
  ├── credits/
  │   ├── route.ts                     - GET workspace credits
  │   └── topup/route.ts               - POST create top-up
  └── subscription/
      ├── route.ts                     - GET/POST/PATCH/DELETE subscription
      ├── plans/route.ts               - GET available plans
      └── preview/route.ts             - POST proration preview
app/api/webhooks/stripe-connect/route.ts - Connect webhook handler
```

**Flow (Subscription):**
1. Workspace clicks "Subscribe to Pro Plan"
2. Your API creates Checkout Session ON THE PARTNER'S CONNECT ACCOUNT
3. Workspace pays on Stripe-hosted page
4. Stripe sends webhook to `/api/webhooks/stripe-connect`
5. Your webhook handler activates subscription

**Flow (Credits Top-up):**
1. Workspace clicks "Add $25 Credits"
2. Your API creates PaymentIntent ON THE PARTNER'S CONNECT ACCOUNT
3. Workspace pays via Stripe Elements
4. Stripe sends webhook to `/api/webhooks/stripe-connect`
5. Your webhook handler adds credits to workspace balance

---

## 4. Database Schema

### 4.1 Partner Billing Tables

```sql
-- Partner's platform subscription (paying YOU)
-- Stored directly on partners table:
--   stripe_customer_id
--   stripe_subscription_id
--   subscription_status
--   plan_tier

-- Partner's prepaid credits
CREATE TABLE billing_credits (
  id UUID PRIMARY KEY,
  partner_id UUID UNIQUE REFERENCES partners(id),
  balance_cents INTEGER DEFAULT 0,
  low_balance_threshold_cents INTEGER DEFAULT 1000,  -- $10
  per_minute_rate_cents INTEGER DEFAULT 15,          -- $0.15/min
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Partner credit transactions (audit trail)
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY,
  billing_credits_id UUID REFERENCES billing_credits(id),
  type credit_transaction_type,  -- 'topup', 'usage', 'refund', 'adjustment'
  amount_cents INTEGER,          -- Positive for credits, negative for debits
  balance_after_cents INTEGER,
  description TEXT,
  stripe_payment_intent_id VARCHAR(100),  -- For idempotency
  conversation_id UUID,
  created_at TIMESTAMPTZ
);
```

### 4.2 Workspace Billing Tables

```sql
-- Plans that partners create for their workspaces
CREATE TABLE workspace_subscription_plans (
  id UUID PRIMARY KEY,
  partner_id UUID REFERENCES partners(id),
  name VARCHAR(100),
  description TEXT,
  stripe_product_id VARCHAR(100),   -- On Connect account
  stripe_price_id VARCHAR(100),     -- On Connect account
  monthly_price_cents INTEGER DEFAULT 0,
  included_minutes INTEGER DEFAULT 0,
  overage_rate_cents INTEGER DEFAULT 20,  -- $0.20/min
  features JSONB DEFAULT '[]',
  max_agents INTEGER,
  max_conversations_per_month INTEGER,
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Workspace subscriptions to partner plans
CREATE TABLE workspace_subscriptions (
  id UUID PRIMARY KEY,
  workspace_id UUID UNIQUE REFERENCES workspaces(id),
  plan_id UUID REFERENCES workspace_subscription_plans(id),
  stripe_subscription_id VARCHAR(100),  -- On Connect account
  stripe_customer_id VARCHAR(100),      -- On Connect account
  status workspace_subscription_status,  -- 'active', 'past_due', 'canceled', etc.
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  minutes_used_this_period INTEGER DEFAULT 0,
  overage_charges_cents INTEGER DEFAULT 0,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Workspace prepaid credits (for overage)
CREATE TABLE workspace_credits (
  id UUID PRIMARY KEY,
  workspace_id UUID UNIQUE REFERENCES workspaces(id),
  balance_cents INTEGER DEFAULT 0,
  low_balance_threshold_cents INTEGER DEFAULT 500,  -- $5
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Workspace credit transactions
CREATE TABLE workspace_credit_transactions (
  id UUID PRIMARY KEY,
  workspace_credits_id UUID REFERENCES workspace_credits(id),
  type credit_transaction_type,
  amount_cents INTEGER,
  balance_after_cents INTEGER,
  description TEXT,
  stripe_payment_intent_id VARCHAR(100),
  conversation_id UUID,
  created_at TIMESTAMPTZ
);
```

### 4.3 Entity Relationship Diagram

```
┌─────────────────┐
│     Partner     │
├─────────────────┤
│ stripe_customer │
│ stripe_subscr.  │
└────────┬────────┘
         │ 1
         │
         │ 1
┌────────▼────────┐         ┌─────────────────────┐
│ BillingCredits  │◀────────│ CreditTransactions  │
└────────┬────────┘    N    └─────────────────────┘
         │ 1
         │
         │ N
┌────────▼────────┐
│   Workspace     │
├─────────────────┤      ┌───────────────────────────┐
│ is_billing_     │      │ WorkspaceSubscriptionPlan │
│   exempt        │◀─────│ (created by Partner)      │
└────────┬────────┘      └─────────────┬─────────────┘
         │ 1                           │
         │                             │ N
         │ 1                           │
┌────────▼────────┐         ┌──────────▼──────────┐
│WorkspaceCredits │         │WorkspaceSubscription│
└────────┬────────┘         └─────────────────────┘
         │ 1
         │
         │ N
┌────────▼────────────────┐
│WorkspaceCreditTransaction│
└─────────────────────────┘
```

---

## 5. API Route Structure

### 5.1 Complete Route Map

```
/api/
│
├── partner/                              # Partner-level operations
│   │
│   ├── billing/
│   │   ├── route.ts                      GET    - Get subscription status
│   │   ├── checkout/route.ts             POST   - Create checkout session
│   │   └── portal/route.ts               POST   - Get customer portal URL
│   │
│   ├── credits/
│   │   ├── route.ts                      GET    - Get credits balance
│   │   └── topup/route.ts                POST   - Create top-up PaymentIntent
│   │
│   ├── stripe/connect/route.ts           GET    - Check Connect status
│   │                                     POST   - Start Connect onboarding
│   │
│   ├── subscription-plans/
│   │   ├── route.ts                      GET    - List all plans
│   │   │                                 POST   - Create new plan
│   │   └── [planId]/route.ts             GET    - Get plan details
│   │                                     PATCH  - Update plan
│   │                                     DELETE - Delete/deactivate plan
│   │
│   └── workspaces/[id]/billing/route.ts  GET    - Get workspace billing
│                                         PATCH  - Update billing settings
│
├── w/[workspaceSlug]/                    # Workspace-level operations
│   │
│   ├── credits/
│   │   ├── route.ts                      GET    - Get workspace credits
│   │   └── topup/route.ts                POST   - Create top-up (via Connect)
│   │
│   └── subscription/
│       ├── route.ts                      GET    - Get subscription status
│       │                                 POST   - Subscribe to plan
│       │                                 PATCH  - Change plan (upgrade/downgrade)
│       │                                 DELETE - Cancel subscription
│       ├── plans/route.ts                GET    - List available plans
│       └── preview/route.ts              POST   - Preview proration
│
└── webhooks/                             # Stripe webhooks
    ├── stripe/route.ts                   POST   - Platform events
    └── stripe-connect/route.ts           POST   - Connect events
```

### 5.2 Standard API Response Pattern

```typescript
// Success response
{
  "data": {
    // ... your data
  }
}

// Error response
{
  "error": "Error message here"
}
```

### 5.3 Standard Route Pattern

```typescript
import { NextRequest } from "next/server"
import { z } from "zod"
import { getPartnerAuthContext } from "@/lib/api/auth"
import { apiResponse, apiError, unauthorized, forbidden, serverError } from "@/lib/api/helpers"
import { prisma } from "@/lib/prisma"

// 1. Define validation schema
const mySchema = z.object({
  field: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    // 2. Authentication
    const auth = await getPartnerAuthContext()
    if (!auth?.partner) {
      return unauthorized()  // 401
    }

    // 3. Authorization
    if (!auth.partnerRole || !["owner", "admin"].includes(auth.partnerRole)) {
      return forbidden("Only admins can do this")  // 403
    }

    // 4. Database check
    if (!prisma) {
      return serverError("Database not configured")  // 500
    }

    // 5. Validate request body
    const body = await request.json()
    const parsed = mySchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid data")  // 400
    }

    // 6. Business logic
    const result = await doSomething(parsed.data)

    // 7. Return success
    return apiResponse(result)  // 200

  } catch (error) {
    console.error("POST /api/... error:", error)
    return serverError((error as Error).message)
  }
}
```

---

## 6. Webhook System Deep Dive

### 6.1 Why Webhooks?

```
WITHOUT WEBHOOKS (Bad):
┌──────┐ 1. Create checkout ┌────────┐
│ User │──────────────────▶│ Stripe │
└──────┘                    └────────┘
   │ 2. User closes browser
   │    or loses connection
   ▼
❌ Payment succeeded but you never know!


WITH WEBHOOKS (Good):
┌──────┐ 1. Create checkout ┌────────┐
│ User │──────────────────▶│ Stripe │
└──────┘                    └────┬───┘
                                 │ 2. Payment succeeds
                                 │
                    ┌────────────▼────────────┐
                    │  3. Webhook POST to     │
                    │  /api/webhooks/stripe   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  4. Update database     │
                    │  (subscription active)  │
                    └─────────────────────────┘
```

### 6.2 Webhook Security - Signature Verification

**CRITICAL**: Always verify webhook signatures to prevent fake requests!

```typescript
// app/api/webhooks/stripe/route.ts

export async function POST(request: NextRequest) {
  const stripe = getStripe()
  
  // 1. Get raw body (must be raw string, not parsed JSON!)
  const body = await request.text()
  
  // 2. Get signature from header
  const signature = request.headers.get("stripe-signature")
  
  if (!signature) {
    return new Response("Missing signature", { status: 400 })
  }
  
  // 3. Verify signature using webhook secret
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,                    // Raw body string
      signature,               // Stripe-Signature header
      env.stripeWebhookSecret  // Your webhook secret (whsec_...)
    )
  } catch (err) {
    // Invalid signature = someone trying to fake a webhook!
    console.error("Webhook signature verification failed:", err)
    return new Response("Invalid signature", { status: 400 })
  }
  
  // 4. Now it's safe to process the event
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object)
      break
    // ... other events
  }
  
  return new Response("OK", { status: 200 })
}
```

### 6.3 Two Webhook Endpoints

| Endpoint | Secret Env Var | Handles |
|----------|---------------|---------|
| `/api/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET` | Platform events (partner subscriptions, partner credits) |
| `/api/webhooks/stripe-connect` | `STRIPE_CONNECT_WEBHOOK_SECRET` | Connect events (workspace subscriptions, workspace credits) |

### 6.4 Event Types We Handle

**Platform Webhook (`/api/webhooks/stripe`):**
```
checkout.session.completed    → Activate partner subscription
customer.subscription.updated → Sync subscription status
customer.subscription.deleted → Mark as canceled
invoice.payment_failed        → Send notification, mark past_due
payment_intent.succeeded      → Apply partner credits top-up
```

**Connect Webhook (`/api/webhooks/stripe-connect`):**
```
customer.subscription.created → Create workspace subscription
customer.subscription.updated → Sync status, update period
customer.subscription.deleted → Mark as canceled
invoice.payment_succeeded     → Reset usage for new period
invoice.payment_failed        → Mark past_due
payment_intent.succeeded      → Apply workspace credits top-up
```

### 6.5 Webhook Flow Diagram

```
       STRIPE                    YOUR SERVER                    DATABASE
         │                            │                            │
         │  POST /webhooks/stripe     │                            │
         │  {event: {...}}            │                            │
         │───────────────────────────▶│                            │
         │                            │                            │
         │                            │ 1. Verify signature        │
         │                            │                            │
         │                            │ 2. Parse event type        │
         │                            │                            │
         │                            │ 3. Handle event            │
         │                            │────────────────────────────▶│
         │                            │    UPDATE subscriptions    │
         │                            │    SET status = 'active'   │
         │                            │◀────────────────────────────│
         │                            │                            │
         │  200 OK                    │                            │
         │◀───────────────────────────│                            │
         │                            │                            │
```

### 6.6 Webhook Retry Logic

Stripe retries failed webhooks with exponential backoff:

```
Attempt 1: Immediate
Attempt 2: 5 minutes
Attempt 3: 30 minutes
Attempt 4: 2 hours
Attempt 5: 5 hours
Attempt 6: 10 hours
Attempt 7: 24 hours
...up to 72 hours total
```

**Important**: Return 200 quickly! Do heavy processing async if needed.

---

## 7. Idempotency - Why & How

### 7.1 The Problem

```
Network issue scenario:

1. User clicks "Add Credits"
2. PaymentIntent created, payment succeeds
3. Webhook fires: "payment_intent.succeeded"
4. You add $10 to balance
5. Network hiccup - you return 500 error
6. Stripe retries webhook (it thinks you didn't receive it)
7. You add $10 again!
8. User now has $20 instead of $10 ❌
```

### 7.2 The Solution: Idempotency Keys

Use a unique identifier (like `payment_intent_id`) to detect duplicates:

```typescript
// lib/stripe/credits.ts

export async function applyTopup(
  partnerId: string,
  amountCents: number,
  paymentIntentId: string  // ← This is our idempotency key!
): Promise<{ success: boolean; alreadyApplied: boolean }> {
  
  // Step 1: Check if we already processed this PaymentIntent
  const existingTx = await prisma.creditTransaction.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
  })

  if (existingTx) {
    // Already processed - return success but don't add credits again!
    console.log(`Top-up already applied for ${paymentIntentId}`)
    return { success: true, alreadyApplied: true }
  }

  // Step 2: First time processing - apply the credits
  const newBalance = credits.balanceCents + amountCents
  
  await prisma.$transaction([
    prisma.billingCredits.update({
      where: { id: credits.id },
      data: { balanceCents: newBalance },
    }),
    prisma.creditTransaction.create({
      data: {
        billingCreditsId: credits.id,
        type: "topup",
        amountCents: amountCents,
        balanceAfterCents: newBalance,
        stripePaymentIntentId: paymentIntentId,  // ← Store the key!
      },
    }),
  ])

  return { success: true, alreadyApplied: false }
}
```

### 7.3 Idempotency Pattern Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     IDEMPOTENT OPERATION                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Extract unique identifier                               │
│     (PaymentIntent ID, Subscription ID, etc.)               │
│                          │                                  │
│                          ▼                                  │
│  2. Query: Have we processed this ID before?                │
│     SELECT * FROM transactions                              │
│     WHERE stripe_payment_intent_id = ?                      │
│                          │                                  │
│            ┌─────────────┴─────────────┐                   │
│            │                           │                    │
│            ▼                           ▼                    │
│      FOUND (exists)              NOT FOUND (new)            │
│            │                           │                    │
│            ▼                           ▼                    │
│      Return early                Process operation          │
│      { alreadyApplied: true }    Store ID in database       │
│                                  { alreadyApplied: false }  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.4 What Makes a Good Idempotency Key?

| Key | Good? | Why |
|-----|-------|-----|
| `payment_intent_id` | ✅ | Unique per payment, provided by Stripe |
| `subscription_id` | ✅ | Unique per subscription |
| `event_id` | ✅ | Unique per webhook event |
| `user_id + timestamp` | ⚠️ | Risky if timestamp isn't precise enough |
| `random UUID` | ❌ | Different every time, defeats purpose |

---

## 8. Race Conditions & Solutions

### 8.1 The Problem: Concurrent Credit Deduction

```
Scenario: Two API calls end at the same time, both try to deduct credits

Time    Thread A                    Thread B                    DB Balance
────    ────────                    ────────                    ──────────
0ms     Read balance: $10           Read balance: $10           $10
1ms     Calculate: $10 - $5 = $5    Calculate: $10 - $3 = $7    $10
2ms     Write: $5                   Write: $7                   $5 (A wins)
3ms     -                           -                           $7 (B overwrites!)

Result: Should be $10 - $5 - $3 = $2, but got $7! ❌
         User got free credits!
```

### 8.2 Solution: Atomic Conditional Update

```typescript
// ❌ BAD - Race condition vulnerable
async function deductCredits_BAD(id: string, amount: number) {
  // Step 1: Read current balance
  const credits = await prisma.workspaceCredits.findUnique({ 
    where: { id } 
  })
  
  // Step 2: Calculate new balance
  const newBalance = credits.balanceCents - amount
  
  // Step 3: Write new balance
  // PROBLEM: Another thread may have changed it between Step 1 and 3!
  await prisma.workspaceCredits.update({
    where: { id },
    data: { balanceCents: newBalance },
  })
}

// ✅ GOOD - Atomic operation with condition
async function deductCredits_GOOD(id: string, amount: number) {
  // Single atomic operation that:
  // 1. Checks balance >= amount
  // 2. Decrements balance
  // All in one database operation!
  const result = await prisma.workspaceCredits.updateMany({
    where: {
      id: id,
      balanceCents: { gte: amount },  // Only update if sufficient balance
    },
    data: {
      balanceCents: { decrement: amount },  // Atomic decrement
    },
  })

  if (result.count === 0) {
    // No rows updated = either not found OR insufficient balance
    throw new Error("Insufficient credits")
  }
}
```

### 8.3 Why This Works

The database handles the locking:

```
Time    Thread A                              Thread B                    DB
────    ────────                              ────────                    ──
0ms     BEGIN TRANSACTION                     BEGIN TRANSACTION           $10
        UPDATE credits                        (waiting for lock...)
        SET balance = balance - 5
        WHERE id = X AND balance >= 5
        
1ms     (acquires row lock)                   (still waiting)             $10
        balance = 10, 10 >= 5? YES
        balance = 10 - 5 = 5
        
2ms     COMMIT                                (lock released!)            $5
        ✓ Updated 1 row                       
        
3ms     -                                     UPDATE credits              $5
                                              SET balance = balance - 3
                                              WHERE id = X AND balance >= 3
                                              
4ms     -                                     balance = 5, 5 >= 3? YES    $2
                                              balance = 5 - 3 = 2
                                              COMMIT
                                              ✓ Updated 1 row

Final: $10 - $5 - $3 = $2 ✓ Correct!
```

### 8.4 Complex Transactions

When you need multiple operations to succeed or fail together:

```typescript
// All operations in the transaction succeed or all fail
await prisma.$transaction(async (tx) => {
  // 1. Atomically deduct credits
  const updated = await tx.workspaceCredits.updateMany({
    where: { 
      id: creditsId, 
      balanceCents: { gte: amount } 
    },
    data: { 
      balanceCents: { decrement: amount } 
    },
  })
  
  if (updated.count === 0) {
    throw new Error("Insufficient credits")
    // Transaction will be rolled back!
  }
  
  // 2. Get the new balance
  const credits = await tx.workspaceCredits.findUnique({ 
    where: { id: creditsId } 
  })
  
  // 3. Create transaction record
  await tx.workspaceCreditTransaction.create({
    data: {
      workspaceCreditsId: creditsId,
      type: "usage",
      amountCents: -amount,
      balanceAfterCents: credits.balanceCents,
      description: "Call usage",
    },
  })
  
  // 4. Update subscription usage counter
  await tx.workspaceSubscription.update({
    where: { workspaceId },
    data: { 
      minutesUsedThisPeriod: { increment: minutes } 
    },
  })
})
// If any step fails, everything is rolled back
```

### 8.5 Race Condition Prevention Checklist

| Scenario | Solution |
|----------|----------|
| Deducting credits | `updateMany` with `gte` condition |
| Adding credits | Idempotency check before update |
| Updating counters | `{ increment: X }` instead of read-then-write |
| Multiple related updates | `prisma.$transaction()` |
| Webhook processing | Idempotency key check first |

---

## 9. Stripe Connect Explained

### 9.1 What is Stripe Connect?

Stripe Connect lets you build a **marketplace** or **platform** where:

- **You** are the Platform (Inspralv)
- **Partners** are Connected Accounts (agencies)
- **Workspaces** pay Partners through your platform
- **You** automatically take a percentage (application fee)

### 9.2 Connect Account Types

| Type | Dashboard | Onboarding | Use Case |
|------|-----------|------------|----------|
| **Standard** | Full Stripe dashboard | Complex | Partner manages everything |
| **Express** | Limited dashboard | Simple, hosted | ✅ **Your setup** |
| **Custom** | None (you build) | You build it | Full control |

### 9.3 Express Account Onboarding Flow

```
┌──────────┐  1. "Connect Stripe"  ┌──────────────┐
│  Partner │──────────────────────▶│  Your API    │
│  clicks  │                       │              │
└──────────┘                       └──────┬───────┘
                                          │
     2. Create Express account            │
        stripe.accounts.create({          │
          type: "express",                │
          capabilities: {                 │
            card_payments: { requested: true },
            transfers: { requested: true },
          }
        })                                │
                                          ▼
                               ┌──────────────────┐
                               │  Stripe returns  │
                               │  account ID      │
                               └────────┬─────────┘
                                        │
     3. Create onboarding link          │
        stripe.accountLinks.create({    │
          account: accountId,           │
          type: "account_onboarding",   │
          return_url: "...",            │
          refresh_url: "...",           │
        })                              │
                                        ▼
┌──────────┐  4. Redirect to     ┌──────────────────┐
│  Partner │◀────────────────────│  Stripe Hosted   │
│          │   onboarding URL    │  Onboarding Page │
└────┬─────┘                     └──────────────────┘
     │
     │ 5. Partner enters:
     │    - Business info
     │    - Bank account
     │    - Identity verification
     │    - Tax info
     ▼
┌──────────────┐  6. Redirect back  ┌──────────────┐
│  Partner     │◀───────────────────│  Stripe      │
│  (onboarded) │   to return_url    │  (complete)  │
└──────────────┘                    └──────────────┘
```

### 9.4 Storing Connect Account ID

```typescript
// Stored in partner.settings JSON field
{
  "stripe_connect_account_id": "acct_1234567890",
  // ... other settings
}

// Helper function to retrieve (handles key variations)
export function getConnectAccountId(
  settings: Record<string, unknown> | null
): string | undefined {
  if (!settings) return undefined
  return (
    (settings.stripe_connect_account_id as string) ||
    (settings.stripeConnectAccountId as string)
  )
}
```

### 9.5 Making Payments on Connect Accounts

```typescript
// Creating a payment that goes TO the connected account
const paymentIntent = await stripe.paymentIntents.create(
  {
    amount: 10000,  // $100 in cents
    currency: "usd",
    
    // YOUR CUT: 10% goes to your platform account
    application_fee_amount: 1000,  // $10
    
    automatic_payment_methods: { enabled: true },
    
    metadata: {
      workspace_id: workspaceId,
      type: "workspace_credits_topup",
    },
  },
  {
    // CRITICAL: This makes the payment go to the Connect account!
    stripeAccount: connectAccountId,
  }
)

// Money flow:
// Customer pays $100
//   → $90 goes to Partner's Connect account
//   → $10 goes to your Platform account (application_fee)
```

### 9.6 Creating Subscriptions on Connect Accounts

```typescript
// Create checkout session on Partner's Connect account
const session = await stripe.checkout.sessions.create(
  {
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [
      {
        price: plan.stripePriceId,  // Price on Connect account!
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/billing?success=true`,
    cancel_url: `${baseUrl}/billing?canceled=true`,
    subscription_data: {
      metadata: {
        workspace_id: workspaceId,
        plan_id: planId,
      },
    },
  },
  {
    stripeAccount: connectAccountId,  // On Partner's account
  }
)
```

### 9.7 Connect Webhooks

When events happen on Connect accounts, Stripe sends them to your Connect webhook endpoint with the `Stripe-Account` header:

```typescript
// app/api/webhooks/stripe-connect/route.ts

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")
  const connectAccountId = request.headers.get("stripe-account")  // ← Which account?

  // Verify with CONNECT webhook secret (different from platform!)
  const event = stripe.webhooks.constructEvent(
    body,
    signature,
    env.stripeConnectWebhookSecret  // whsec_... (Connect-specific)
  )

  console.log(`Event ${event.type} from account ${connectAccountId}`)
  
  // Handle events...
}
```

---

## 10. Usage Deduction Flow

### 10.1 Hybrid Billing Logic

```
                           CALL ENDS
                              │
                              ▼
                    ┌─────────────────┐
                    │ Is workspace    │
                    │ billing-exempt? │
                    └────────┬────────┘
                             │
              YES            │            NO
         ┌───────────────────┴───────────────────┐
         ▼                                       ▼
┌─────────────────┐                   ┌─────────────────┐
│ Deduct from     │                   │ Has active      │
│ PARTNER credits │                   │ subscription?   │
└─────────────────┘                   └────────┬────────┘
                                               │
                                YES            │            NO
                           ┌───────────────────┴───────────────────┐
                           ▼                                       ▼
                 ┌─────────────────┐                     ┌─────────────────┐
                 │ Minutes left in │                     │ Deduct from     │
                 │ subscription?   │                     │ prepaid credits │
                 └────────┬────────┘                     │ at per-min rate │
                          │                              └─────────────────┘
               YES        │         NO (overage)
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌─────────────────┐             ┌─────────────────┐
│ Use included    │             │ Deduct from     │
│ minutes (free)  │             │ prepaid credits │
│ Increment usage │             │ at OVERAGE rate │
└─────────────────┘             └─────────────────┘
```

### 10.2 Code Implementation

```typescript
// lib/stripe/workspace-credits.ts

export async function deductWorkspaceUsage(
  workspaceId: string,
  durationSeconds: number,
  conversationId?: string
): Promise<UsageDeductionResult> {
  
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      partnerId: true,
      isBillingExempt: true,
      perMinuteRateCents: true,
    },
  })

  const minutes = Math.ceil(durationSeconds / 60)

  // Case 1: Billing exempt → use partner credits
  if (workspace.isBillingExempt) {
    return await deductPartnerUsage(
      workspace.partnerId,
      durationSeconds,
      conversationId
    )
  }

  // Check for subscription
  const subscription = await prisma.workspaceSubscription.findUnique({
    where: { workspaceId },
    include: { plan: true },
  })

  // Case 2: Active subscription → use included minutes first
  if (subscription?.status === "active") {
    const remainingIncluded = subscription.plan.includedMinutes - 
                              subscription.minutesUsedThisPeriod
    
    if (minutes <= remainingIncluded) {
      // All covered by subscription
      await prisma.workspaceSubscription.update({
        where: { id: subscription.id },
        data: { minutesUsedThisPeriod: { increment: minutes } },
      })
      return { deductedFrom: "subscription", amountDeducted: 0 }
    }
    
    // Partial coverage → overage from credits
    const overageMinutes = minutes - remainingIncluded
    const overageAmount = overageMinutes * subscription.plan.overageRateCents
    
    // Update subscription usage + deduct overage from credits
    // ... (atomic transaction)
  }

  // Case 3: No subscription → all from prepaid credits
  const amount = minutes * workspace.perMinuteRateCents
  return await deductFromPrepaidCredits(workspaceId, amount, conversationId)
}
```

### 10.3 When Usage is Deducted

Usage deduction happens in webhook handlers when calls complete:

```typescript
// app/api/webhooks/vapi/route.ts (or retell)

async function handleCallEnded(call: VapiCall) {
  const durationSeconds = call.duration_seconds
  const workspaceId = call.metadata?.workspace_id
  const conversationId = call.id

  // Deduct usage
  const result = await deductWorkspaceUsage(
    workspaceId,
    durationSeconds,
    conversationId
  )

  // Update conversation cost
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { totalCost: result.amountDeducted / 100 },
  })
  
  // Check for low balance alert
  if (result.isLowBalance) {
    await sendLowBalanceAlert(workspaceId)
  }
}
```

---

## 11. Common Issues & Where to Fix

### 11.1 Quick Reference Table

| Issue | Symptom | File to Check | Solution |
|-------|---------|---------------|----------|
| Webhook not received | Events in Stripe dashboard but no logs | Check webhook URL in Stripe | Verify endpoint is public |
| Webhook signature fails | 400 error in Stripe events | `lib/env.ts` | Check `STRIPE_WEBHOOK_SECRET` |
| Payment not applying credits | Payment succeeded but balance unchanged | `lib/stripe/credits.ts` | Check `applyTopup()` logic |
| Connect account error | "No such account" | Partner's DB row | Clear old `stripe_connect_account_id` |
| Subscription stuck on incomplete | Checkout done but not active | `app/api/webhooks/stripe-connect/route.ts` | Check webhook handler |
| Wrong proration amount | Upgrade charges unexpected amount | `app/api/w/.../subscription/route.ts` | Check `proration_behavior` |
| Plans not showing for workspace | Empty plan list | `app/api/partner/subscription-plans/route.ts` | Check `isActive` and `isPublic` flags |
| Credits double-applied | Balance increased twice | `lib/stripe/credits.ts` | Check idempotency key logic |
| Race condition on deduction | Negative balance or wrong deduction | `lib/stripe/workspace-credits.ts` | Use atomic `updateMany` |

### 11.2 Debugging Checklist

**Webhooks not working?**
```
1. ✓ Is ngrok running? (for local dev)
2. ✓ Is the webhook URL correct in Stripe Dashboard?
3. ✓ Is the webhook secret correct in .env?
4. ✓ Are you using the raw body for signature verification?
5. ✓ Check Stripe Dashboard → Developers → Webhooks → Logs
```

**Payments not going through?**
```
1. ✓ Is the Stripe API key correct?
2. ✓ Is it test mode vs live mode mismatch?
3. ✓ For Connect: is the account ID valid?
4. ✓ For Connect: is the account fully onboarded?
5. ✓ Check Stripe Dashboard → Payments for errors
```

**Subscription issues?**
```
1. ✓ Is the Price ID valid and on the correct account?
2. ✓ Is the Customer created on the correct account?
3. ✓ Check the subscription status in Stripe Dashboard
4. ✓ Check your DB for the subscription record
5. ✓ Verify webhook is updating the DB correctly
```

### 11.3 Logging for Debugging

Add detailed logs to webhook handlers:

```typescript
console.log(`[Stripe Webhook] Received: ${event.type} (${event.id})`)
console.log(`[Stripe Webhook] Data:`, JSON.stringify(event.data.object, null, 2))

// After processing
console.log(`[Stripe Webhook] Successfully processed ${event.type}`)
```

---

## 12. Security Best Practices

### 12.1 Environment Variables

```bash
# NEVER commit these to git!
# Add to .env.local (local) or hosting platform (production)

STRIPE_SECRET_KEY=sk_live_...           # Or sk_test_... for testing
STRIPE_WEBHOOK_SECRET=whsec_...         # Platform webhook
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_... # Connect webhook
```

### 12.2 Webhook Security Checklist

```
✓ Always verify webhook signatures
✓ Use HTTPS in production (Stripe requires it)
✓ Don't log sensitive data (card numbers, etc.)
✓ Return 200 quickly, process async if needed
✓ Implement idempotency for all state changes
```

### 12.3 API Security

```typescript
// Always authenticate requests
const auth = await getPartnerAuthContext()
if (!auth) {
  return unauthorized()
}

// Always authorize based on role
if (!["owner", "admin"].includes(auth.partnerRole)) {
  return forbidden()
}

// Always validate input
const parsed = schema.safeParse(body)
if (!parsed.success) {
  return apiError("Invalid input")
}
```

### 12.4 Database Security

```typescript
// Use parameterized queries (Prisma does this automatically)
await prisma.user.findUnique({
  where: { id: untrustedInput },  // Safe - Prisma escapes
})

// Never use raw SQL with user input
// ❌ BAD: `SELECT * FROM users WHERE id = '${userId}'`
```

---

## 13. Testing Checklist

### 13.1 Stripe Test Mode

Always use test mode keys during development:
- Test keys start with `sk_test_` and `pk_test_`
- Test card: `4242 4242 4242 4242` (any future date, any CVC)
- Stripe CLI for local webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

### 13.2 Scenario Checklist

**Partner Billing:**
```
□ Partner can view current subscription status
□ Partner can upgrade to Pro plan
□ Partner can downgrade plan
□ Partner can cancel subscription
□ Partner can access customer portal
□ Webhook correctly updates subscription status
```

**Partner Credits:**
```
□ Partner can view credit balance
□ Partner can top up credits
□ Payment webhook applies credits
□ Credits are deducted on usage
□ Low balance alert is sent
□ Idempotency prevents double-apply
```

**Stripe Connect:**
```
□ Partner can start Connect onboarding
□ Partner can complete onboarding
□ Connect account ID is stored correctly
□ Partner can check Connect status
```

**Workspace Subscriptions:**
```
□ Workspace can view available plans
□ Workspace can subscribe to plan
□ Subscription checkout works
□ Webhook activates subscription
□ Workspace can upgrade plan (immediate charge)
□ Workspace can downgrade plan (credit applied)
□ Workspace can cancel subscription
□ Usage tracking works within subscription
□ Overage is charged from credits
```

**Workspace Credits:**
```
□ Workspace can view credit balance
□ Workspace can top up credits
□ Payment goes to Partner's Connect account
□ Platform receives application fee
□ Credits are applied after payment
```

---

## 14. Environment Variables

### 14.1 Required Variables

```bash
# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Stripe Platform
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Connect
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (create in Stripe Dashboard first)
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PROFESSIONAL=price_...
STRIPE_PRICE_ENTERPRISE=price_...

# App URL (for redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 14.2 Getting Webhook Secrets

**For local development:**
```bash
# Run Stripe CLI
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# It will show: whsec_... 
# Copy that to STRIPE_WEBHOOK_SECRET
```

**For production:**
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/webhooks/stripe`
3. Select events to listen for
4. Copy the signing secret

---

## Quick Reference Card

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/partner/billing` | Get partner subscription |
| POST | `/api/partner/billing/checkout` | Create checkout session |
| POST | `/api/partner/billing/portal` | Get customer portal URL |
| GET | `/api/partner/credits` | Get credits balance |
| POST | `/api/partner/credits/topup` | Top up credits |
| GET/POST | `/api/partner/stripe/connect` | Connect onboarding |
| GET/POST | `/api/partner/subscription-plans` | Manage plans |
| GET | `/api/w/[slug]/subscription` | Get workspace subscription |
| POST | `/api/w/[slug]/subscription` | Subscribe to plan |
| PATCH | `/api/w/[slug]/subscription` | Change plan |
| DELETE | `/api/w/[slug]/subscription` | Cancel subscription |
| GET | `/api/w/[slug]/credits` | Get workspace credits |
| POST | `/api/w/[slug]/credits/topup` | Top up workspace credits |

### Key Files

| Purpose | File |
|---------|------|
| Stripe client | `lib/stripe/index.ts` |
| Partner credits | `lib/stripe/credits.ts` |
| Workspace credits | `lib/stripe/workspace-credits.ts` |
| Platform webhook | `app/api/webhooks/stripe/route.ts` |
| Connect webhook | `app/api/webhooks/stripe-connect/route.ts` |
| Database schema | `prisma/schema.prisma` |

---

**Happy billing! 💰**

