/**
 * Algolia Types for React InstantSearch Integration
 */

// Client-side search config returned from API
// Note: API keys and index name are NOT exposed to client - searches go through backend proxy
export interface AlgoliaSearchConfig {
  configured: boolean
  workspaceId?: string
  message?: string
  benefits?: AlgoliaBenefits
}

export interface AlgoliaBenefits {
  title: string
  features: Array<{
    icon: string
    title: string
    description: string
  }>
  cta: string
}

// Search state for InstantSearch
export interface AlgoliaSearchState {
  query: string
  page: number
  hitsPerPage: number
  filters: {
    status?: string
    direction?: string
    callType?: string
    agentId?: string
    startDate?: Date
    endDate?: Date
  }
}

// Hit item from search results
export interface AlgoliaCallHit {
  objectID: string
  conversation_id: string
  external_id: string | null
  workspace_id: string
  agent_id: string | null
  call_type: string | null
  transcript?: string
  summary?: string
  phone_number: string | null
  caller_name: string | null
  agent_name: string
  status: string
  direction: string
  sentiment: string | null
  provider: string
  duration_seconds: number
  total_cost: number
  started_at_timestamp: number | null
  created_at_timestamp: number
  recording_url: string | null
  // Highlighting results
  _highlightResult?: {
    transcript?: { value: string; matchLevel: string }
    summary?: { value: string; matchLevel: string }
    caller_name?: { value: string; matchLevel: string }
  }
}

// Autocomplete suggestion
export interface AlgoliaSuggestion {
  text: string
  type: "caller" | "phone" | "agent" | "transcript" | "summary"
  matchedField: string // Human-readable field name that matched
  highlight?: string // Highlighted snippet if available
  objectID?: string
}

// Search results
export interface AlgoliaSearchResults {
  hits: AlgoliaCallHit[]
  nbHits: number
  page: number
  nbPages: number
  hitsPerPage: number
  processingTimeMS?: number
  query: string
}

