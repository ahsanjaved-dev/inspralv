# Genius365 Codebase Reference

> A comprehensive reference for the Genius365 AI Voice Agent Platform

---

## 1. Executive Summary

**Genius365** is a white-label AI Voice Agent Management Platform that enables agencies to manage AI voice agents across multiple providers (VAPI, Retell) with full multi-tenancy support, white-labeling, and workspace isolation.

### Key Capabilities

- **Multi-Provider Voice AI**: Unified interface for VAPI and Retell voice agents
- **White-Label Platform**: Full branding customization for agencies
- **Multi-Tenancy**: Partner → Workspace → User hierarchy with data isolation
- **Campaign System**: Batch outbound calling with business hours and rate limiting
- **Credit-Based Billing**: Stripe integration with prepaid/postpaid subscriptions
- **Knowledge Base**: Document management for AI agent context
- **Real-time Analytics**: Call logs, sentiment analysis, and Algolia search

---

## 2. Technology Stack

### Core Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.0.8 | Full-stack React framework (App Router) |
| React | 19.2.1 | UI library |
| TypeScript | ^5 | Type safety |

### Database & Auth

| Technology | Purpose |
|------------|---------|
| Supabase | PostgreSQL database + Auth |
| Prisma | ^6.19.1 - Type-safe ORM |
| Supabase SSR | Server-side auth with cookie handling |

### UI & Styling

| Technology | Purpose |
|------------|---------|
| Tailwind CSS | ^4 - Utility-first CSS |
| Radix UI | Accessible component primitives |
| Framer Motion | Animations |
| Lucide React | Icons |
| Recharts | Data visualization |

### State Management

| Technology | Purpose |
|------------|---------|
| React Query | ^5.90 - Server state management |
| Zustand | ^5.0 - Client state management |

### Voice Providers

| Provider | SDK |
|----------|-----|
| VAPI | @vapi-ai/web ^2.5.2 |
| Retell | retell-sdk ^4.66.0, retell-client-js-sdk ^2.0.7 |

### Billing & Search

| Technology | Purpose |
|------------|---------|
| Stripe | ^20.0.0 - Payments & subscriptions |
| Algolia | ^5.46.2 - Call logs search |

---

## 3. Project Structure

```
genius365/
├── app/                          # Next.js App Router pages & API routes
│   ├── api/                      # API routes
│   │   ├── auth/                 # Authentication endpoints
│   │   ├── partner/              # Partner/org management
│   │   ├── w/[workspaceSlug]/    # Workspace-scoped APIs
│   │   └── webhooks/             # Provider webhooks (VAPI, Retell, Stripe)
│   ├── org/                      # Organization dashboard pages
│   ├── w/[workspaceSlug]/        # Workspace pages
│   └── super-admin/              # Super admin pages
│
├── components/                   # React components
│   ├── ui/                       # UI primitives (buttons, inputs, etc.)
│   ├── workspace/                # Workspace-specific components
│   │   ├── agents/               # Agent management
│   │   ├── calls/                # Call logs & detail
│   │   └── campaigns/            # Campaign management
│   ├── org/                      # Organization components
│   └── billing/                  # Billing components
│
├── lib/                          # Business logic & utilities
│   ├── api/                      # API helpers & auth
│   ├── auth/                     # Auth utilities
│   ├── billing/                  # Billing/usage logic
│   ├── campaigns/                # Campaign processing
│   ├── hooks/                    # React hooks (~47 files)
│   ├── integrations/             # Provider integrations
│   │   ├── vapi/                 # VAPI agent sync & mapping
│   │   ├── retell/               # Retell agent sync & mapping
│   │   ├── function_tools/       # Custom function tools
│   │   └── mcp/                  # MCP client
│   ├── prisma/                   # Prisma client singleton
│   ├── rbac/                     # Role-based access control
│   ├── stripe/                   # Stripe integration
│   ├── supabase/                 # Supabase clients
│   └── algolia/                  # Algolia search
│
├── prisma/
│   └── schema.prisma             # Database schema
│
├── types/                        # TypeScript type definitions
│
├── config/                       # Configuration files
│   ├── plans.ts                  # Subscription plan definitions
│   └── site.ts                   # Site configuration
│
└── genius365-mcp-server/         # Standalone MCP server for tool execution
```

---

## 4. Database Architecture

### Entity Relationship Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MULTI-TENANCY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │   Partner    │ 1:N  │  Workspace   │ 1:N  │   AiAgent    │  │
│  │   (Agency)   │─────▶│  (Project)   │─────▶│              │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
│         │                     │                     │           │
│         │                     │                     │           │
│    1:N  │                1:N  │                1:N  │           │
│         ▼                     ▼                     ▼           │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │PartnerMember │      │WorkspaceMember│     │ Conversation │  │
│  │              │      │               │      │   (Call)     │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     INTEGRATIONS                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────┐      ┌───────────────────────────────┐  │
│  │PartnerIntegration │─────▶│WorkspaceIntegrationAssignment │  │
│  │  (Org-level keys) │ 1:N  │    (Which key → workspace)    │  │
│  └───────────────────┘      └───────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       BILLING                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Partner Level:                 Workspace Level:                │
│  ┌──────────────────┐          ┌───────────────────────────┐   │
│  │  BillingCredits  │          │WorkspaceSubscriptionPlan  │   │
│  │  (Agency pool)   │          │   (Custom plans)          │   │
│  └──────────────────┘          └───────────────────────────┘   │
│          │                              │                       │
│          ▼                              ▼                       │
│  ┌──────────────────┐          ┌───────────────────────────┐   │
│  │CreditTransaction │          │  WorkspaceSubscription    │   │
│  └──────────────────┘          │  (Prepaid/Postpaid)       │   │
│                                └───────────────────────────┘   │
│                                         │                       │
│                                         ▼                       │
│                                ┌───────────────────────────┐   │
│                                │   WorkspaceCredits        │   │
│                                │   (Workspace balance)     │   │
│                                └───────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Enums

```typescript
enum AgentProvider { vapi, retell }
enum VoiceProvider { elevenlabs, deepgram, azure, openai, cartesia }
enum ModelProvider { openai, anthropic, google, groq }
enum CallDirection { inbound, outbound }
enum CallStatus { initiated, ringing, in_progress, completed, failed, no_answer, busy, canceled }
enum SyncStatus { not_synced, pending, synced, error }
enum AgentDirection { inbound, outbound }
```

### Core Models

| Model | Purpose |
|-------|---------|
| `Partner` | Top-level agency/organization |
| `Workspace` | Project within a partner |
| `AiAgent` | Voice agent (synced to VAPI/Retell) |
| `Conversation` | Call record with transcript, recording |
| `PartnerIntegration` | Org-level API keys (VAPI/Retell/Algolia) |
| `WorkspaceIntegrationAssignment` | Links integration → workspace |
| `KnowledgeDocument` | RAG documents for agents |
| `Lead` | Contact captured from calls |
| `PhoneNumber` | Phone number inventory |
| `SipTrunk` | SIP configuration for telephony |

---

## 5. Authentication System

### Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                    AUTH FLOW                                  │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Browser ──▶ Supabase Auth ──▶ JWT Cookie ──▶ API Routes     │
│                                                               │
│  Components:                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐            │
│  │ createClient()      │  │ createClient()      │            │
│  │ (Browser - SSR)     │  │ (Server - cookies)  │            │
│  └─────────────────────┘  └─────────────────────┘            │
│                                                               │
│  ┌─────────────────────┐  ┌─────────────────────┐            │
│  │ createAdminClient() │  │ updateSession()     │            │
│  │ (Service role)      │  │ (Middleware)        │            │
│  └─────────────────────┘  └─────────────────────┘            │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Supabase Clients

| Client | File | Purpose |
|--------|------|---------|
| Browser Client | `lib/supabase/client.ts` | Client-side auth |
| Server Client | `lib/supabase/server.ts` | Server-side with cookies |
| Admin Client | `lib/supabase/admin.ts` | Service role (bypass RLS) |
| Middleware | `lib/supabase/middleware.ts` | Session refresh |

### Partner Auth Context

The `getPartnerAuthContext()` function (`lib/api/auth.ts`) is the core auth helper:

```typescript
interface PartnerAuthContext {
  user: PartnerAuthUser           // Authenticated user
  partner: ResolvedPartner        // Partner from hostname
  partnerRole: PartnerMemberRole  // User's role in partner
  partnerMembership: PartnerMembership
  workspaces: AccessibleWorkspace[] // User's accessible workspaces
  supabase: SupabaseClient
  adminClient: SupabaseClient
}
```

**Features:**
- Resolves partner from hostname (white-label support)
- Caches membership data for 5 minutes
- Parallel queries for partner + workspace memberships
- Partner admins get access to ALL workspaces

### RBAC Permission System

**Roles:**
- **Workspace**: `viewer` → `member` → `admin` → `owner`
- **Partner**: `member` → `admin` → `owner`

**Permission Categories:**
```typescript
// Workspace permissions
"workspace.agents.read"
"workspace.agents.create"
"workspace.agents.update"
"workspace.agents.delete"
"workspace.conversations.read"
"workspace.members.invite"
// ... 40+ permissions

// Partner permissions
"partner.workspaces.create"
"partner.members.invite"
"partner.billing.update"
// ... 20+ permissions
```

**Usage:**
```typescript
import { hasWorkspacePermission, withWorkspacePermission } from "@/lib/rbac"

// Check permission
if (hasWorkspacePermission(role, "workspace.agents.create")) { ... }

// Middleware wrapper
export const POST = withWorkspacePermission("workspace.agents.create", handler)
```

### Super Admin Auth

Separate auth context for platform super admins:

```typescript
// lib/api/super-admin-auth.ts
const context = await getSuperAdminContext()
if (!context) return unauthorized()
```

### MFA Support

TOTP-based MFA using Supabase Auth MFA APIs:

```typescript
// lib/mfa/index.ts
await enrollTOTP("Authenticator App")  // Start enrollment
await verifyChallenge(factorId, challengeId, code)  // Verify
const status = await getMFAStatus()  // Check AAL level
```

---

## 6. Multi-Tenancy Architecture

### Hierarchy

```
Platform (Super Admin)
    │
    ├── Partner (Agency) - "acme-corp"
    │   ├── Branding (logo, colors, domain)
    │   ├── PartnerIntegrations (VAPI/Retell/Algolia keys)
    │   ├── BillingCredits (agency credit pool)
    │   ├── PartnerMembers (agency team)
    │   │
    │   ├── Workspace "Sales Team"
    │   │   ├── Agents
    │   │   ├── Conversations (call logs)
    │   │   ├── Campaigns
    │   │   ├── WorkspaceSubscription
    │   │   └── WorkspaceMembers
    │   │
    │   └── Workspace "Support Team"
    │       └── ...
    │
    └── Partner (Agency) - "xyz-agency"
        └── ...
```

### Partner Resolution (White-Label)

Partners are resolved from hostname via `getPartnerFromHost()`:

```typescript
// lib/api/partner.ts
export async function getPartnerFromHost(): Promise<ResolvedPartner> {
  // 1. DEV_PARTNER_SLUG env var (development)
  // 2. Exact hostname match in partner_domains
  // 3. Extract subdomain and match by partner slug
  // 4. Fallback to platform partner
}
```

**URL Patterns:**
- Platform: `app.genius365.app`
- Partner subdomain: `acme.genius365.app`
- Custom domain: `voice.acme-corp.com`

### Integration Assignment Flow

API keys are managed at the org level and assigned to workspaces:

```
1. Partner admin creates PartnerIntegration (VAPI key)
   ↓
2. Integration marked as default: true
   ↓
3. New workspace created
   ↓
4. assignDefaultIntegrationsToWorkspace() runs
   ↓
5. WorkspaceIntegrationAssignment created
   ↓
6. Agent sync uses workspace's assigned key
```

### Workspace Setup

When a workspace is created, default integrations are auto-assigned:

```typescript
// lib/workspace/setup.ts
await assignDefaultIntegrationsToWorkspace(workspaceId, partnerId, userId)
```

---

## 7. Voice Provider Integrations

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT SYNC FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  Frontend   │───▶│ POST /agents │───▶│ safeVapiSync()   │   │
│  │  (Form)     │    │              │    │ safeRetellSync() │   │
│  └─────────────┘    └──────────────┘    └──────────────────┘   │
│                                                │                │
│                                                ▼                │
│                                        ┌──────────────────┐    │
│                                        │ mapToVapi()      │    │
│                                        │ mapToRetellLLM() │    │
│                                        │ mapToRetellAgent │    │
│                                        └──────────────────┘    │
│                                                │                │
│                                                ▼                │
│                                        ┌──────────────────┐    │
│                                        │ Provider API     │    │
│                                        │ (VAPI/Retell)    │    │
│                                        └──────────────────┘    │
│                                                │                │
│                                                ▼                │
│                                        ┌──────────────────┐    │
│                                        │ Update DB with   │    │
│                                        │ external_agent_id│    │
│                                        │ sync_status      │    │
│                                        └──────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### VAPI Integration

**Files:**
- `lib/integrations/vapi/agent/sync.ts` - Sync orchestration
- `lib/integrations/vapi/agent/mapper.ts` - Schema mapping
- `lib/integrations/vapi/agent/config.ts` - API calls
- `lib/integrations/vapi/calls.ts` - Outbound call creation

**Sync Flow:**
```typescript
// lib/integrations/vapi/agent/sync.ts
export async function safeVapiSync(agent: AIAgent, operation: "create" | "update" | "delete") {
  // 1. Get API key from workspace's assigned integration
  const keys = await getVapiApiKeyForAgent(agent)
  
  // 2. Sync function tools if any
  await syncVapiFunctionTools(tools, keys.secretKey)
  
  // 3. Map internal schema to VAPI format
  const payload = mapToVapi(agent)
  
  // 4. Call VAPI API
  const response = await createVapiAgentWithKey(payload, keys.secretKey)
  
  // 5. Update database with external_agent_id
  return processVapiResponse(response, agent.id)
}
```

**Mapper Features:**
- Voice: Maps to ElevenLabs provider (11labs)
- Model: OpenAI, Anthropic, Google, Groq
- Tools: Function tools via toolIds or inline tools
- Webhook URL: `{APP_URL}/api/webhooks/w/{workspaceId}/vapi`
- Recording & Analysis enabled by default

### Retell Integration

**Architecture:**
- Each agent has a dedicated LLM (1:1 relationship)
- Tools are configured on the LLM level
- Custom tools registered with MCP server

**Sync Flow:**
```typescript
// lib/integrations/retell/agent/sync.ts
export async function safeRetellSync(agent: AIAgent, operation: SyncOperation) {
  // CREATE:
  // 1. Register tools with MCP server
  await registerToolsWithMCP(agent, workspaceId, partnerId)
  
  // 2. Create LLM
  const llmPayload = mapToRetellLLM(agent)
  const llmResponse = await createRetellLLMWithKey(llmPayload, secretKey)
  
  // 3. Create Agent with LLM ID
  const agentPayload = mapToRetellAgent(agent, llmId)
  const agentResponse = await createRetellAgentWithKey(agentPayload, secretKey)
  
  // 4. Add MCP tools to LLM
  await addMCPToolsToLLM(agentId, llmId, agent, apiKey)
}
```

### Function Tools System

**Location:** `lib/integrations/function_tools/`

**Supported Tool Types:**
- `function` - Custom webhook-based function
- `endCall` - End the call
- `transferCall` - Transfer to another number
- `dtmf` - Send DTMF tones

**Tool Registration (VAPI):**
```typescript
// Tools synced via VAPI /tool API
// Returns external_tool_id stored in agent config
// Attached to agent via model.toolIds
```

**Tool Registration (Retell):**
```typescript
// Tools registered with MCP server
// MCP server URL configured in LLM's mcps array
// Retell calls MCP server during conversations
```

---

## 8. Webhook & Call System

### Webhook Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEBHOOK FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  VAPI                              Retell                       │
│  ┌─────────────────────────┐      ┌─────────────────────────┐  │
│  │ POST /api/webhooks/vapi │      │POST /api/webhooks/retell│  │
│  └───────────┬─────────────┘      └───────────┬─────────────┘  │
│              │                                │                 │
│              ▼                                ▼                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Event Processing                        │   │
│  │  • status-update → Create/update conversation           │   │
│  │  • end-of-call-report → Complete with transcript        │   │
│  │  • function-call → Forward to user webhook              │   │
│  └─────────────────────────────────────────────────────────┘   │
│              │                                                  │
│              ▼                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Post-Processing                         │   │
│  │  1. Process billing (deduct credits)                    │   │
│  │  2. Update agent stats                                  │   │
│  │  3. Index to Algolia                                    │   │
│  │  4. Forward to user's webhook URL                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### VAPI Webhook Events

| Event | Purpose |
|-------|---------|
| `status-update` | Call status changes (queued, ringing, in-progress, ended) |
| `end-of-call-report` | Complete summary with transcript, recording, analysis |
| `function-call` | Custom function tool execution |
| `tool-calls` | Tool execution requests |
| `transfer-update` | Call transfer events |

**Payload Structure (end-of-call-report):**
```typescript
{
  message: {
    type: "end-of-call-report",
    cost: number,              // At message level!
    costBreakdown: {...},
    call: {
      id: string,
      type: "webCall" | "inboundPhoneCall" | "outboundPhoneCall",
      startedAt: string,
      endedAt: string,
      customer: { number, name },
      // Note: cost is NOT in call, it's a sibling
    },
    artifact: {
      recording: string,
      transcript: string | VapiTranscriptMessage[],
      messages: VapiTranscriptMessage[],
    },
    analysis: {
      summary: string,
      sentiment: "positive" | "negative" | "neutral",
    },
  },
  // ROOT LEVEL - VAPI also sends data here!
  messages: VapiTranscriptMessage[],
  recordingUrl: string,
  summary: string,
}
```

### Algolia Call Logs

**File:** `lib/algolia/call-logs.ts`

**Features:**
- Workspace-level data isolation via `workspace_id` filter
- Searchable: transcript, summary, caller_name, phone_number, agent_name
- Filterable: status, direction, call_type, sentiment, provider
- Autocomplete suggestions

**Index Structure:**
```typescript
interface CallLogAlgoliaRecord {
  objectID: string
  workspace_id: string      // REQUIRED for data isolation
  conversation_id: string
  transcript: string | null
  summary: string | null
  phone_number: string
  caller_name: string
  agent_name: string
  status: string
  direction: string
  sentiment: string | null
  duration_seconds: number
  total_cost: number
  created_at_timestamp: number
  recording_url: string | null
}
```

---

## 9. Campaign System

### Architecture

The campaign system enables batch outbound calling:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CAMPAIGN FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CREATE CAMPAIGN                                             │
│     ├── Upload CSV with phone numbers                          │
│     ├── Select agent (outbound)                                │
│     ├── Configure business hours                               │
│     └── Set concurrency limits                                 │
│                                                                 │
│  2. START CAMPAIGN                                              │
│     └── POST /api/w/[slug]/campaigns/[id]/start               │
│                                                                 │
│  3. BATCH PROCESSING (lib/campaigns/batch-caller.ts)           │
│     ├── Fetch pending recipients in chunks (50 per chunk)     │
│     ├── Process concurrent calls (5 concurrent default)       │
│     ├── Bulk database updates                                  │
│     ├── Business hours check                                   │
│     └── Progress callbacks for real-time tracking             │
│                                                                 │
│  4. CALL EXECUTION                                              │
│     ├── createOutboundCall() via VAPI API                     │
│     ├── Update recipient status (calling, completed, failed)  │
│     └── Webhook receives call result                          │
│                                                                 │
│  5. REAL-TIME UPDATES                                          │
│     └── Supabase Realtime for campaign progress               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `lib/campaigns/batch-caller.ts` | Main batch processing engine |
| `lib/campaigns/queue-processor.ts` | Queue management |
| `lib/campaigns/call-queue-manager.ts` | Call queue state |
| `lib/campaigns/batch-processor.ts` | Chunk processing |

### Batch Caller Configuration

```typescript
interface BatchCallerConfig {
  campaignId: string
  workspaceId: string
  agentId: string
  externalAgentId: string
  phoneNumberId: string
  vapiSecretKey: string
  concurrencyLimit: number      // Max concurrent calls (default: 5)
  maxAttempts: number
  retryDelayMinutes: number
  businessHoursConfig?: BusinessHoursConfig
  timezone: string
  chunkSize?: number            // Recipients per chunk (default: 50)
  delayBetweenChunksMs?: number // Default: 2000
  delayBetweenCallsMs?: number  // Default: 500
  maxProcessingTimeMs?: number  // Default: 45000 (serverless safety)
  onProgress?: (progress: BatchProgress) => void
}
```

### Business Hours

```typescript
interface BusinessHoursConfig {
  enabled: boolean
  schedule: {
    monday: TimeSlot[]
    tuesday: TimeSlot[]
    // ...
  }
}

interface TimeSlot {
  start: string  // "09:00"
  end: string    // "17:00"
}
```

---

## 10. Billing System

### Two-Level Billing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    BILLING HIERARCHY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PARTNER LEVEL (Agency)                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ BillingCredits                                           │   │
│  │ • Agency credit pool                                     │   │
│  │ • Used by billing-exempt workspaces                      │   │
│  │ • Platform fee deductions                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  WORKSPACE LEVEL (End Customer)                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ WorkspaceSubscription                                    │   │
│  │ ├── Prepaid: Included minutes + overage credits         │   │
│  │ └── Postpaid: Track usage, invoice at period end        │   │
│  │                                                          │   │
│  │ WorkspaceCredits                                         │   │
│  │ • Workspace-specific credit balance                      │   │
│  │ • Topup via Stripe checkout                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Usage Processing Flow

```typescript
// lib/billing/usage.ts
export async function processCallCompletion(data: CallUsageData): Promise<UsageProcessResult> {
  // 1. Check idempotency (already processed?)
  // 2. Deduct using workspace-level billing
  //    - Postpaid: Track usage, add to pending invoice
  //    - Prepaid: Use included minutes, then credits for overage
  //    - No subscription: Workspace credits
  //    - Billing-exempt: Partner credits
  // 3. Update workspace monthly minutes
  // 4. Update conversation with cost
}
```

### Billing Types

| Type | Description |
|------|-------------|
| **Prepaid** | Included minutes per month, then overage at per-minute rate |
| **Postpaid** | Track all usage, invoice at period end |
| **Credits** | Pre-purchased balance, deducted per-minute |

### Workspace Paywall

When workspace credits are exhausted, mutations are blocked:

```typescript
// lib/billing/workspace-paywall.ts
export async function getWorkspacePaywallStatus(workspaceId: string): Promise<PaywallStatus>

// Usage in API routes
const paywallError = await checkWorkspacePaywall(ctx.workspace.id, workspaceSlug)
if (paywallError) return paywallError
```

### Stripe Integration

**Files:**
- `lib/stripe/checkout.ts` - Checkout session creation
- `lib/stripe/credits.ts` - Credit operations
- `lib/stripe/workspace-credits.ts` - Workspace billing
- `app/api/webhooks/stripe/` - Stripe webhooks

---

## 11. Frontend Architecture

### Component Hierarchy

```
app/
├── layout.tsx                    # Root layout (providers)
├── w/[workspaceSlug]/
│   ├── layout.tsx               # Workspace layout (sidebar, nav)
│   ├── page.tsx                 # Dashboard
│   ├── agents/page.tsx          # Agent list
│   ├── calls/page.tsx           # Call logs
│   └── campaigns/page.tsx       # Campaigns

components/
├── ui/                          # Radix UI primitives
│   ├── button.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   └── ...
├── workspace/
│   ├── agents/
│   │   ├── agent-card.tsx
│   │   ├── agent-wizard.tsx     # Multi-step agent creation
│   │   └── agent-detail.tsx
│   ├── calls/
│   │   ├── call-log-table.tsx
│   │   └── conversation-detail-modal.tsx
│   └── campaigns/
│       ├── campaign-wizard.tsx
│       └── campaign-progress.tsx
```

### Hook Categories

**47 custom hooks** organized by domain:

| Category | Examples |
|----------|----------|
| **Auth** | `use-auth`, `use-partner-auth` |
| **Workspace** | `use-workspace-agents`, `use-workspace-calls`, `use-workspace-credits` |
| **Partner** | `use-partner-workspaces`, `use-partner-team`, `use-partner-integrations` |
| **Campaigns** | `use-campaigns`, `use-campaign-progress`, `use-realtime-campaign` |
| **Billing** | `use-billing`, `use-workspace-subscription`, `use-subscription-plans` |
| **Voice** | `use-web-call/vapi`, `use-web-call/retell`, `use-retell-voices` |
| **Search** | `use-algolia-search`, `use-workspace-calls` |
| **Real-time** | `use-realtime-campaign`, `use-realtime-call-status` |

### React Query Patterns

```typescript
// Data fetching with React Query
const { data, isLoading, error } = useQuery({
  queryKey: ["workspace", workspaceSlug, "agents"],
  queryFn: () => fetchAgents(workspaceSlug),
})

// Mutations with optimistic updates
const mutation = useMutation({
  mutationFn: createAgent,
  onMutate: async (newAgent) => {
    // Optimistic update
  },
  onSuccess: () => {
    queryClient.invalidateQueries(["workspace", workspaceSlug, "agents"])
  },
})
```

### Zustand Stores

```typescript
// lib/stores/campaign-wizard-store.ts
const useCampaignWizardStore = create<CampaignWizardState>((set) => ({
  currentStep: 0,
  campaignData: {},
  setStep: (step) => set({ currentStep: step }),
  updateData: (data) => set((state) => ({ 
    campaignData: { ...state.campaignData, ...data } 
  })),
}))
```

---

## 12. MCP Server

### Overview

The MCP (Model Context Protocol) Server is a standalone Express.js service that handles custom tool execution for Retell AI agents.

**Location:** `genius365-mcp-server/`

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP SERVER                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Next.js App                           Retell                   │
│  ┌─────────────┐                      ┌─────────────┐          │
│  │ Register    │──────────────────────▶│ LLM config  │         │
│  │ Tools       │  POST /api/tools     │ mcps: [...]  │         │
│  └─────────────┘                      └──────┬──────┘          │
│                                              │                  │
│                                              │ During call      │
│                                              ▼                  │
│                                       ┌─────────────┐          │
│                                       │ POST /mcp   │          │
│                                       │ (MCP Server)│          │
│                                       └──────┬──────┘          │
│                                              │                  │
│                                              ▼                  │
│                                       ┌─────────────┐          │
│                                       │Tool Registry│          │
│                                       │(per agent)  │          │
│                                       └──────┬──────┘          │
│                                              │                  │
│                                              ▼                  │
│                                       ┌─────────────┐          │
│                                       │Tool Executor│          │
│                                       │(HTTP call)  │          │
│                                       └─────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Endpoints

| Route | Purpose |
|-------|---------|
| `GET /` | Health check |
| `POST /mcp` | MCP protocol endpoint (Retell calls this) |
| `POST /api/tools` | Register tools for an agent |
| `DELETE /api/tools/:agentId` | Remove agent's tools |
| `GET /api/tools/:agentId` | List agent's tools |

### Tool Registration

```typescript
// From Next.js app
await mcpClient.registerTools(agentId, workspaceId, partnerId, [
  {
    name: "check_inventory",
    description: "Check product inventory",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "Product ID" }
      },
      required: ["product_id"]
    },
    webhook_url: "https://api.example.com/inventory"
  }
])
```

---

## 13. API Reference

### Key Endpoints

#### Authentication
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/signup` | User registration |
| POST | `/api/auth/logout` | User logout |

#### Workspace Agents
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/w/[slug]/agents` | List agents |
| POST | `/api/w/[slug]/agents` | Create agent |
| GET | `/api/w/[slug]/agents/[id]` | Get agent |
| PATCH | `/api/w/[slug]/agents/[id]` | Update agent |
| DELETE | `/api/w/[slug]/agents/[id]` | Delete agent |
| POST | `/api/w/[slug]/agents/[id]/sync` | Sync to provider |

#### Conversations (Calls)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/w/[slug]/calls` | List calls |
| POST | `/api/w/[slug]/calls/ingest` | Ingest call data |
| GET | `/api/w/[slug]/calls/stats` | Call statistics |
| POST | `/api/w/[slug]/calls/search` | Algolia search |

#### Campaigns
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/w/[slug]/campaigns` | List campaigns |
| POST | `/api/w/[slug]/campaigns` | Create campaign |
| POST | `/api/w/[slug]/campaigns/[id]/start` | Start campaign |
| POST | `/api/w/[slug]/campaigns/[id]/pause` | Pause campaign |

#### Partner (Organization)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/partner` | Get partner details |
| PATCH | `/api/partner` | Update partner |
| GET | `/api/partner/workspaces` | List workspaces |
| POST | `/api/partner/workspaces` | Create workspace |
| GET | `/api/partner/integrations` | List integrations |
| POST | `/api/partner/integrations` | Create integration |

#### Webhooks
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/webhooks/vapi` | VAPI call events |
| POST | `/api/webhooks/w/[workspaceId]/vapi` | Workspace VAPI webhook |
| POST | `/api/webhooks/retell` | Retell call events |
| POST | `/api/webhooks/stripe` | Stripe events |

---

## 14. Development Guide

### Prerequisites

- Node.js 20+
- PostgreSQL (via Supabase)
- VAPI and/or Retell account
- Stripe account (optional)

### Environment Setup

```bash
# Clone repository
git clone https://github.com/your-org/genius365.git
cd genius365

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Required variables:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                    # Prisma (optional)
```

### Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Open Prisma Studio
npm run db:studio
```

### Running Locally

```bash
# Development server
npm run dev

# MCP server (separate terminal)
cd genius365-mcp-server
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- lib/__tests__/billing
```

### Code Quality

```bash
# Lint
npm run lint

# Format
npm run format

# Type check
npm run type-check
```

---

## 15. Key Patterns & Conventions

### API Response Format

```typescript
// Success
return apiResponse(data, 200)

// Error
return apiError("Error message", 400)

// Unauthorized
return unauthorized()

// Forbidden
return forbidden("Permission denied")
```

### Error Handling

```typescript
try {
  // Operation
} catch (error) {
  console.error("[ModuleName] Operation failed:", error)
  return {
    success: false,
    error: error instanceof Error ? error.message : "Unknown error"
  }
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `use-workspace-agents.ts` |
| Components | PascalCase | `AgentCard.tsx` |
| Hooks | camelCase with `use` prefix | `useWorkspaceAgents` |
| API routes | kebab-case | `[workspaceSlug]/agents` |
| Database tables | snake_case | `ai_agents` |
| TypeScript types | PascalCase | `AIAgent`, `PartnerAuthContext` |

### Prisma vs Supabase Client

```typescript
// Prefer Prisma for type-safe queries
if (prisma) {
  const agent = await prisma.aiAgent.findUnique({ where: { id } })
}

// Fallback to Supabase admin client
const { data, error } = await adminClient
  .from("ai_agents")
  .select("*")
  .eq("id", id)
  .single()
```

---

## Appendix A: Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `DATABASE_URL` | No | Prisma connection string |
| `DIRECT_URL` | No | Prisma direct connection |
| `NEXT_PUBLIC_APP_URL` | No | App URL (defaults to localhost:3000) |
| `STRIPE_SECRET_KEY` | No | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook secret |
| `VAPI_WEBHOOK_SECRET` | No | VAPI signature verification |
| `MCP_SERVER_URL` | No | MCP server URL |
| `MCP_API_KEY` | No | MCP server API key |
| `DEV_PARTNER_SLUG` | No | Development partner override |

---

## Appendix B: Database Migrations

Migrations are managed via Prisma:

```bash
# Create migration
npm run db:migrate

# Apply migrations (production)
npm run db:migrate:deploy

# Reset database
npm run db:reset
```

**Note:** For Supabase, use raw SQL for schema changes to avoid auth FK conflicts.

---

*Last updated: January 2026*
*Version: 1.0.0*
