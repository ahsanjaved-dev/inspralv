# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Genius365 is a Next.js 16 white-label AI Voice Agent Management Platform with multi-tenancy. It enables agencies (Partners) to manage AI voice agents across multiple providers (VAPI, Retell, Synthflow) with full workspace isolation.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Auth), Prisma ORM (PostgreSQL), React Query, Tailwind CSS 4, Radix UI

## Development Commands

```bash
# Development
pnpm dev              # Start dev server (port 3000)
pnpm build            # Build for production (runs prisma generate first)
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm format           # Format with Prettier
pnpm type-check       # TypeScript type checking

# Database (Prisma)
pnpm db:generate      # Generate Prisma Client (run after schema changes)
pnpm db:push          # Push schema to database (dev only, no migrations)
pnpm db:pull          # Pull schema from database (introspection)
pnpm db:migrate       # Create migration
pnpm db:migrate:deploy # Deploy migrations (production)
pnpm db:studio        # Open Prisma Studio GUI
pnpm db:reset         # Reset database (DESTRUCTIVE - dev only)
```

## Multi-Tenancy Architecture

**Critical:** This is a 3-tier hierarchical multi-tenant system. Understanding this hierarchy is essential for working with the codebase.

```
SUPER ADMIN (Platform operators)
    ↓
PARTNER (Agency/Organization) - White-label branding, billing, domains
    ↓
WORKSPACE (Client project) - Isolated resources, agents, conversations
    ↓
USER (Individual access) - Roles in both Partner and Workspace
```

### Key Concepts

1. **Partner Resolution (White-Label)**
   - Partners are resolved from the request hostname via `partner_domains` table
   - `getPartnerFromHost()` in [lib/api/partner.ts](lib/api/partner.ts) handles resolution
   - Falls back to platform partner (`is_platform_partner = true`) for unknown hosts
   - Example: `app.acme.com` → ACME Agency partner

2. **Authentication Context Flow**
   ```
   Request → Middleware (proxy.ts) → Session Validation
       ↓
   Server Component/API Route
       ↓
   getPartnerAuthContext() → Returns: { user, partner, partnerRole, workspaces, supabase, adminClient }
       ↓
   getWorkspaceContext(slug) → Returns: { ...PartnerAuthContext, workspace }
   ```

3. **Database Access Pattern**
   - **Supabase Client**: Used for auth, RLS-dependent queries, realtime, storage
   - **Prisma Client**: Used for complex queries, transactions, type-safe CRUD
   - Both connect to the same PostgreSQL database
   - Schema source of truth: [prisma/schema.prisma](prisma/schema.prisma)

## Database Configuration

Two connection strings are required for Prisma:

```bash
# DATABASE_URL: Pooled connection (Transaction mode, port 6543)
# Use for all runtime queries
DATABASE_URL="postgresql://postgres.[REF]:[PWD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10"

# DIRECT_URL: Direct connection (Session mode, port 5432)
# Use for migrations only
DIRECT_URL="postgresql://postgres.[REF]:[PWD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
```

Get these from: Supabase Dashboard → Project Settings → Database → Connection string

## Authentication Patterns

### Server Components
```typescript
import { getPartnerAuthCached } from "@/lib/api/get-auth-cached"

const auth = await getPartnerAuthCached()
if (!auth) redirect("/login")
// Access: auth.user, auth.partner, auth.partnerRole, auth.workspaces
```

### API Routes (Workspace-Scoped)
```typescript
import { getWorkspaceContext } from "@/lib/api/workspace-auth"

const ctx = await getWorkspaceContext(workspaceSlug)
if (!ctx) return unauthorized()

// Use ctx.adminClient (bypasses RLS) for database queries
const agents = await ctx.adminClient
  .from("ai_agents")
  .select("*")
  .eq("workspace_id", ctx.workspace.id)
```

### Client Components
```typescript
"use client"
import { useWorkspaceAgents } from "@/lib/hooks/use-workspace-agents"

const { data, isLoading } = useWorkspaceAgents()
```

## Voice Agent Provider Integration

### Sync System Architecture

Voice agents sync bidirectionally with external providers (VAPI, Retell, Synthflow):

1. **Sync Orchestration**: [lib/integrations/{provider}/agent/sync.ts](lib/integrations)
   - `shouldSyncToProvider()` - Determines if sync is needed
   - `safeSyncAgent()` - Safe wrapper with error handling
   - Updates `needs_resync`, `sync_status`, `last_synced_at` fields

2. **Data Mapping**: [lib/integrations/{provider}/agent/mapper.ts](lib/integrations)
   - `mapToProvider()` - Internal agent → Provider format
   - `mapFromProvider()` - Provider format → Internal agent

3. **API Calls**: [lib/integrations/{provider}/agent/config.ts](lib/integrations)
   - `createProviderAgent()`, `updateProviderAgent()`, `deleteProviderAgent()`
   - Circuit breaker pattern in [lib/integrations/circuit-breaker.ts](lib/integrations/circuit-breaker.ts)
   - Retry logic in [lib/integrations/retry.ts](lib/integrations/retry.ts)

4. **Special Case - Retell**
   - Requires creating LLM first, then Agent
   - Stores `retell_llm_id` in `agent.config`
   - Delete flow: delete Agent, then delete LLM

### Agent Sync Fields

```typescript
// ai_agents table
{
  needs_resync: boolean       // Set when local changes require provider sync
  sync_status: string         // "not_synced" | "pending" | "synced" | "error"
  last_synced_at: DateTime?   // Last successful sync timestamp
  last_sync_error: string?    // Error message from failed sync
  external_agent_id: string?  // Provider's agent ID (e.g., VAPI agent ID)
}
```

## Critical File Locations

### Auth & Context
- [lib/api/auth.ts](lib/api/auth.ts) - `getPartnerAuthContext()` (main auth)
- [lib/api/workspace-auth.ts](lib/api/workspace-auth.ts) - `getWorkspaceContext()`
- [lib/api/partner.ts](lib/api/partner.ts) - `getPartnerFromHost()`
- [proxy.ts](proxy.ts) - Middleware: session refresh, route protection, CSP

### Database
- [prisma/schema.prisma](prisma/schema.prisma) - **Source of truth** for schema
- [lib/prisma/client.ts](lib/prisma/client.ts) - Prisma singleton
- [lib/supabase/client.ts](lib/supabase/client.ts) - Browser Supabase client
- [lib/supabase/server.ts](lib/supabase/server.ts) - Server Supabase client
- [lib/supabase/admin.ts](lib/supabase/admin.ts) - Admin client (bypasses RLS)

### State Management
- [lib/hooks/](lib/hooks/) - React Query hooks for all entities
- [lib/providers/query-provider.tsx](lib/providers/query-provider.tsx) - React Query setup

### API Utilities
- [lib/api/helpers.ts](lib/api/helpers.ts) - `apiResponse()`, `apiError()`, `unauthorized()`, etc.
- [lib/api/pagination.ts](lib/api/pagination.ts) - Pagination helpers
- [lib/audit.ts](lib/audit.ts) - Audit logging

## Route Structure

```
/app/
├── (auth)/              # Login, signup, password reset
├── (marketing)/         # Public pages (pricing, partner request)
├── org/                 # Partner-level management (settings, team, billing)
├── w/[workspaceSlug]/   # Workspace-scoped pages (agents, calls, etc.)
├── super-admin/         # Platform admin console
└── api/
    ├── auth/            # Auth endpoints
    ├── partner/         # Partner-level APIs
    ├── w/[workspaceSlug]/ # Workspace-scoped APIs
    ├── super-admin/     # Admin APIs
    └── webhooks/        # External webhooks (Stripe, etc.)
```

## Important Patterns

### Route Params in Next.js 15+
Always await params in route handlers and pages:
```typescript
export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const { slug } = await params  // Must await!
}
```

### Prisma Transactions
```typescript
import { withTransaction } from "@/lib/prisma"

const result = await withTransaction(async (tx) => {
  const user = await tx.user.create({ data: { ... } })
  const membership = await tx.workspaceMember.create({ data: { ... } })
  return [user, membership]
})
```

### Optimistic Updates
Delete operations use optimistic updates - see [lib/hooks/use-workspace-agents.ts](lib/hooks/use-workspace-agents.ts) for reference pattern.

### Dynamic Imports for Heavy Components
Large modals/wizards are dynamically imported:
```typescript
const AgentWizardDynamic = dynamic(() => import("./agent-wizard-dynamic"), {
  loading: () => <LoadingSpinner />,
})
```

## Environment Variables

Required:
```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=              # Pooled (port 6543)
DIRECT_URL=                # Direct (port 5432)
```

Optional but common:
```bash
STRIPE_SECRET_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_APP_URL=
```

## Security Notes

- Middleware ([proxy.ts](proxy.ts)) enforces CSP permissive for VAPI/Retell/Daily.co voice SDKs
- API routes use `ctx.adminClient` (Supabase) to bypass RLS - ensure workspace_id filtering
- Never commit `.env*` files
- Audit logs track all entity changes - use `createAuditLog()` from [lib/audit.ts](lib/audit.ts)

## Testing Voice Agents

1. Create agent in workspace → Syncs to provider
2. Use test call button → [components/agents/test-call-button.tsx](components/agents/test-call-button.tsx)
3. Browser-based calling via VAPI Web SDK or Retell Client SDK
4. Conversation records saved to `conversations` table with transcript

## Common Tasks

### Add Workspace Page
1. Create `app/w/[workspaceSlug]/feature/page.tsx`
2. Add nav link in [components/workspace/workspace-sidebar.tsx](components/workspace/workspace-sidebar.tsx)
3. Create API route `app/api/w/[workspaceSlug]/feature/route.ts`
4. Create hook `lib/hooks/use-workspace-feature.ts`

### Add Partner-Level Feature
1. Create `app/org/feature/page.tsx`
2. Create API route `app/api/partner/feature/route.ts`
3. Use `getPartnerAuthContext()` for auth
4. Check role with `ctx.partnerRole === 'owner'`

### Sync Agent to Provider
```typescript
import { safeVapiSync } from "@/lib/integrations/vapi/agent/sync"

const result = await safeVapiSync(agent, "create")
if (!result.success) {
  // Handle error - sync_status set to "error"
  console.error(result.error)
}
```

## Reference Documentation

For comprehensive details, see [CODEBASE_REFERENCE.md](CODEBASE_REFERENCE.md) which includes:
- Complete directory structure
- Database schema details
- API route inventory
- Component catalog
- Integration architecture diagrams
- Email templates
- Caching strategy

This file (CLAUDE.md) focuses on the essential information needed to be productive quickly.
