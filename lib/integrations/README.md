# Integration Architecture

This document describes the integration architecture for Genius365, including the migration from workspace-level to org-level integrations.

## Overview

Genius365 uses a two-tier integration model for managing API keys for external providers (VAPI, Retell, Algolia).

---

## Org-Level Integrations (Recommended) ✅

API keys are managed at the **organization (Partner) level** and assigned to workspaces.

### Database Tables

- **`partner_integrations`** - Stores API keys at the organization level
  - `partner_id` - The organization that owns this integration
  - `provider` - Provider type: 'vapi', 'retell', 'algolia'
  - `name` - Display name (e.g., "Production VAPI")
  - `api_keys` - JSON with `default_secret_key`, `default_public_key`, `additional_keys`
  - `is_default` - If true, auto-assigned to new workspaces
  - `is_active` - Whether the integration is currently active

- **`workspace_integration_assignments`** - Links integrations to workspaces
  - `workspace_id` - The workspace using this integration
  - `provider` - Provider type (ensures one per provider per workspace)
  - `partner_integration_id` - Reference to the org-level integration

### Flow

1. Org admin creates integration at `/org/integrations`
2. Integration can be marked as "default" for auto-assignment to new workspaces
3. Org admin assigns integrations to specific workspaces via the workspace management dialog
4. Agent sync operations fetch keys via the assignment chain:
   - `workspace` → `workspace_integration_assignments` → `partner_integrations`

### API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/partner/integrations` | List all org-level integrations |
| POST | `/api/partner/integrations` | Create new org-level integration |
| GET | `/api/partner/integrations/[id]` | Get integration details |
| PATCH | `/api/partner/integrations/[id]` | Update integration |
| DELETE | `/api/partner/integrations/[id]` | Delete integration |
| POST | `/api/partner/integrations/[id]/set-default` | Set as default |
| GET | `/api/partner/workspaces/[id]/integrations` | Get workspace assignments |
| POST | `/api/partner/workspaces/[id]/integrations` | Assign integration to workspace |
| DELETE | `/api/partner/workspaces/[id]/integrations/[provider]` | Remove assignment |

### React Hooks

```typescript
import {
  usePartnerIntegrations,
  usePartnerIntegration,
  useCreatePartnerIntegration,
  useUpdatePartnerIntegration,
  useDeletePartnerIntegration,
  useSetDefaultIntegration,
  useWorkspaceIntegrationAssignments,
  useAssignWorkspaceIntegration,
  useRemoveWorkspaceIntegration,
} from '@/lib/hooks/use-partner-integrations'
```

---

## Workspace-Level Integrations (Deprecated) ⚠️

> **⚠️ DEPRECATED**: This model is being phased out. Do not use for new features.
> 
> **Sunset Date**: 2026-06-01

API keys stored directly on the workspace in `workspace_integrations`.

### Database Table

- **`workspace_integrations`** - Legacy table storing keys at workspace level
  - `workspace_id` - The workspace that owns this integration
  - `provider` - Provider type
  - `api_keys` - JSON with API keys

### Migration Path

1. Create org-level integration with your API keys at `/org/integrations`
2. Assign the integration to your workspace(s)
3. Remove the workspace-level integration

### Deprecated API Routes

These routes add `Deprecation` headers to responses and log warnings:

| Method | Route | Status |
|--------|-------|--------|
| GET | `/api/w/[slug]/integrations` | ⚠️ Deprecated |
| POST | `/api/w/[slug]/integrations` | ⚠️ Deprecated |
| GET | `/api/w/[slug]/integrations/[provider]` | ⚠️ Deprecated |
| PATCH | `/api/w/[slug]/integrations/[provider]` | ⚠️ Deprecated |
| DELETE | `/api/w/[slug]/integrations/[provider]` | ⚠️ Deprecated |

### Deprecated React Hooks

```typescript
// ⚠️ DEPRECATED - Do not use
import {
  useWorkspaceIntegrations,      // Use usePartnerIntegrations instead
  useWorkspaceIntegration,       // Use useWorkspaceIntegrationAssignments instead
  useCreateWorkspaceIntegration, // Use useCreatePartnerIntegration instead
  useUpdateWorkspaceIntegration, // Use useUpdatePartnerIntegration instead
  useDeleteWorkspaceIntegration, // Use useDeletePartnerIntegration instead
} from '@/lib/hooks/use-workspace-integrations'
```

---

## Key Fetching Priority

When sync operations (VAPI, Retell, Algolia) need API keys, they follow this priority:

1. **Check `workspace_integration_assignments`** → `partner_integrations`
2. **Fallback to `workspace_integrations`** (legacy, for backwards compatibility)

### Implementation References

- **VAPI sync**: `lib/integrations/vapi/agent/sync.ts`
  - `getVapiApiKeyForAgent()` - Fetches from assignments table
  - `safeVapiSync()` - Main sync function

- **Retell sync**: `lib/integrations/retell/agent/sync.ts`
  - `getRetellApiKeyForAgent()` - Fetches from assignments table
  - `safeRetellSync()` - Main sync function

- **Algolia**: `lib/algolia/client.ts`
  - `getOrgLevelAlgoliaConfig()` - Tries org-level first
  - `getLegacyAlgoliaConfig()` - Falls back to workspace-level

---

## UI Components

### Org-Level (Recommended)

- **`/org/integrations`** - Main integrations management page
- **`components/org/integrations/add-integration-dialog.tsx`** - Create new integration
- **`components/org/integrations/manage-integration-dialog.tsx`** - Edit/manage integration
- **`components/org/integrations/workspace-integrations-dialog.tsx`** - Assign to workspaces

### Workspace-Level (Deprecated)

- **`components/workspace/integrations/connect-integartion-dialog.tsx`** - ⚠️ Deprecated
  - Shows deprecation banner directing users to org-level management

---

## Benefits of Org-Level Architecture

1. **Centralized Management** - Manage all API keys from one location
2. **Better Security** - Keys are controlled at the org level, not scattered across workspaces
3. **Easier Provisioning** - Default integrations auto-assign to new workspaces
4. **Flexible Assignment** - One org can have multiple keys per provider, assign different keys to different workspaces
5. **Audit Trail** - Clear visibility into which workspace uses which key

---

## Timeline

| Phase | Date | Status |
|-------|------|--------|
| Org-level integrations available | 2024 | ✅ Complete |
| Deprecation warnings added | 2026-01 | ✅ Complete |
| Workspace-level removal | 2026-06-01 | Planned |

