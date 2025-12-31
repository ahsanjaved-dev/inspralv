/**
 * VAPI Bash Tool
 * Tool for executing bash commands during calls
 */

import type { VapiBashTool } from '../../types'
import type { VapiToolMessage } from '../../../types'

// ============================================================================
// OPTIONS
// ============================================================================

export interface BashToolOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** Command to execute */
  command?: string
  /** Timeout in seconds (default: 10) */
  timeoutSeconds?: number
  /** Working directory */
  workingDirectory?: string
  /** Message to speak during execution */
  executionMessage?: string
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a VAPI Bash tool configuration
 */
export function createBashTool(options: BashToolOptions = {}): VapiBashTool {
  const {
    name = 'run_command',
    description = 'Execute a bash command to perform system operations.',
    command,
    timeoutSeconds = 10,
    workingDirectory,
    executionMessage,
  } = options

  const tool: VapiBashTool = {
    type: 'bash',
    name,
    description,
    timeoutSeconds,
  }

  if (command) tool.command = command
  if (workingDirectory) tool.workingDirectory = workingDirectory

  if (executionMessage) {
    tool.messages = [
      {
        type: 'request-start',
        content: executionMessage,
        blocking: false,
      },
    ]
  }

  return tool
}

// ============================================================================
// PRESETS
// ============================================================================

/**
 * Default bash tool
 */
export const DEFAULT_BASH_TOOL = createBashTool()

/**
 * Creates a file listing tool
 */
export function createFileListTool(directory?: string): VapiBashTool {
  return createBashTool({
    name: 'list_files',
    description: 'List files in a directory.',
    command: directory ? `ls -la ${directory}` : undefined,
    workingDirectory: directory,
    executionMessage: 'Checking the files...',
  })
}

/**
 * Creates a system info tool
 */
export function createSystemInfoTool(): VapiBashTool {
  return createBashTool({
    name: 'system_info',
    description: 'Get system information like disk usage, memory, and uptime.',
    command: 'echo "Disk:"; df -h | head -5; echo "Memory:"; free -h; echo "Uptime:"; uptime',
    executionMessage: 'Checking system status...',
  })
}

/**
 * Creates a network check tool
 */
export function createNetworkCheckTool(): VapiBashTool {
  return createBashTool({
    name: 'check_network',
    description: 'Check network connectivity and status.',
    command: 'echo "IP:"; hostname -I; echo "DNS:"; cat /etc/resolv.conf | grep nameserver',
    executionMessage: 'Checking network...',
    timeoutSeconds: 5,
  })
}

