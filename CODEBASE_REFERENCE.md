# Inspralv Codebase Reference

> **Last Updated**: December 2024  
> **Purpose**: Complete codebase analysis for AI assistants and developers

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [High-Level Architecture](#high-level-architecture)
3. [Multi-Tenancy Model](#multi-tenancy-model)
4. [Directory Structure](#directory-structure)
5. [Database Schema](#database-schema)
6. [Authentication System](#authentication-system)
7. [API Layer](#api-layer)
8. [Frontend Architecture](#frontend-architecture)
9. [Voice Agent Integrations](#voice-agent-integrations)
10. [Key Files Reference](#key-files-reference)
11. [Development Patterns](#development-patterns)
12. [State Management](#state-management)
13. [Security Architecture](#security-architecture)
14. [Email System](#email-system)
15. [Caching Strategy](#caching-strategy)
16. [Environment Configuration](#environment-configuration)

---

## Executive Summary

**Inspralv** is a Next.js 16 white-label AI Voice Agent Management Platform. It enables agencies (Partners) to manage AI voice agents across multiple providers (VAPI, Retell, Synthflow) with full multi-tenancy support, white-labeling, and workspace isolation.

### Core Technologies

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript 5 |
| **UI** | React 19, Tailwind CSS 4, Radix UI (shadcn/ui) |
| **Backend** | Supabase (PostgreSQL + Auth + Storage) |
| **State** | React Query (TanStack Query 5), Zustand |
| **Payments** | Stripe |
| **Email** | Resend |
| **Voice Providers** | VAPI, Retell AI, Synthflow |

### Key Capabilities

- **White-Label Platform**: Partners get custom branding, domains, and isolated workspaces
- **Multi-Tenant Architecture**: Partner → Workspace → User hierarchy
- **AI Voice Agent Management**: Create, sync, and manage agents across VAPI, Retell, Synthflow
- **Role-Based Access Control**: Comprehensive RBAC for partners and workspaces
- **Super Admin Console**: Platform-wide management for partner requests and billing

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           SUPER ADMIN                               │
│     Platform administrators managing all partners & billing         │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       PARTNER (Agency Layer)                        │
│  - White-label branding        - Custom domains                     │
│  - Subscription management     - Partner members                    │
│  - Resource limits             - Plan tier                          │
└─────────────────────────────────────────────────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│     WORKSPACE 1     │ │     WORKSPACE 2     │ │     WORKSPACE 3     │
│   (Client Project)  │ │   (Client Project)  │ │   (Client Project)  │
├─────────────────────┤ ├─────────────────────┤ ├─────────────────────┤
│ • AI Agents         │ │ • AI Agents         │ │ • AI Agents         │
│ • Conversations     │ │ • Conversations     │ │ • Conversations     │
│ • Leads             │ │ • Leads             │ │ • Leads             │
│ • Members           │ │ • Members           │ │ • Members           │
│ • Integrations      │ │ • Integrations      │ │ • Integrations      │
│ • Knowledge Base    │ │ • Knowledge Base    │ │ • Knowledge Base    │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

### Request Flow

```
Client Request → Middleware (proxy.ts)
                      │
                      ├─► Hostname Resolution → Partner Context
                      │
                      ├─► Session Validation (Supabase)
                      │
                      └─► Route Handler
                              │
                              ├─► API Route: withWorkspace() HOF
                              │
                              └─► Page: getPartnerAuthContext()
```

---

## Multi-Tenancy Model

### Three-Tier Hierarchy

```typescript
// 1. PARTNER (Top Level - Agency/Organization)
interface Partner {
  id: string
  name: string
  slug: string                    // e.g., "acme-agency"
  branding: PartnerBranding       // Logo, colors, company name
  plan_tier: string               // "starter" | "professional" | "enterprise"
  features: PartnerFeatures       // Feature flags
  resource_limits: ResourceLimits // Max workspaces, users, agents
  is_platform_partner: boolean    // True for the main platform
}

// 2. WORKSPACE (Middle Level - Client Project)
interface Workspace {
  id: string
  partner_id: string              // Belongs to a partner
  name: string
  slug: string                    // e.g., "client-alpha"
  resource_limits: ResourceLimits // Inherited/overridden from partner
  current_month_minutes: number   // Usage tracking
  status: string
}

// 3. USER (Bottom Level - Individual Access)
interface User {
  id: string
  email: string
  // Access via memberships:
  // - PartnerMember (role in partner)
  // - WorkspaceMember (role in workspace)
}
```

### Role Hierarchy

**Partner Roles** (organization-level):
| Role | Description |
|------|-------------|
| `owner` | Full partner control, billing, delete |
| `admin` | Manage workspaces, members, settings |
| `member` | View access, limited management |

**Workspace Roles** (project-level):
| Role | Description |
|------|-------------|
| `owner` | Full workspace control |
| `admin` | Manage agents, members, settings |
| `member` | Create/edit agents, leads |
| `viewer` | Read-only access |

### Partner Resolution (White-Label)

```typescript
// lib/api/partner.ts - getPartnerFromHost()

// Resolution order:
// 1. Exact hostname match in partner_domains table
// 2. Fallback to platform partner (is_platform_partner = true)

// Examples:
// app.acme.com → ACME Agency partner
// localhost:3000 → Platform partner (fallback)
// app.clientxyz.com → ClientXYZ partner
```

---

## Directory Structure

```
inspralv/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth pages (login, signup, etc.)
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── reset-password/page.tsx
│   │   └── layout.tsx
│   ├── (marketing)/              # Public pages
│   │   ├── pricing/page.tsx
│   │   └── request-partner/page.tsx
│   ├── w/[workspaceSlug]/        # Workspace-scoped pages
│   │   ├── layout.tsx            # Workspace layout with auth
│   │   ├── dashboard/page.tsx
│   │   ├── agents/
│   │   │   ├── page.tsx          # Agent list
│   │   │   ├── new/page.tsx      # Create agent
│   │   │   └── [id]/page.tsx     # Agent detail
│   │   ├── leads/page.tsx
│   │   ├── calls/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── members/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── billing/page.tsx
│   │   ├── integrations/page.tsx
│   │   ├── knowledge-base/page.tsx
│   │   └── telephony/page.tsx
│   ├── super-admin/              # Platform admin console
│   │   ├── login/page.tsx
│   │   └── (dashboard)/
│   │       ├── layout.tsx
│   │       ├── page.tsx          # Dashboard
│   │       ├── partners/
│   │       ├── partner-requests/
│   │       └── billing/
│   ├── api/                      # API routes
│   │   ├── w/[workspaceSlug]/    # Workspace-scoped APIs
│   │   │   ├── agents/route.ts
│   │   │   ├── members/route.ts
│   │   │   ├── invitations/route.ts
│   │   │   ├── conversations/route.ts
│   │   │   └── dashboard/stats/route.ts
│   │   ├── auth/                 # Auth APIs
│   │   ├── super-admin/          # Super admin APIs
│   │   ├── partner-requests/     # Partner request APIs
│   │   └── workspaces/route.ts
│   ├── select-workspace/page.tsx # Workspace selector
│   ├── workspace-onboarding/page.tsx
│   ├── accept-workspace-invitation/page.tsx
│   ├── layout.tsx                # Root layout
│   └── globals.css
│
├── components/                   # React components
│   ├── ui/                       # shadcn/ui primitives
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── table.tsx
│   │   └── ...
│   ├── workspace/                # Workspace components
│   │   ├── workspace-dashboard-layout.tsx
│   │   ├── workspace-sidebar.tsx
│   │   ├── workspace-header.tsx
│   │   ├── workspace-selector.tsx
│   │   └── agents/
│   │       └── workspace-agent-card.tsx
│   ├── agents/                   # Agent components
│   │   ├── agent-card.tsx
│   │   ├── delete-agent-dialog.tsx
│   │   ├── test-call-button.tsx
│   │   └── test-call-modal.tsx
│   ├── super-admin/              # Super admin components
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   └── super-admin-layout-client.tsx
│   └── auth/
│       └── auth-layout-client.tsx
│
├── lib/                          # Core libraries
│   ├── api/                      # API utilities
│   │   ├── auth.ts               # getPartnerAuthContext()
│   │   ├── workspace-auth.ts     # withWorkspace(), getWorkspaceContext()
│   │   ├── partner.ts            # getPartnerFromHost()
│   │   ├── super-admin-auth.ts   # getSuperAdminContext()
│   │   ├── helpers.ts            # apiResponse(), unauthorized(), etc.
│   │   └── get-auth-cached.ts    # Cached auth context
│   ├── supabase/                 # Supabase clients
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client
│   │   ├── admin.ts              # Admin client (bypasses RLS)
│   │   └── middleware.ts         # Session middleware
│   ├── integrations/             # Voice provider integrations
│   │   ├── vapi/
│   │   │   ├── agent/
│   │   │   │   ├── config.ts     # API calls
│   │   │   │   ├── mapper.ts     # Data mapping
│   │   │   │   ├── sync.ts       # Sync orchestration
│   │   │   │   └── response.ts   # Response processing
│   │   │   └── web-call.ts       # Browser calling
│   │   ├── retell/
│   │   │   ├── agent/...
│   │   │   └── web-call.ts
│   │   ├── circuit-breaker.ts
│   │   ├── retry.ts
│   │   └── webhook.ts
│   ├── hooks/                    # React Query hooks
│   │   ├── use-workspace-agents.ts
│   │   ├── use-workspace-members.ts
│   │   ├── use-workspace-conversations.ts
│   │   ├── use-partner-dashboard-stats.ts
│   │   ├── use-super-admin-partners.ts
│   │   ├── use-partner-requests.ts
│   │   └── use-auth.ts
│   ├── rbac/                     # Role-Based Access Control
│   │   ├── permissions.ts        # Permission matrix
│   │   └── middleware.ts
│   ├── cache/                    # Caching layer
│   │   └── index.ts
│   ├── email/                    # Email service
│   │   ├── send.ts
│   │   └── templates/
│   ├── audit.ts                  # Audit logging
│   ├── env.ts                    # Environment validation
│   ├── utils.ts                  # cn() utility
│   └── logger.ts
│
├── context/                      # React contexts
│   ├── branding-context.tsx      # Partner branding
│   └── theme-context.tsx         # Dark/light theme
│
├── config/                       # Configuration
│   ├── plans.ts                  # Plan tiers & features
│   └── site.ts                   # Site metadata
│
├── types/                        # TypeScript types
│   ├── database.types.ts         # Supabase + Zod schemas
│   └── api.types.ts              # API-specific types
│
├── proxy.ts                      # Next.js middleware
├── CLAUDE.md                     # AI assistant guide
└── package.json
```

---

## Database Schema

### Core Tables (Inferred from Types)

```sql
-- PARTNER (Agency/Organization)
CREATE TABLE partners (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  branding JSONB DEFAULT '{}',        -- {logo_url, primary_color, company_name...}
  plan_tier VARCHAR(50) DEFAULT 'starter',
  features JSONB DEFAULT '{}',        -- {white_label, custom_domain, api_access...}
  resource_limits JSONB DEFAULT '{}', -- {max_workspaces, max_agents...}
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  subscription_status VARCHAR(50),
  settings JSONB DEFAULT '{}',
  is_platform_partner BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PARTNER DOMAINS (White-Label Hostname Mapping)
CREATE TABLE partner_domains (
  id UUID PRIMARY KEY,
  partner_id UUID REFERENCES partners(id),
  hostname VARCHAR(255) UNIQUE NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verification_token VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PARTNER MEMBERS (Users belonging to a Partner)
CREATE TABLE partner_members (
  id UUID PRIMARY KEY,
  partner_id UUID REFERENCES partners(id),
  user_id UUID REFERENCES auth.users(id),
  role VARCHAR(50) NOT NULL,          -- 'owner' | 'admin' | 'member'
  invited_by UUID,
  joined_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WORKSPACES (Projects within a Partner)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  partner_id UUID REFERENCES partners(id),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  resource_limits JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  current_month_minutes INTEGER DEFAULT 0,
  current_month_cost DECIMAL(10,2) DEFAULT 0,
  last_usage_reset_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'active',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(partner_id, slug)
);

-- WORKSPACE MEMBERS
CREATE TABLE workspace_members (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),
  user_id UUID REFERENCES auth.users(id),
  role VARCHAR(50) NOT NULL,          -- 'owner' | 'admin' | 'member' | 'viewer'
  invited_by UUID,
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WORKSPACE INVITATIONS
CREATE TABLE workspace_invitations (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  message TEXT,
  invited_by UUID,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending' | 'accepted' | 'expired' | 'cancelled'
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI AGENTS
CREATE TABLE ai_agents (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  provider VARCHAR(50) NOT NULL,      -- 'vapi' | 'retell' | 'synthflow'
  voice_provider VARCHAR(50),         -- 'elevenlabs' | 'deepgram' | 'azure'...
  model_provider VARCHAR(50),         -- 'openai' | 'anthropic' | 'google'...
  transcriber_provider VARCHAR(50),
  config JSONB DEFAULT '{}',          -- Agent configuration
  agent_secret_api_key JSONB DEFAULT '[]',
  agent_public_api_key JSONB DEFAULT '[]',
  external_agent_id VARCHAR(255),     -- ID from provider (VAPI/Retell)
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSATIONS (Call Records)
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),
  agent_id UUID REFERENCES ai_agents(id),
  external_call_id VARCHAR(255),
  direction VARCHAR(50),              -- 'inbound' | 'outbound'
  status VARCHAR(50),                 -- 'queued' | 'in_progress' | 'completed'...
  phone_number VARCHAR(50),
  caller_name VARCHAR(255),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  recording_url TEXT,
  transcript TEXT,
  summary TEXT,
  sentiment VARCHAR(50),
  quality_score DECIMAL(3,2),
  total_cost DECIMAL(10,4),
  cost_breakdown JSONB,
  requires_follow_up BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PARTNER REQUESTS (White-Label Onboarding)
CREATE TABLE partner_requests (
  id UUID PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'provisioning'
  company_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  desired_subdomain VARCHAR(100),
  custom_domain VARCHAR(255),
  business_description TEXT,
  expected_users INTEGER,
  use_case TEXT,
  branding_data JSONB DEFAULT '{}',
  selected_plan VARCHAR(50),
  billing_info JSONB,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  rejection_reason TEXT,
  provisioned_partner_id UUID REFERENCES partners(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SUPER ADMIN
CREATE TABLE super_admin (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AUDIT LOG
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  partner_id UUID,
  workspace_id UUID,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Authentication System

### Authentication Flow

```
1. USER SIGN IN
   ├─► Supabase Auth (signInWithPassword)
   │
   ├─► Session Cookie Set
   │
   └─► Redirect to /select-workspace

2. PROTECTED ROUTE ACCESS
   ├─► Middleware (proxy.ts)
   │     ├─► updateSession() - Refresh Supabase session
   │     ├─► Check if protected path
   │     └─► Redirect to /login if no session
   │
   ├─► Layout/Page
   │     ├─► getPartnerAuthContext()
   │     │     ├─► Get auth user from Supabase
   │     │     ├─► Resolve partner from hostname
   │     │     ├─► Get partner membership
   │     │     └─► Get accessible workspaces
   │     │
   │     └─► Return PartnerAuthContext
   │
   └─► Render with auth data

3. WORKSPACE ACCESS
   ├─► getWorkspaceContext(workspaceSlug)
   │     ├─► Get PartnerAuthContext
   │     ├─► Find workspace by slug
   │     ├─► Verify user is member
   │     └─► Check required roles
   │
   └─► Return WorkspaceContext
```

### Auth Context Types

```typescript
// lib/api/auth.ts
interface PartnerAuthContext {
  user: PartnerAuthUser          // Authenticated user
  partner: ResolvedPartner       // Current partner (from hostname)
  partnerRole: PartnerMemberRole | null  // User's role in partner
  partnerMembership: PartnerMembership | null
  workspaces: AccessibleWorkspace[]      // User's workspaces in this partner
  supabase: SupabaseClient
  adminClient: SupabaseClient    // Bypasses RLS
}

// lib/api/workspace-auth.ts
interface WorkspaceContext extends PartnerAuthContext {
  workspace: AccessibleWorkspace // Current workspace with user's role
}
```

### Supabase Clients

```typescript
// 1. Browser Client (components/hooks)
import { createClient } from "@/lib/supabase/client"
const supabase = createClient()

// 2. Server Client (server components, API routes)
import { createClient } from "@/lib/supabase/server"
const supabase = await createClient()

// 3. Admin Client (bypasses RLS - use carefully!)
import { createAdminClient } from "@/lib/supabase/admin"
const adminClient = createAdminClient()
```

---

## API Layer

### API Route Patterns

#### Workspace-Scoped Routes

```typescript
// app/api/w/[workspaceSlug]/agents/route.ts

import { withWorkspace } from "@/lib/api/workspace-auth"
import { apiResponse, apiError, serverError } from "@/lib/api/helpers"

export const GET = withWorkspace(async (request, context, routeContext) => {
  const { workspace, user, adminClient } = context
  
  // workspace.id, workspace.role available
  const { data, error } = await adminClient
    .from("ai_agents")
    .select("*")
    .eq("workspace_id", workspace.id)
  
  return apiResponse({ data })
})

export const POST = withWorkspace(async (request, context) => {
  const body = await request.json()
  // Create agent...
  return apiResponse(newAgent, 201)
}, { requiredRoles: ["owner", "admin", "member"] })
```

#### API Response Helpers

```typescript
// lib/api/helpers.ts

apiResponse(data, status = 200)   // Success response
apiError(message, status = 400)   // Client error
serverError(message)              // 500 error
unauthorized()                    // 401
forbidden(message)                // 403
notFound(resource)                // 404
```

### API Routes Overview

```
/api/
├── auth/
│   ├── context/route.ts      # Get auth context (client-side)
│   ├── signup/route.ts       # User registration
│   └── signout/route.ts      # User logout
│
├── w/[workspaceSlug]/        # Workspace-scoped APIs
│   ├── agents/
│   │   ├── route.ts          # GET (list), POST (create)
│   │   └── [id]/route.ts     # GET, PATCH, DELETE
│   ├── members/route.ts      # GET, PATCH, DELETE
│   ├── invitations/
│   │   ├── route.ts          # GET (list), POST (send)
│   │   └── [id]/route.ts     # DELETE (revoke)
│   ├── conversations/route.ts
│   ├── analytics/route.ts
│   ├── settings/route.ts
│   └── dashboard/stats/route.ts
│
├── workspaces/route.ts       # Create workspace
│
├── partner-requests/         # Partner onboarding
│   ├── route.ts              # POST (submit request)
│   ├── [id]/route.ts         # GET (detail)
│   ├── [id]/approve/route.ts # POST (approve)
│   └── [id]/reject/route.ts  # POST (reject)
│
├── super-admin/              # Platform admin APIs
│   ├── partners/route.ts
│   ├── partner-requests/route.ts
│   └── billing/route.ts
│
└── health/route.ts           # Health check
```

---

## Frontend Architecture

### Layout Hierarchy

```
RootLayout (app/layout.tsx)
├── ThemeProvider
├── QueryProvider
└── Toaster
    │
    ├── AuthLayout (app/(auth)/layout.tsx)
    │   └── BrandingProvider
    │       └── Auth Pages (login, signup, etc.)
    │
    ├── WorkspaceLayout (app/w/[workspaceSlug]/layout.tsx)
    │   └── WorkspaceDashboardLayout
    │       ├── BrandingProvider
    │       ├── WorkspaceSidebar
    │       ├── WorkspaceHeader
    │       └── {children}
    │
    └── SuperAdminLayout (app/super-admin/(dashboard)/layout.tsx)
        └── SuperAdminLayoutClient
            ├── Sidebar
            ├── Header
            └── {children}
```

### Component Categories

#### UI Components (`components/ui/`)
Primitives from shadcn/ui (Radix UI + Tailwind):
- `button.tsx`, `card.tsx`, `dialog.tsx`, `dropdown-menu.tsx`
- `input.tsx`, `select.tsx`, `table.tsx`, `tabs.tsx`
- `avatar.tsx`, `badge.tsx`, `skeleton.tsx`

#### Workspace Components (`components/workspace/`)
- `workspace-dashboard-layout.tsx` - Main dashboard layout
- `workspace-sidebar.tsx` - Navigation sidebar with workspace selector
- `workspace-header.tsx` - Top header with user menu
- `workspace-selector.tsx` - Workspace picker component
- `agents/workspace-agent-card.tsx` - Agent display card

#### Agent Components (`components/agents/`)
- `agent-card.tsx` - Generic agent card
- `delete-agent-dialog.tsx` - Deletion confirmation
- `test-call-button.tsx` - Initiate test call
- `test-call-modal.tsx` - Test call interface

### Path Aliases (configured in `components.json`)

```typescript
import { Button } from "@/components/ui/button"
import { useWorkspaceAgents } from "@/lib/hooks/use-workspace-agents"
import type { AIAgent } from "@/types/database.types"
```

---

## Voice Agent Integrations

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AI AGENT (Database)                        │
│  provider: "vapi" | "retell" | "synthflow"                     │
│  config: { system_prompt, voice_id, model_settings... }        │
│  agent_secret_api_key: [{ provider, key, is_active }]          │
│  external_agent_id: "provider-assigned-id"                     │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│      VAPI       │ │     RETELL      │ │   SYNTHFLOW     │
│   Integration   │ │   Integration   │ │   Integration   │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│ mapper.ts       │ │ mapper.ts       │ │ (future)        │
│ config.ts       │ │ config.ts       │ │                 │
│ sync.ts         │ │ sync.ts         │ │                 │
│ response.ts     │ │ response.ts     │ │                 │
│ web-call.ts     │ │ web-call.ts     │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Sync Flow

```typescript
// lib/integrations/vapi/agent/sync.ts

// 1. Check if sync is needed
shouldSyncToVapi(agent) → boolean

// 2. Map internal agent to provider format
mapToVapi(agent) → VapiAgentPayload

// 3. Call provider API
createVapiAgent(payload, apiKeys) → response

// 4. Process response & update database
processVapiResponse(response, agentId) → { success, agent }

// 5. Safe wrapper (catches errors)
safeVapiSync(agent, "create" | "update" | "delete") → VapiSyncResult
```

### Retell Special Case

Retell requires creating an LLM first, then an Agent:

```typescript
// lib/integrations/retell/agent/sync.ts

// Create flow:
// 1. createRetellLLM() → llm_id
// 2. createRetellAgent({ response_engine: { llm_id } })
// 3. Store llm_id in agent.config.retell_llm_id

// Delete flow:
// 1. deleteRetellAgent()
// 2. deleteRetellLLM()
```

### Web Calling

Both VAPI and Retell support browser-based test calls:

```typescript
// components/agents/test-call-button.tsx
// components/agents/test-call-modal.tsx

// Uses:
// - @vapi-ai/web for VAPI
// - retell-client-js-sdk for Retell
```

---

## Key Files Reference

### Authentication & Authorization

| File | Purpose |
|------|---------|
| `lib/api/auth.ts` | `getPartnerAuthContext()` - Main auth context |
| `lib/api/workspace-auth.ts` | `withWorkspace()` HOF, `getWorkspaceContext()` |
| `lib/api/partner.ts` | `getPartnerFromHost()` - Partner resolution |
| `lib/api/super-admin-auth.ts` | `getSuperAdminContext()` |
| `lib/rbac/permissions.ts` | RBAC permission matrix |
| `proxy.ts` | Middleware - session, redirects, CSP |

### Supabase

| File | Purpose |
|------|---------|
| `lib/supabase/client.ts` | Browser client |
| `lib/supabase/server.ts` | Server client (SSR) |
| `lib/supabase/admin.ts` | Admin client (bypasses RLS) |
| `lib/supabase/middleware.ts` | Session refresh |

### API Helpers

| File | Purpose |
|------|---------|
| `lib/api/helpers.ts` | Response utilities |
| `lib/api/pagination.ts` | Pagination helpers |
| `lib/api/etag.ts` | ETag/caching headers |
| `lib/audit.ts` | Audit logging |

### State Management

| File | Purpose |
|------|---------|
| `lib/hooks/use-workspace-agents.ts` | Agent CRUD with React Query |
| `lib/hooks/use-workspace-members.ts` | Member management |
| `lib/hooks/use-auth.ts` | Auth actions (logout) |
| `lib/hooks/use-partner-dashboard-stats.ts` | Dashboard data |

### Types

| File | Purpose |
|------|---------|
| `types/database.types.ts` | Core types + Zod schemas |
| `types/api.types.ts` | API-specific types |

### Configuration

| File | Purpose |
|------|---------|
| `config/plans.ts` | Plan tiers & features |
| `config/site.ts` | Site metadata |
| `lib/env.ts` | Environment validation |

---

## Development Patterns

### Server Component (Default)

```typescript
// app/w/[workspaceSlug]/page.tsx
import { getPartnerAuthCached } from "@/lib/api/get-auth-cached"

export default async function Page({ params }) {
  const { workspaceSlug } = await params
  const auth = await getPartnerAuthCached()
  
  if (!auth) redirect("/login")
  
  return <Dashboard />
}
```

### Client Component

```typescript
"use client"

import { useWorkspaceAgents } from "@/lib/hooks/use-workspace-agents"

export function AgentList() {
  const { data, isLoading, error } = useWorkspaceAgents()
  
  if (isLoading) return <Loading />
  if (error) return <Error />
  
  return <AgentGrid agents={data.data} />
}
```

### API Route with Auth

```typescript
// app/api/w/[workspaceSlug]/agents/route.ts
import { withWorkspace } from "@/lib/api/workspace-auth"

export const GET = withWorkspace(async (req, ctx) => {
  const agents = await ctx.adminClient
    .from("ai_agents")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
  
  return apiResponse({ data: agents.data })
})
```

### Adding Audit Logs

```typescript
import { createAuditLog, getRequestMetadata } from "@/lib/audit"

const { ipAddress, userAgent } = getRequestMetadata(request)

await createAuditLog({
  userId: user.id,
  workspaceId: workspace.id,
  action: "agent.created",
  entityType: "ai_agent",
  entityId: agent.id,
  newValues: { name: agent.name },
  ipAddress,
  userAgent,
})
```

---

## State Management

### React Query (Server State)

```typescript
// lib/hooks/use-workspace-agents.ts

// List agents with caching
export function useWorkspaceAgents(options) {
  return useQuery({
    queryKey: ["workspace-agents", workspaceSlug, options],
    queryFn: () => fetch(`/api/w/${workspaceSlug}/agents`),
    enabled: !!workspaceSlug,
  })
}

// Mutations with cache invalidation
export function useCreateWorkspaceAgent() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data) => fetch(`/api/w/${slug}/agents`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(["workspace-agents", slug])
    },
  })
}
```

### Context Providers

```typescript
// context/branding-context.tsx
// Provides partner branding (colors, logo) to all children

// context/theme-context.tsx
// Provides dark/light theme toggle
```

---

## Security Architecture

### Middleware Security Headers

```typescript
// proxy.ts

// Applied to all responses:
response.headers.set("X-Content-Type-Options", "nosniff")
response.headers.set("X-Frame-Options", "DENY")
response.headers.set("X-XSS-Protection", "1; mode=block")
response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")

// Production only:
response.headers.set("Strict-Transport-Security", "max-age=31536000")

// Content Security Policy:
response.headers.set("Content-Security-Policy", buildCSP())
```

### Route Protection

```typescript
// proxy.ts

const publicPaths = ["/", "/login", "/signup", "/pricing", ...]
const protectedPaths = ["/select-workspace", "/workspace-onboarding", "/w/"]
const superAdminPaths = ["/super-admin"]

// Unauthenticated + protected → redirect to /login
// Authenticated + auth page → redirect to /select-workspace
```

### RBAC Enforcement

```typescript
// lib/rbac/permissions.ts

// Check workspace permission
hasWorkspacePermission("admin", "workspace.agents.delete") → true

// Check role hierarchy
isAtLeastWorkspaceRole("member", "viewer") → true

// API route enforcement
withWorkspace(handler, { requiredRoles: ["owner", "admin"] })
```

---

## Email System

### Email Templates

```
lib/email/templates/
├── workspace-invitation.tsx      # Workspace invite email
├── partner-request-notification.tsx  # Admin notification
├── partner-request-approved.tsx  # Approval email
└── partner-request-rejected.tsx  # Rejection email
```

### Sending Emails

```typescript
// lib/email/send.ts

await sendWorkspaceInvitation(
  recipientEmail,
  workspaceName,
  inviterName,
  inviteLink,
  role,
  expiresAt,
  partnerName,
  message
)

await sendPartnerRequestNotification({ id, company_name, ... })
await sendPartnerApprovalEmail(email, { company_name, login_url, ... })
```

---

## Caching Strategy

### Cache Layer

```typescript
// lib/cache/index.ts

// In-memory cache with TTL
await cacheGet<T>(key)
await cacheSet(key, value, ttlSeconds)
await cacheDelete(key)
await cacheDeletePattern(pattern)

// Cache-aside pattern
await cacheGetOrFetch(key, fetchFn, ttl)
```

### Cache Keys

```typescript
CacheKeys.partner(hostname)           // Partner by hostname
CacheKeys.partnerBranding(partnerId)  // Partner branding
CacheKeys.userWorkspaces(userId, partnerId)
CacheKeys.workspace(workspaceId)
CacheKeys.authContext(userId, partnerId)
```

### Cache TTLs

```typescript
CacheTTL.PARTNER = 10 * 60          // 10 minutes
CacheTTL.PARTNER_BRANDING = 60 * 60 // 1 hour
CacheTTL.AUTH_CONTEXT = 2 * 60      // 2 minutes
CacheTTL.WORKSPACE = 5 * 60         // 5 minutes
```

---

## Environment Configuration

### Required Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### Optional Variables

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_xxx

# Email
RESEND_API_KEY=re_xxx
FROM_EMAIL=noreply@example.com
SUPER_ADMIN_EMAIL=admin@example.com

# Storage
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=uploads
```

### Environment Validation

```typescript
// lib/env.ts

export const env = {
  supabaseUrl: getEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: getEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
  appUrl: getEnvVar("NEXT_PUBLIC_APP_URL", false) || "http://localhost:3000",
  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV === "production",
}
```

---

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint

# Format with Prettier
npm run format

# Type check
npm run type-check
```

---

## Quick Reference: Common Tasks

### Add a New Workspace Page

1. Create `app/w/[workspaceSlug]/new-feature/page.tsx`
2. Add navigation link in `workspace-sidebar.tsx`
3. Create API route if needed: `app/api/w/[workspaceSlug]/new-feature/route.ts`
4. Create React Query hook: `lib/hooks/use-workspace-new-feature.ts`

### Add a New Agent Provider

1. Create folder: `lib/integrations/newprovider/`
2. Implement: `agent/config.ts`, `mapper.ts`, `sync.ts`, `response.ts`
3. Add provider to types: `AgentProvider = "vapi" | "retell" | "synthflow" | "newprovider"`
4. Update agent creation API to call sync
5. Add web-call support if applicable

### Create Partner Request Flow

1. User submits via `/request-partner` → `POST /api/partner-requests`
2. Email sent to super admin
3. Super admin reviews at `/super-admin/partner-requests`
4. Approve → Provision partner, create domain, send credentials
5. Reject → Send rejection email

---

## Conventions

- **Server Components**: Default for pages, use `"use client"` only when needed
- **API Errors**: Use helpers from `lib/api/helpers.ts`
- **Route Params**: Always `await params` in Next.js 15+
- **Styling**: Tailwind CSS with `cn()` utility for conditional classes
- **Forms**: React Hook Form + Zod validation
- **State**: React Query for server state, minimal client state
- **Never commit**: `.env*` files

---

*This reference file is maintained for AI assistant understanding and developer onboarding.*

