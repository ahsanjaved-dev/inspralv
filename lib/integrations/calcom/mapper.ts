/**
 * Cal.com to Retell Mapper
 * 
 * Maps internal Cal.com tool configuration to Retell's native Cal.com tool format
 */

import type { FunctionTool } from "@/types/database.types"
import { getWorkspaceCalcomIntegration } from "./index"
import { logger } from "@/lib/logger"

const log = logger.child({ module: "CalcomMapper" })

// ============================================================================
// TYPES
// ============================================================================

/**
 * Retell Cal.com tool format (native integration)
 * Reference: Retell API documentation
 */
export interface RetellCalcomTool {
  type: "check_availability_cal" | "book_appointment_cal"
  name: string
  description: string
  cal_api_key: string
  event_type_id: number
  timezone?: string
  custom_fields?: Array<{
    name: string
    type: "text" | "email" | "phone" | "number" | "textarea" | "select"
    label: string
    required: boolean
    options?: string[]
  }>
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a tool is a Cal.com tool
 */
export function isCalcomTool(tool: FunctionTool): boolean {
  return (
    tool.tool_type === "check_availability_cal" ||
    tool.tool_type === "book_appointment_cal"
  )
}

/**
 * Filter enabled Cal.com tools from a tools array
 */
export function getEnabledCalcomTools(tools: FunctionTool[]): FunctionTool[] {
  return tools.filter(
    (t) =>
      t.enabled !== false &&
      (t.tool_type === "check_availability_cal" || t.tool_type === "book_appointment_cal")
  )
}

// ============================================================================
// MAPPING FUNCTION
// ============================================================================

/**
 * Map internal Cal.com tools to Retell's native Cal.com tool format
 * 
 * This function:
 * 1. Filters for enabled Cal.com tools
 * 2. Fetches the workspace's Cal.com integration
 * 3. Maps each tool to Retell's format with the API key
 * 
 * @param tools - Array of function tools from agent config
 * @param workspaceId - Workspace ID to fetch Cal.com integration
 * @returns Array of Retell Cal.com tools
 */
export async function mapCalcomToolsToRetell(
  tools: FunctionTool[],
  workspaceId: string | null | undefined
): Promise<RetellCalcomTool[]> {
  // Filter Cal.com tools
  const calcomTools = getEnabledCalcomTools(tools)

  if (calcomTools.length === 0) {
    log.debug("No Cal.com tools found")
    return []
  }

  if (!workspaceId) {
    log.warn("No workspace_id provided, cannot fetch Cal.com integration")
    return []
  }

  // Fetch Cal.com integration from workspace
  const integration = await getWorkspaceCalcomIntegration(workspaceId)

  if (!integration) {
    log.warn("No Cal.com integration found for workspace", { workspaceId })
    return []
  }

  // The API key is stored in default_secret_key field per workspace integration schema
  const apiKey = integration.api_keys?.default_secret_key

  if (!apiKey) {
    log.error("Cal.com integration missing API key", { integrationId: integration.id })
    return []
  }

  log.info("Mapping Cal.com tools to Retell format", {
    workspaceId,
    toolCount: calcomTools.length,
    toolTypes: calcomTools.map((t) => t.tool_type),
  })

  // Map to Retell format
  const retellTools: RetellCalcomTool[] = calcomTools
    .map((tool) => {
      // Validate required fields
      if (!tool.event_type_id) {
        log.warn("Cal.com tool missing event_type_id", { toolId: tool.id, toolName: tool.name })
        return null
      }

      const retellTool: RetellCalcomTool = {
        type: tool.tool_type as "check_availability_cal" | "book_appointment_cal",
        name: tool.name,
        description: tool.description,
        cal_api_key: apiKey,
        event_type_id: tool.event_type_id,
      }

      // Add optional timezone
      if (tool.timezone) {
        retellTool.timezone = tool.timezone
      }

      // Add custom fields if present
      if (tool.custom_fields && tool.custom_fields.length > 0) {
        retellTool.custom_fields = tool.custom_fields
      }

      log.debug("Mapped Cal.com tool", {
        toolName: tool.name,
        toolType: tool.tool_type,
        eventTypeId: tool.event_type_id,
        hasCustomFields: !!tool.custom_fields?.length,
      })

      return retellTool
    })
    .filter((t): t is RetellCalcomTool => t !== null)

  log.info("Successfully mapped Cal.com tools", {
    inputCount: calcomTools.length,
    outputCount: retellTools.length,
  })

  return retellTools
}

/**
 * Map a single Cal.com tool to Retell format
 * 
 * Note: This requires fetching the workspace integration, so it's async.
 * For batch mapping, use mapCalcomToolsToRetell instead.
 */
export async function mapCalcomToolToRetell(
  tool: FunctionTool,
  workspaceId: string
): Promise<RetellCalcomTool | null> {
  const tools = await mapCalcomToolsToRetell([tool], workspaceId)
  return tools[0] || null
}

/**
 * Check if an agent has Cal.com tools that need mapping
 */
export function hasCalcomTools(tools: FunctionTool[]): boolean {
  return getEnabledCalcomTools(tools).length > 0
}

