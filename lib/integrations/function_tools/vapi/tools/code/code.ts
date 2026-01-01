/**
 * VAPI Code Tool
 * Tool for executing code during calls
 */

import type { VapiCodeTool, CodeToolRuntime } from '../../types'
import type { VapiToolMessage, ToolParameterSchema } from '../../../types'

// ============================================================================
// OPTIONS
// ============================================================================

export interface CodeToolOptions {
  /** Custom name for the tool */
  name?: string
  /** Description for the LLM */
  description?: string
  /** Runtime environment */
  runtime: CodeToolRuntime
  /** Code to execute */
  code: string
  /** Timeout in seconds (default: 10) */
  timeoutSeconds?: number
  /** Input parameters schema */
  parameters?: ToolParameterSchema
  /** Dependencies to install */
  dependencies?: string[]
  /** Message to speak during execution */
  executionMessage?: string
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a VAPI Code tool configuration
 */
export function createCodeTool(options: CodeToolOptions): VapiCodeTool {
  const {
    name = 'run_code',
    description = 'Execute code to perform calculations or data processing.',
    runtime,
    code,
    timeoutSeconds = 10,
    parameters,
    dependencies,
    executionMessage,
  } = options

  const tool: VapiCodeTool = {
    type: 'code',
    name,
    description,
    runtime,
    code,
    timeoutSeconds,
  }

  if (parameters) tool.parameters = parameters
  if (dependencies) tool.dependencies = dependencies

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
// NODE.JS PRESETS
// ============================================================================

/**
 * Creates a Node.js code tool
 */
export function createNodeCodeTool(
  code: string,
  options: Omit<CodeToolOptions, 'runtime' | 'code'> = {}
): VapiCodeTool {
  return createCodeTool({
    ...options,
    runtime: 'node18',
    code,
  })
}

/**
 * Creates a calculator code tool (Node.js)
 */
export function createCalculatorTool(): VapiCodeTool {
  const code = `
// Simple calculator that evaluates mathematical expressions
module.exports = async function(params) {
  const { expression } = params;
  
  // Sanitize input - only allow numbers and basic operators
  const sanitized = expression.replace(/[^0-9+\\-*/().\\s]/g, '');
  
  try {
    // Use Function constructor to safely evaluate
    const result = Function('"use strict"; return (' + sanitized + ')')();
    return { result: result, expression: sanitized };
  } catch (error) {
    return { error: 'Invalid expression', expression: sanitized };
  }
};
`.trim()

  return createCodeTool({
    name: 'calculate',
    description: 'Perform mathematical calculations. Supports basic arithmetic: +, -, *, /, and parentheses.',
    runtime: 'node18',
    code,
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'The mathematical expression to evaluate (e.g., "2 + 2", "100 * 0.15")',
        },
      },
      required: ['expression'],
    },
    executionMessage: 'Let me calculate that for you.',
  })
}

/**
 * Creates a date/time calculation tool (Node.js)
 */
export function createDateTimeTool(): VapiCodeTool {
  const code = `
const { addDays, format, parse, differenceInDays } = require('date-fns');

module.exports = async function(params) {
  const { operation, date, days, targetDate } = params;
  
  try {
    const baseDate = date ? new Date(date) : new Date();
    
    switch (operation) {
      case 'add_days':
        const newDate = addDays(baseDate, parseInt(days));
        return { result: format(newDate, 'yyyy-MM-dd'), day: format(newDate, 'EEEE') };
      
      case 'difference':
        const target = new Date(targetDate);
        const diff = differenceInDays(target, baseDate);
        return { days: diff, description: diff + ' days' };
      
      case 'format':
        return { 
          date: format(baseDate, 'MMMM d, yyyy'),
          day: format(baseDate, 'EEEE'),
          time: format(baseDate, 'h:mm a')
        };
      
      default:
        return { error: 'Unknown operation' };
    }
  } catch (error) {
    return { error: error.message };
  }
};
`.trim()

  return createCodeTool({
    name: 'date_time',
    description: 'Perform date and time calculations like adding days, finding differences between dates, or formatting dates.',
    runtime: 'node18',
    code,
    dependencies: ['date-fns'],
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          description: 'The operation to perform',
          enum: ['add_days', 'difference', 'format'],
        },
        date: {
          type: 'string',
          description: 'The base date in YYYY-MM-DD format (defaults to today)',
        },
        days: {
          type: 'integer',
          description: 'Number of days to add (for add_days operation)',
        },
        targetDate: {
          type: 'string',
          description: 'The target date for difference calculation',
        },
      },
      required: ['operation'],
    },
    executionMessage: 'Calculating the date...',
  })
}

// ============================================================================
// PYTHON PRESETS
// ============================================================================

/**
 * Creates a Python code tool
 */
export function createPythonCodeTool(
  code: string,
  options: Omit<CodeToolOptions, 'runtime' | 'code'> = {}
): VapiCodeTool {
  return createCodeTool({
    ...options,
    runtime: 'python3.11',
    code,
  })
}

/**
 * Creates a data analysis tool (Python)
 */
export function createDataAnalysisTool(): VapiCodeTool {
  const code = `
import json

def handler(params):
    numbers = params.get('numbers', [])
    
    if not numbers:
        return {"error": "No numbers provided"}
    
    # Calculate statistics
    n = len(numbers)
    total = sum(numbers)
    mean = total / n
    sorted_nums = sorted(numbers)
    
    # Median
    if n % 2 == 0:
        median = (sorted_nums[n//2 - 1] + sorted_nums[n//2]) / 2
    else:
        median = sorted_nums[n//2]
    
    # Min, Max, Range
    min_val = min(numbers)
    max_val = max(numbers)
    range_val = max_val - min_val
    
    return {
        "count": n,
        "sum": total,
        "mean": round(mean, 2),
        "median": median,
        "min": min_val,
        "max": max_val,
        "range": range_val
    }
`.trim()

  return createCodeTool({
    name: 'analyze_data',
    description: 'Analyze a list of numbers and provide statistics like mean, median, min, max, etc.',
    runtime: 'python3.11',
    code,
    parameters: {
      type: 'object',
      properties: {
        numbers: {
          type: 'array',
          description: 'List of numbers to analyze',
          items: { type: 'number' },
        },
      },
      required: ['numbers'],
    },
    executionMessage: 'Analyzing the data...',
  })
}

