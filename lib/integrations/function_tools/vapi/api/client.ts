/**
 * VAPI Tools API Client
 * Handles CRUD operations for VAPI tools via the /tool endpoint
 */

import type { VapiTool, VapiToolWithMetadata, CreateVapiToolPayload, UpdateVapiToolPayload } from '../types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const VAPI_BASE_URL = 'https://api.vapi.ai'

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface VapiToolsApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  statusCode?: number
}

// ============================================================================
// CREATE TOOL
// ============================================================================

/**
 * Create a new tool in VAPI
 * POST /tool
 */
export async function createVapiTool(
  payload: CreateVapiToolPayload,
  apiKey: string
): Promise<VapiToolsApiResponse<VapiToolWithMetadata>> {
  try {
    console.log('[VapiToolsAPI] Creating tool:', payload.type)
    
    const response = await fetch(`${VAPI_BASE_URL}/tool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[VapiToolsAPI] Create error:', response.status, errorData)
      return {
        success: false,
        error: errorData.message || errorData.error || `VAPI API error: ${response.status}`,
        statusCode: response.status,
      }
    }

    const data = await response.json()
    console.log('[VapiToolsAPI] Tool created:', data.id)
    return { success: true, data, statusCode: response.status }
  } catch (error) {
    console.error('[VapiToolsAPI] Create exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// LIST TOOLS
// ============================================================================

/**
 * List all tools in VAPI account
 * GET /tool
 */
export async function listVapiTools(
  apiKey: string,
  options?: {
    limit?: number
    offset?: number
  }
): Promise<VapiToolsApiResponse<VapiToolWithMetadata[]>> {
  try {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.offset) params.set('offset', String(options.offset))
    
    const url = `${VAPI_BASE_URL}/tool${params.toString() ? `?${params}` : ''}`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.message || errorData.error || `VAPI API error: ${response.status}`,
        statusCode: response.status,
      }
    }

    const data = await response.json()
    return { success: true, data, statusCode: response.status }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// GET TOOL
// ============================================================================

/**
 * Get a specific tool by ID
 * GET /tool/:id
 */
export async function getVapiTool(
  toolId: string,
  apiKey: string
): Promise<VapiToolsApiResponse<VapiToolWithMetadata>> {
  try {
    const response = await fetch(`${VAPI_BASE_URL}/tool/${toolId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.message || errorData.error || `VAPI API error: ${response.status}`,
        statusCode: response.status,
      }
    }

    const data = await response.json()
    return { success: true, data, statusCode: response.status }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// UPDATE TOOL
// ============================================================================

/**
 * Update an existing tool
 * PATCH /tool/:id
 */
export async function updateVapiTool(
  toolId: string,
  payload: UpdateVapiToolPayload,
  apiKey: string
): Promise<VapiToolsApiResponse<VapiToolWithMetadata>> {
  try {
    console.log('[VapiToolsAPI] Updating tool:', toolId)
    
    const response = await fetch(`${VAPI_BASE_URL}/tool/${toolId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[VapiToolsAPI] Update error:', response.status, errorData)
      return {
        success: false,
        error: errorData.message || errorData.error || `VAPI API error: ${response.status}`,
        statusCode: response.status,
      }
    }

    const data = await response.json()
    console.log('[VapiToolsAPI] Tool updated:', data.id)
    return { success: true, data, statusCode: response.status }
  } catch (error) {
    console.error('[VapiToolsAPI] Update exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// DELETE TOOL
// ============================================================================

/**
 * Delete a tool
 * DELETE /tool/:id
 */
export async function deleteVapiTool(
  toolId: string,
  apiKey: string
): Promise<VapiToolsApiResponse<void>> {
  try {
    console.log('[VapiToolsAPI] Deleting tool:', toolId)
    
    const response = await fetch(`${VAPI_BASE_URL}/tool/${toolId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[VapiToolsAPI] Delete error:', response.status, errorData)
      return {
        success: false,
        error: errorData.message || errorData.error || `VAPI API error: ${response.status}`,
        statusCode: response.status,
      }
    }

    console.log('[VapiToolsAPI] Tool deleted:', toolId)
    return { success: true, statusCode: response.status }
  } catch (error) {
    console.error('[VapiToolsAPI] Delete exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Create multiple tools in parallel
 */
export async function createVapiToolsBatch(
  tools: CreateVapiToolPayload[],
  apiKey: string
): Promise<VapiToolsApiResponse<VapiToolWithMetadata[]>> {
  try {
    const results = await Promise.all(
      tools.map((tool) => createVapiTool(tool, apiKey))
    )
    
    const successfulTools = results
      .filter((r) => r.success && r.data)
      .map((r) => r.data!)
    
    const errors = results
      .filter((r) => !r.success)
      .map((r) => r.error)
    
    if (errors.length > 0) {
      console.warn('[VapiToolsAPI] Some tools failed to create:', errors)
    }
    
    return {
      success: errors.length === 0,
      data: successfulTools,
      error: errors.length > 0 ? `${errors.length} tools failed to create` : undefined,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Delete multiple tools in parallel
 */
export async function deleteVapiToolsBatch(
  toolIds: string[],
  apiKey: string
): Promise<VapiToolsApiResponse<void>> {
  try {
    const results = await Promise.all(
      toolIds.map((id) => deleteVapiTool(id, apiKey))
    )
    
    const errors = results
      .filter((r) => !r.success)
      .map((r) => r.error)
    
    if (errors.length > 0) {
      console.warn('[VapiToolsAPI] Some tools failed to delete:', errors)
    }
    
    return {
      success: errors.length === 0,
      error: errors.length > 0 ? `${errors.length} tools failed to delete` : undefined,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

