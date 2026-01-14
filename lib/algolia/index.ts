/**
 * Algolia Integration Module
 *
 * This module provides Algolia search integration for the Genius365 platform.
 *
 * Architecture:
 * - Organization-level API key management (Partner Integrations)
 * - Workspace-level data isolation using workspace_id as namespace
 * - REST-based API (no Algolia JS client dependency)
 * - React InstantSearch-like components for autocomplete and fast search
 *
 * Key features:
 * - Fast full-text search on call logs
 * - Autocomplete suggestions
 * - Multi-query search support
 * - Fallback to database search when Algolia is not configured
 */

// Client configuration
export {
  getWorkspaceAlgoliaConfig,
  getWorkspaceAlgoliaContext,
  getAlgoliaSearchClientConfig,
  isAlgoliaConfigured,
  clearAlgoliaCache,
  clearAllAlgoliaCache,
  type AlgoliaConfig,
  type WorkspaceAlgoliaContext,
} from "./client"

// Call logs indexing and search
export {
  indexCallLogToAlgolia,
  bulkIndexCallLogs,
  deleteCallLogFromAlgolia,
  clearWorkspaceDataFromAlgolia,
  searchCallLogs,
  getAutocompleteSuggestions,
  multiQuerySearch,
  configureCallLogsIndex,
  type CallLogAlgoliaRecord,
  type CallLogSearchParams,
  type CallLogSearchResult,
  type AutocompleteParams,
  type AutocompleteResult,
  type MultiQuerySearch,
  type MultiQueryResult,
} from "./call-logs"

// Types for frontend integration
export type {
  AlgoliaSearchConfig,
  AlgoliaBenefits,
  AlgoliaSearchState,
  AlgoliaCallHit,
  AlgoliaSuggestion,
  AlgoliaSearchResults,
} from "./types"

// Sync utilities
export {
  syncWorkspaceCallsToAlgolia,
  syncPartnerWorkspacesToAlgolia,
  startBackgroundSync,
  startBackgroundBulkSync,
  type SyncResult,
  type BulkSyncResult,
} from "./sync"

