/**
 * VAPI Query Tool
 * Tool for querying knowledge bases
 */

import type { VapiQueryTool } from '../../types'
import type { VapiToolMessage } from '../../../types'

// ============================================================================
// OPTIONS
// ============================================================================

export interface QueryToolOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** Knowledge base IDs to query */
  knowledgeBaseIds?: string[]
  /** Number of results to return (topK) */
  topK?: number
  /** Message to speak during query */
  queryingMessage?: string
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a VAPI Query tool configuration
 */
export function createQueryTool(options: QueryToolOptions = {}): VapiQueryTool {
  const {
    name = 'search_knowledge',
    description = 'Search the knowledge base for relevant information to answer the question.',
    knowledgeBaseIds,
    topK,
    queryingMessage = 'Let me look that up for you...',
  } = options

  const tool: VapiQueryTool = {
    type: 'query',
    name,
    description,
  }

  if (knowledgeBaseIds) tool.knowledgeBaseIds = knowledgeBaseIds
  if (topK) tool.topK = topK

  tool.messages = [
    {
      type: 'request-start',
      content: queryingMessage,
      blocking: false,
    },
  ]

  return tool
}

// ============================================================================
// PRESETS
// ============================================================================

/**
 * Default knowledge base query tool
 */
export const DEFAULT_QUERY_TOOL = createQueryTool()

/**
 * Creates a FAQ search tool
 */
export function createFaqSearchTool(knowledgeBaseIds?: string[]): VapiQueryTool {
  return createQueryTool({
    name: 'search_faq',
    description: 'Search frequently asked questions to find answers to common queries.',
    knowledgeBaseIds,
    topK: 3,
    queryingMessage: 'Let me check our FAQ...',
  })
}

/**
 * Creates a product information search tool
 */
export function createProductSearchTool(knowledgeBaseIds?: string[]): VapiQueryTool {
  return createQueryTool({
    name: 'search_products',
    description: 'Search product information, pricing, and specifications.',
    knowledgeBaseIds,
    topK: 5,
    queryingMessage: 'Let me look up that product information...',
  })
}

/**
 * Creates a policy/documentation search tool
 */
export function createPolicySearchTool(knowledgeBaseIds?: string[]): VapiQueryTool {
  return createQueryTool({
    name: 'search_policies',
    description: 'Search company policies, terms, and documentation.',
    knowledgeBaseIds,
    topK: 3,
    queryingMessage: 'Let me check our policies on that...',
  })
}

