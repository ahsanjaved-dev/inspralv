/**
 * VAPI Custom Function Tool Sync
 * Creates/updates VAPI "function" tools via the /tool API and returns toolIds.
 *
 * This enables the "API Alternative" flow:
 * - POST /tool to create tools
 * - PATCH /assistant/:id to attach toolIds to an assistant's model
 */

import type { FunctionTool } from "@/types/database.types"
import type { ToolParameterSchema } from "../../types"
import { createFunctionTool } from "../tools/api/function"
import { createVapiTool, updateVapiTool } from "./client"

export interface SyncVapiFunctionToolsResult {
  tools: FunctionTool[]
  toolIds: string[]
  errors: string[]
}

function isCustomFunctionTool(tool: FunctionTool): boolean {
  return (tool.tool_type ?? "function") === "function"
}

export async function syncVapiFunctionTools(
  tools: FunctionTool[],
  apiKey: string,
  options?: { defaultServerUrl?: string }
): Promise<SyncVapiFunctionToolsResult> {
  const errors: string[] = []
  const toolIds: string[] = []

  const nextTools: FunctionTool[] = []

  for (const tool of tools) {
    // Keep non-function tools untouched
    if (!isCustomFunctionTool(tool)) {
      nextTools.push(tool)
      continue
    }

    // Skip disabled tools (but keep them in config)
    if (tool.enabled === false) {
      nextTools.push(tool)
      continue
    }

    const serverUrl = tool.server_url || options?.defaultServerUrl
    if (!serverUrl) {
      errors.push(`Tool "${tool.name}" is missing a server URL (server_url or tools_server_url).`)
      nextTools.push(tool)
      continue
    }

    const payload = createFunctionTool({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as unknown as ToolParameterSchema,
      server: { url: serverUrl },
      async: tool.async,
      executionMessage: tool.speak_during_execution ? tool.execution_message : undefined,
    })

    // Update existing tool (or recreate if missing)
    if (tool.external_tool_id) {
      const update = await updateVapiTool(tool.external_tool_id, payload, apiKey)

      if (update.success && update.data?.id) {
        toolIds.push(update.data.id)
        nextTools.push(tool)
        continue
      }

      // If update failed (e.g. tool was deleted), fall back to creating a new tool
      const created = await createVapiTool(payload, apiKey)
      if (created.success && created.data?.id) {
        toolIds.push(created.data.id)
        nextTools.push({ ...tool, external_tool_id: created.data.id })
        continue
      }

      errors.push(
        `Failed to sync tool "${tool.name}" (update failed: ${update.error || "unknown"}, create failed: ${created.error || "unknown"}).`
      )
      nextTools.push(tool)
      continue
    }

    // Create new tool
    const created = await createVapiTool(payload, apiKey)
    if (created.success && created.data?.id) {
      toolIds.push(created.data.id)
      nextTools.push({ ...tool, external_tool_id: created.data.id })
      continue
    }

    errors.push(`Failed to create tool "${tool.name}": ${created.error || "unknown error"}.`)
    nextTools.push(tool)
  }

  // Include IDs for any tools that already have them (even if disabled tools are skipped above)
  for (const t of nextTools) {
    if (isCustomFunctionTool(t) && t.enabled !== false && t.external_tool_id) {
      if (!toolIds.includes(t.external_tool_id)) toolIds.push(t.external_tool_id)
    }
  }

  return { tools: nextTools, toolIds, errors }
}


