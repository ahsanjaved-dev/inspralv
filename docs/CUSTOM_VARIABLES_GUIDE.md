# Custom Variables System - Complete Guide

> **Last Updated**: January 21, 2026  
> **Version**: 1.0  
> **Module**: Workspace Settings → Custom Variables

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & Data Flow](#2-architecture--data-flow)
3. [System Flow Charts](#3-system-flow-charts)
4. [API Reference](#4-api-reference)
5. [Testing Guide](#5-testing-guide)
6. [Sample Data](#6-sample-data)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Overview

### What Are Custom Variables?

Custom variables are placeholders that get replaced with recipient-specific data during outbound campaigns. They enable personalization of AI agent conversations.

**Example:**
```
System Prompt: "Hello {{first_name}}, I'm calling about your interest in {{product_interest}}."

During Call to John (interested in Solar Panels):
"Hello John, I'm calling about your interest in Solar Panels."
```

### Variable Types

| Type | Description | Example | Editable |
|------|-------------|---------|----------|
| **Standard** | Built-in variables mapped from CSV | `{{first_name}}`, `{{company}}` | No (locked) |
| **Workspace** | Custom variables defined in settings | `{{product_interest}}`, `{{appointment_date}}` | Yes |
| **CSV** | Extra columns from CSV import | Any column beyond standard/workspace | Auto-detected |

### Key Features

- ✅ Centralized management at workspace level
- ✅ Reusable across all agents and campaigns
- ✅ Default values for missing data
- ✅ Required/optional variable support
- ✅ Category organization (contact, business, custom)
- ✅ Visual indicators for used variables

---

## 2. Architecture & Data Flow

### Data Storage Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATABASE (Supabase)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Table: workspaces                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Column: settings (JSONB)                                           │    │
│  │  {                                                                   │    │
│  │    "timezone": "America/New_York",                                   │    │
│  │    "custom_variables": [                                             │    │
│  │      {                                                               │    │
│  │        "id": "uuid-1",                                               │    │
│  │        "name": "product_interest",                                   │    │
│  │        "description": "Product they're interested in",              │    │
│  │        "default_value": "our services",                              │    │
│  │        "is_required": false,                                         │    │
│  │        "category": "business",                                       │    │
│  │        "created_at": "2026-01-21T10:00:00Z"                          │    │
│  │      },                                                              │    │
│  │      { ... more variables ... }                                      │    │
│  │    ]                                                                 │    │
│  │  }                                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript Types

```typescript
// types/database.types.ts

interface CustomVariableDefinition {
  id: string                           // UUID
  name: string                         // snake_case (e.g., "product_interest")
  description: string                  // Human-readable description
  default_value: string                // Fallback when not provided
  is_required: boolean                 // Must be in CSV?
  category: "standard" | "contact" | "business" | "custom"
  is_standard?: boolean                // Built-in (locked)
  created_at: string                   // ISO timestamp
}

interface WorkspaceSettings {
  timezone?: string
  custom_variables?: CustomVariableDefinition[]
}
```

---

## 3. System Flow Charts

### 3.1 Custom Variable Creation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CUSTOM VARIABLE CREATION                              │
└─────────────────────────────────────────────────────────────────────────────┘

User navigates to: /w/{workspace}/settings
                            │
                            ▼
              ┌─────────────────────────────┐
              │  CustomVariablesSection     │
              │  component loads            │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  useWorkspaceCustomVariables│
              │  hook fetches workspace     │
              │  settings from API          │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  Display current variables  │
              │  - Standard (locked)        │
              │  - Custom (editable)        │
              └──────────────┬──────────────┘
                             │
          User clicks "Add Custom Variable"
                             │
                             ▼
              ┌─────────────────────────────┐
              │  VariableDialog opens       │
              │  - Name input               │
              │  - Description              │
              │  - Default value            │
              │  - Category select          │
              │  - Required toggle          │
              └──────────────┬──────────────┘
                             │
              User fills form and clicks "Add Variable"
                             │
                             ▼
              ┌─────────────────────────────┐
              │  useAddCustomVariable hook  │
              │  calls PATCH /api/w/{slug}/ │
              │  settings with:             │
              │  {                          │
              │    custom_variable_operation│
              │    : {                      │
              │      action: "add",         │
              │      variable: {...}        │
              │    }                        │
              │  }                          │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  API Route Handler:         │
              │  1. Validate input          │
              │  2. Check duplicate names   │
              │  3. Generate UUID & timestamp│
              │  4. Append to custom_variables│
              │  5. Update workspace.settings│
              │  6. Return updated workspace │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  Query cache invalidated    │
              │  UI updates with new variable│
              │  Toast: "Variable added"    │
              └─────────────────────────────┘
```

### 3.2 Agent Wizard Variable Usage Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT WIZARD VARIABLE USAGE                               │
└─────────────────────────────────────────────────────────────────────────────┘

User creates new agent: /w/{workspace}/agents/new
                            │
                            ▼
              ┌─────────────────────────────┐
              │  AgentWizard loads          │
              │  Step 1: Setup & Voice      │
              └──────────────┬──────────────┘
                             │
              User completes Step 1, goes to Step 2
                             │
                             ▼
              ┌─────────────────────────────┐
              │  Step 2: Prompts & Tools    │
              │  - System Prompt textarea   │
              │  - Greeting textarea        │
              │  - Function Tools editor    │
              │  - Available Variables card │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  useWorkspaceCustomVariables│
              │  fetches workspace vars     │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  Display "Available Variables"│
              │  ┌───────────────────────┐  │
              │  │ Standard Variables:   │  │
              │  │ [🔒{{first_name}}]    │  │
              │  │ [🔒{{last_name}}]     │  │
              │  │ [🔒{{company}}]       │  │
              │  │ ...                   │  │
              │  ├───────────────────────┤  │
              │  │ Custom Variables:     │  │
              │  │ [{{product_interest}}📋]│  │
              │  │ [{{appointment_date}}📋]│  │
              │  └───────────────────────┘  │
              └──────────────┬──────────────┘
                             │
              User clicks variable badge
                             │
                             ▼
              ┌─────────────────────────────┐
              │  navigator.clipboard.       │
              │  writeText("{{var_name}}")  │
              │  Toast: "Copied to clipboard"│
              └──────────────┬──────────────┘
                             │
              User pastes into System Prompt
                             │
                             ▼
              ┌─────────────────────────────┐
              │  System Prompt now contains │
              │  variable placeholders:     │
              │                             │
              │  "Hello {{first_name}}, I'm │
              │  calling about your interest│
              │  in {{product_interest}}..."│
              └─────────────────────────────┘
```

### 3.3 Campaign Variable Resolution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   CAMPAIGN VARIABLE RESOLUTION                               │
└─────────────────────────────────────────────────────────────────────────────┘

User creates campaign: /w/{workspace}/campaigns/new
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Step 1: Details            │
              │  Select agent with prompts  │
              │  that use variables         │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  Step 2: Import Recipients  │
              │  Upload CSV with columns:   │
              │  phone_number,first_name,   │
              │  product_interest,etc       │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  CSV Parser extracts:       │
              │  - Standard columns → fields│
              │  - Extra columns → custom_  │
              │    variables JSONB          │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  Step 3: Variables          │
              │  StepVariables component    │
              └──────────────┬──────────────┘
                             │
                             ▼
    ┌─────────────────────────────────────────────────────┐
    │         VARIABLE DETECTION & DISPLAY                 │
    ├─────────────────────────────────────────────────────┤
    │                                                      │
    │  ┌─────────────────┐  ┌─────────────────┐           │
    │  │ Standard Vars   │  │ Workspace Vars  │           │
    │  │ (from constant) │  │ (from API)      │           │
    │  │ ✓ first_name    │  │ ✓ product_      │           │
    │  │   last_name     │  │   interest      │           │
    │  │   email         │  │   appointment_  │           │
    │  │ ✓ company       │  │   date          │           │
    │  │   phone_number  │  │                 │           │
    │  └─────────────────┘  └─────────────────┘           │
    │                                                      │
    │  ┌─────────────────┐  ┌─────────────────┐           │
    │  │ CSV Columns     │  │ Used in Agent   │           │
    │  │ (detected)      │  │ (highlighted ✓) │           │
    │  │ ✓ product_      │  │ first_name ✓    │           │
    │  │   interest      │  │ company ✓       │           │
    │  │   custom_field1 │  │ product_interest✓│          │
    │  └─────────────────┘  └─────────────────┘           │
    │                                                      │
    └─────────────────────────────────────────────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  Step 4: Schedule & Create  │
              └──────────────┬──────────────┘
                             │
              Campaign starts, calls made
                             │
                             ▼
    ┌─────────────────────────────────────────────────────┐
    │         VARIABLE SUBSTITUTION AT CALL TIME           │
    ├─────────────────────────────────────────────────────┤
    │                                                      │
    │  Recipient Data:                                     │
    │  ┌────────────────────────────────────────────┐     │
    │  │ phone_number: +1234567890                  │     │
    │  │ first_name: John                           │     │
    │  │ company: Acme Corp                         │     │
    │  │ custom_variables: {                        │     │
    │  │   "product_interest": "Solar Panels"       │     │
    │  │ }                                          │     │
    │  └────────────────────────────────────────────┘     │
    │                                                      │
    │  Agent System Prompt:                                │
    │  "Hello {{first_name}} from {{company}}, I'm        │
    │   calling about {{product_interest}}..."            │
    │                                                      │
    │                    ▼                                 │
    │                                                      │
    │  Resolved Prompt:                                    │
    │  "Hello John from Acme Corp, I'm calling about      │
    │   Solar Panels..."                                  │
    │                                                      │
    └─────────────────────────────────────────────────────┘
```

### 3.4 Complete System Integration Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     COMPLETE SYSTEM INTEGRATION                              │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────────────┐
                    │      WORKSPACE SETTINGS       │
                    │   /w/{slug}/settings          │
                    │                               │
                    │  Define Custom Variables:     │
                    │  • product_interest           │
                    │  • appointment_date           │
                    │  • account_balance            │
                    └───────────────┬───────────────┘
                                    │
                    Stored in workspace.settings.custom_variables
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│   AGENT WIZARD    │    │  CAMPAIGN WIZARD  │    │   FUTURE USES     │
│   /agents/new     │    │  /campaigns/new   │    │                   │
│                   │    │                   │    │  • SMS campaigns  │
│ View & copy vars  │    │ See all available │    │  • Email templates│
│ into prompts      │    │ variables + CSV   │    │  • Webhooks       │
│                   │    │ column mapping    │    │                   │
└───────────────────┘    └───────────────────┘    └───────────────────┘
        │                           │
        │                           │
        ▼                           ▼
┌───────────────────┐    ┌───────────────────┐
│   AI AGENT        │    │   CALL RECIPIENT  │
│   (VAPI/Retell)   │    │   (Database)      │
│                   │    │                   │
│ system_prompt:    │    │ first_name: John  │
│ "Hello {{first_   │◄───│ company: Acme     │
│ name}} from       │    │ custom_variables: │
│ {{company}}..."   │    │ {product_interest:│
│                   │    │  "Solar Panels"}  │
└───────────────────┘    └───────────────────┘
        │                           │
        └───────────────┬───────────┘
                        │
                        ▼
              ┌───────────────────┐
              │  PHONE CALL       │
              │                   │
              │  "Hello John from │
              │   Acme, I'm       │
              │   calling about   │
              │   Solar Panels..."│
              └───────────────────┘
```

---

## 4. API Reference

### Endpoints

#### GET /api/w/{workspaceSlug}/settings

Returns workspace settings including custom variables.

**Response:**
```json
{
  "id": "workspace-uuid",
  "name": "My Workspace",
  "settings": {
    "timezone": "America/New_York",
    "custom_variables": [
      {
        "id": "var-uuid-1",
        "name": "product_interest",
        "description": "Product they're interested in",
        "default_value": "our services",
        "is_required": false,
        "category": "business",
        "created_at": "2026-01-21T10:00:00Z"
      }
    ]
  }
}
```

#### PATCH /api/w/{workspaceSlug}/settings

Update workspace settings including custom variable operations.

**Add Variable Request:**
```json
{
  "custom_variable_operation": {
    "action": "add",
    "variable": {
      "name": "appointment_date",
      "description": "Scheduled appointment date",
      "default_value": "",
      "is_required": false,
      "category": "business"
    }
  }
}
```

**Update Variable Request:**
```json
{
  "custom_variable_operation": {
    "action": "update",
    "variable_id": "var-uuid-1",
    "variable": {
      "name": "product_interest",
      "description": "Updated description",
      "default_value": "our products",
      "is_required": true,
      "category": "business"
    }
  }
}
```

**Delete Variable Request:**
```json
{
  "custom_variable_operation": {
    "action": "delete",
    "variable_id": "var-uuid-1"
  }
}
```

### React Hooks

```typescript
// Fetch workspace custom variables
const { customVariables, isLoading, error } = useWorkspaceCustomVariables()

// Add a new custom variable
const addVariable = useAddCustomVariable()
await addVariable.mutateAsync({
  name: "product_interest",
  description: "Product they're interested in",
  default_value: "",
  is_required: false,
  category: "business"
})

// Update an existing custom variable
const updateVariable = useUpdateCustomVariable()
await updateVariable.mutateAsync({
  id: "var-uuid-1",
  name: "product_interest",
  description: "Updated description",
  default_value: "our products",
  is_required: true,
  category: "business"
})

// Delete a custom variable
const deleteVariable = useDeleteCustomVariable()
await deleteVariable.mutateAsync("var-uuid-1")
```

---

## 5. Testing Guide

### 5.1 Prerequisites

- Access to workspace with owner/admin role
- At least one AI agent created
- CSV file with recipient data

### 5.2 Test Cases

#### TC-001: View Standard Variables (Read-Only)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/w/{workspace}/settings` | Settings page loads |
| 2 | Scroll to "Custom Variables" section | Section displays with standard variables |
| 3 | Verify standard variables shown | `first_name`, `last_name`, `email`, `company`, `phone_number` visible |
| 4 | Check for lock icon on standard vars | Lock icon (🔒) displayed |
| 5 | Attempt to edit/delete standard var | No edit/delete buttons available |

#### TC-002: Add Custom Variable

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Add Custom Variable" button | Dialog opens |
| 2 | Enter name: `product_interest` | Name field accepts input, auto-formats to snake_case |
| 3 | Enter description: `Product they're interested in` | Description saved |
| 4 | Enter default value: `our services` | Default value saved |
| 5 | Select category: `Business` | Category dropdown works |
| 6 | Toggle "Required" switch ON | Switch toggles |
| 7 | Click "Add Variable" | Dialog closes, variable appears in list |
| 8 | Verify toast notification | "Variable added successfully" shown |
| 9 | Refresh page | Variable persists after refresh |

#### TC-003: Edit Custom Variable

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find custom variable in list | Variable displayed with edit button |
| 2 | Click edit (pencil) icon | Edit dialog opens with current values |
| 3 | Change description to: `Updated description` | Field editable |
| 4 | Click "Save Changes" | Dialog closes, changes saved |
| 5 | Verify toast notification | "Variable updated successfully" shown |
| 6 | Verify updated value in list | New description displayed |

#### TC-004: Delete Custom Variable

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find custom variable in list | Variable displayed with delete button |
| 2 | Click delete (trash) icon | Confirmation dialog opens |
| 3 | Verify warning message | Shows variable name and warning |
| 4 | Click "Delete" | Dialog closes, variable removed |
| 5 | Verify toast notification | "Variable deleted" shown |
| 6 | Refresh page | Variable does not reappear |

#### TC-005: Duplicate Variable Name Prevention

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add variable with name: `test_var` | Variable created successfully |
| 2 | Click "Add Custom Variable" again | Dialog opens |
| 3 | Enter name: `test_var` (same name) | Name accepted in form |
| 4 | Click "Add Variable" | Error: "A variable named 'test_var' already exists" |
| 5 | Change name to: `test_var_2` | - |
| 6 | Click "Add Variable" | Variable created successfully |

#### TC-006: Variable Name Validation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Add Custom Variable" | Dialog opens |
| 2 | Enter name: `Product Interest` | Auto-converts to `product_interest` |
| 3 | Enter name: `123test` | Error: "Name must start with a letter" |
| 4 | Enter name: `test-var` | Auto-converts to `test_var` |
| 5 | Enter name: `test@var!` | Auto-converts to `test_var_` |

#### TC-007: Quick Add Common Variables

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ensure no custom variables exist | List shows only standard variables |
| 2 | Find "Quick Add Common Variables" section | Section displayed with suggestions |
| 3 | Click `product_interest` button | Variable added immediately |
| 4 | Verify toast notification | "Added product_interest" shown |
| 5 | Click `appointment_date` button | Variable added |
| 6 | Verify both variables in list | Both variables displayed |

#### TC-008: Agent Wizard - View Variables

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/w/{workspace}/agents/new` | Agent wizard opens |
| 2 | Complete Step 1 (Setup & Voice) | Move to Step 2 |
| 3 | Scroll to "Available Variables" card | Card displayed |
| 4 | Verify standard variables shown | All 5 standard vars with lock icons |
| 5 | Verify workspace custom variables shown | Custom vars from settings displayed |
| 6 | Click on variable badge | Variable copied to clipboard |
| 7 | Verify toast notification | "Copied {{var_name}} to clipboard" |

#### TC-009: Agent Wizard - Insert Variable

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In agent wizard Step 2 | System prompt textarea visible |
| 2 | Click `{{first_name}}` badge | Copied to clipboard |
| 3 | Paste into system prompt | `{{first_name}}` inserted |
| 4 | Click `{{product_interest}}` badge | Copied to clipboard |
| 5 | Paste into system prompt | `{{product_interest}}` inserted |
| 6 | Complete wizard and create agent | Agent created with variables in prompt |

#### TC-010: Campaign Wizard - Variable Display

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create agent with variables in prompt | Agent ready |
| 2 | Navigate to `/w/{workspace}/campaigns/new` | Campaign wizard opens |
| 3 | Step 1: Select the agent | Agent selected |
| 4 | Step 2: Import CSV (see sample data below) | Recipients imported |
| 5 | Step 3: Variables tab | Variables section loads |
| 6 | Verify "Standard Variables" section | Shows `{{first_name}}`, etc. |
| 7 | Verify "Workspace Variables" section | Shows custom vars from settings |
| 8 | Verify "CSV Variables" section | Shows extra CSV columns |
| 9 | Verify used variables highlighted | Variables in agent prompt show ✓ |

#### TC-011: Campaign - Variable Summary

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Complete campaign wizard Step 3 | Variables page shown |
| 2 | Find "Variables Used in Agent Prompts" | Green summary box displayed |
| 3 | Verify variable count | "Your agent uses X variables" |
| 4 | Verify variable names listed | All used variables shown |
| 5 | Verify CSV column advice | Message about ensuring CSV has columns |

### 5.3 Negative Test Cases

#### TC-N01: Empty Variable Name

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Add Variable dialog | Dialog opens |
| 2 | Leave name empty | - |
| 3 | Click "Add Variable" | Error: "Variable name is required" |

#### TC-N02: Delete Standard Variable Attempt

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View standard variables | Lock icons visible |
| 2 | Verify no delete buttons | Delete buttons not rendered |
| 3 | (API test) Send DELETE for standard var | Error: "Cannot delete standard variables" |

#### TC-N03: Unauthorized User

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as workspace member (not admin) | - |
| 2 | Navigate to settings | Page loads |
| 3 | Try to add variable | - |
| 4 | (API should reject) | Error: 403 Forbidden |

---

## 6. Sample Data

### 6.1 Sample Custom Variables to Add

```json
[
  {
    "name": "product_interest",
    "description": "Product or service the recipient is interested in",
    "default_value": "our services",
    "is_required": false,
    "category": "business"
  },
  {
    "name": "appointment_date",
    "description": "Scheduled appointment date and time",
    "default_value": "a convenient time",
    "is_required": false,
    "category": "business"
  },
  {
    "name": "account_balance",
    "description": "Recipient's current account balance",
    "default_value": "your account",
    "is_required": false,
    "category": "business"
  },
  {
    "name": "referral_source",
    "description": "How the recipient heard about us",
    "default_value": "",
    "is_required": false,
    "category": "contact"
  },
  {
    "name": "preferred_time",
    "description": "Recipient's preferred callback time",
    "default_value": "any time",
    "is_required": false,
    "category": "contact"
  }
]
```

### 6.2 Sample CSV for Campaign Testing

**File: `campaign_test_data.csv`**

```csv
phone_number,first_name,last_name,email,company,product_interest,appointment_date,account_balance,referral_source,custom_notes
+15551234567,John,Smith,john.smith@example.com,Acme Corp,Solar Panels,January 25 at 2pm,$1500.00,Google Search,VIP customer
+15551234568,Sarah,Johnson,sarah.j@example.com,Tech Solutions,Home Security,January 26 at 10am,$2300.50,Friend Referral,Follow up required
+15551234569,Michael,Williams,m.williams@example.com,StartupXYZ,Smart Thermostat,January 27 at 3pm,$800.00,Facebook Ad,First time caller
+15551234570,Emily,Brown,emily.b@example.com,ConsultingCo,Energy Audit,January 28 at 11am,$3200.00,Email Campaign,Existing customer
+15551234571,David,Davis,david.d@example.com,RetailPlus,Window Replacement,January 29 at 4pm,$4500.00,Website,High priority
+15551234572,Jessica,Miller,j.miller@example.com,HealthFirst,Insulation,January 30 at 9am,$1100.00,TV Commercial,Budget conscious
+15551234573,Robert,Wilson,r.wilson@example.com,FinanceGroup,Solar Panels,February 1 at 1pm,$5000.00,Radio Ad,Business decision maker
+15551234574,Jennifer,Taylor,jennifer.t@example.com,EduCenter,Home Security,February 2 at 2pm,$950.00,Referral Program,Education focused
+15551234575,William,Anderson,will.a@example.com,LegalServices,Smart Thermostat,February 3 at 10am,$2800.00,LinkedIn,Professional
+15551234576,Amanda,Thomas,amanda.t@example.com,DesignStudio,Energy Audit,February 4 at 11am,$1750.00,Instagram,Creative industry
```

### 6.3 Sample Agent System Prompt with Variables

```text
You are a friendly and professional sales representative for GreenHome Energy Solutions.

You are calling {{first_name}} from {{company}}.

Key Information:
- The customer is interested in: {{product_interest}}
- Their scheduled appointment: {{appointment_date}}
- Current account balance: {{account_balance}}
- How they found us: {{referral_source}}

Your goals:
1. Confirm their interest in {{product_interest}}
2. Verify the appointment on {{appointment_date}}
3. Answer any questions they have
4. If they need to reschedule, offer alternative times

Remember to:
- Be professional but friendly
- Address them by name ({{first_name}})
- Acknowledge their company ({{company}})
- Reference their specific interest ({{product_interest}})

End the call by confirming next steps and thanking them for their time.
```

### 6.4 Sample Agent Greeting with Variables

```text
Hello {{first_name}}! This is Alex calling from GreenHome Energy Solutions. I'm reaching out because you expressed interest in {{product_interest}}. I wanted to confirm your appointment scheduled for {{appointment_date}}. Is this still a good time for you?
```

### 6.5 Expected Variable Substitution Example

**Input (Recipient #1):**
```json
{
  "first_name": "John",
  "company": "Acme Corp",
  "product_interest": "Solar Panels",
  "appointment_date": "January 25 at 2pm",
  "account_balance": "$1500.00",
  "referral_source": "Google Search"
}
```

**Output (Agent speaks):**
```text
Hello John! This is Alex calling from GreenHome Energy Solutions. I'm reaching out because you expressed interest in Solar Panels. I wanted to confirm your appointment scheduled for January 25 at 2pm. Is this still a good time for you?
```

---

## 7. Troubleshooting

### Common Issues

#### Issue: Custom variable not appearing in Agent Wizard

**Cause:** Cache not refreshed after adding variable  
**Solution:**
1. Refresh the page
2. Clear browser cache
3. Check if variable was saved in Settings

#### Issue: Variable shows as `{{variable_name}}` instead of value

**Cause:** CSV column doesn't match variable name  
**Solution:**
1. Ensure CSV column name matches variable name exactly (case-insensitive)
2. Check for extra spaces in CSV column headers
3. Verify variable is in workspace settings

#### Issue: "Cannot modify standard variables" error

**Cause:** Attempting to edit/delete built-in variables  
**Solution:** Standard variables are locked. Create a custom variable with a different name instead.

#### Issue: Duplicate variable name error

**Cause:** Variable with same name already exists  
**Solution:** Use a unique name or delete the existing variable first.

### Debug Checklist

1. **Variables not showing:**
   - [ ] Check workspace settings API response
   - [ ] Verify `settings.custom_variables` array exists
   - [ ] Check browser console for errors

2. **Variables not substituting:**
   - [ ] Verify variable syntax: `{{variable_name}}`
   - [ ] Check recipient has data for that variable
   - [ ] Verify CSV column mapping

3. **API errors:**
   - [ ] Check user has admin/owner role
   - [ ] Verify workspace slug is correct
   - [ ] Check request payload format

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CUSTOM VARIABLES QUICK REFERENCE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DEFINE VARIABLES:     Settings → Custom Variables → Add                    │
│                                                                              │
│  USE IN PROMPTS:       {{variable_name}}                                    │
│                                                                              │
│  PROVIDE DATA:         CSV column matching variable name                    │
│                                                                              │
│  STANDARD VARS:        first_name, last_name, email, company, phone_number  │
│                                                                              │
│  NAMING RULES:         - Start with letter                                  │
│                        - Lowercase only                                      │
│                        - Use underscores for spaces                         │
│                        - No special characters                              │
│                                                                              │
│  CATEGORIES:           standard, contact, business, custom                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

*Document Version: 1.0 | Last Updated: January 21, 2026*

