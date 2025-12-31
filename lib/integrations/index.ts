/**
 * Integrations Module
 * Phase 7: Integration Improvements
 *
 * Exports circuit breakers, retry logic, webhook utilities,
 * provider-specific integrations (VAPI, Retell),
 * and the new function_tools system for comprehensive tool management.
 */

export * from "./circuit-breaker"
export * from "./retry"
export * from "./webhook"

// Function Tools - New comprehensive tool system
export * as functionTools from "./function_tools"

// VAPI exports
export {
  mapToVapi,
  mapFromVapi,
  mapToolToVapi,
  mapToolsToVapi,
  type VapiAssistantPayload,
  type VapiAssistantResponse,
  type VapiTool,
  type VapiToolMessage,
  type VapiFunctionDefinition,
  type VapiToolServer,
} from "./vapi/agent/mapper"

export { safeVapiSync, shouldSyncToVapi, type VapiSyncResult } from "./vapi/agent/sync"

// Retell exports
export {
  mapToRetellLLM,
  mapToRetellAgent,
  mapFromRetell,
  mapToolToRetell,
  mapToolsToRetell,
  type RetellLLMPayload,
  type RetellLLMResponse,
  type RetellAgentPayload,
  type RetellAgentResponse,
  type RetellGeneralTool,
} from "./retell/agent/mapper"

export { safeRetellSync, shouldSyncToRetell, type RetellSyncResult } from "./retell/agent/sync"

