/**
 * VAPI Call Control Tools
 * Export all call control tool builders and presets
 */

// EndCall Tool
export {
  createEndCallTool,
  createConditionalEndCallTool,
  DEFAULT_END_CALL_TOOL,
  SHORT_END_CALL_TOOL,
  SUPPORT_END_CALL_TOOL,
  SALES_END_CALL_TOOL,
  CONDITIONAL_END_CALL_TOOL,
  type EndCallToolOptions,
} from './end-call'

// TransferCall Tool
export {
  createTransferCallTool,
  createDepartmentTransferTool,
  createSipTransferTool,
  createConditionalTransferTool,
  DEFAULT_TRANSFER_CALL_TOOL,
  WARM_TRANSFER_CALL_TOOL,
  EMERGENCY_TRANSFER_TOOL,
  type TransferCallToolOptions,
} from './transfer-call'

// DTMF Tool
export {
  createDtmfTool,
  DEFAULT_DTMF_TOOL,
  IVR_DTMF_TOOL,
  ACCOUNT_ENTRY_DTMF_TOOL,
  EXTENSION_DTMF_TOOL,
  type DtmfToolOptions,
} from './dtmf'

// Handoff Tool
export {
  createHandoffTool,
  createAssistantHandoffTool,
  createSquadHandoffTool,
  DEFAULT_HANDOFF_TOOL,
  SPECIALIST_HANDOFF_TOOL,
  LANGUAGE_HANDOFF_TOOL,
  DEPARTMENT_HANDOFF_TOOL,
  type HandoffToolOptions,
} from './handoff'

