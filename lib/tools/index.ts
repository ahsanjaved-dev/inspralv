/**
 * Tools Module
 * 
 * Exports for the suggested parameters system.
 */

export {
  SUGGESTED_PARAMETERS,
  getAllSuggestedParameters,
  getSuggestedParametersByCategory,
  getParameterCategories,
} from "./registry"

export type {
  SuggestedParameter,
} from "./registry"

// Re-export handlers utilities
export {
  formatResultForSpeech,
  validateArguments,
  logToolExecution,
} from "./handlers"

export type {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolConfig,
} from "./handlers"
