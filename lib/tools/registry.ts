/**
 * Tool Registry
 * 
 * Provides suggested parameters for custom function tools.
 * Users can add these with one click or define their own.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SuggestedParameter {
  name: string
  type: "string" | "number" | "integer" | "boolean"
  description: string
  category: "contact" | "order" | "general" | "appointment"
}

// ============================================================================
// SUGGESTED PARAMETERS
// ============================================================================

export const SUGGESTED_PARAMETERS: SuggestedParameter[] = [
  // Contact Information
  {
    name: "caller_name",
    type: "string",
    description: "Full name of the caller",
    category: "contact",
  },
  {
    name: "phone_number",
    type: "string",
    description: "Phone number of the caller",
    category: "contact",
  },
  {
    name: "email",
    type: "string",
    description: "Email address of the caller",
    category: "contact",
  },
  {
    name: "company",
    type: "string",
    description: "Company or organization name",
    category: "contact",
  },
  {
    name: "address",
    type: "string",
    description: "Physical address",
    category: "contact",
  },
  // Order Related
  {
    name: "product_name",
    type: "string",
    description: "Name of the product or service",
    category: "order",
  },
  {
    name: "quantity",
    type: "integer",
    description: "Number of items",
    category: "order",
  },
  {
    name: "order_id",
    type: "string",
    description: "Order ID or reference number",
    category: "order",
  },
  {
    name: "price",
    type: "number",
    description: "Price amount",
    category: "order",
  },
  // Appointment Related
  {
    name: "preferred_date",
    type: "string",
    description: "Preferred date in YYYY-MM-DD format",
    category: "appointment",
  },
  {
    name: "preferred_time",
    type: "string",
    description: "Preferred time in HH:MM format",
    category: "appointment",
  },
  {
    name: "appointment_type",
    type: "string",
    description: "Type of appointment (e.g., consultation, follow-up)",
    category: "appointment",
  },
  // General
  {
    name: "notes",
    type: "string",
    description: "Additional notes or comments",
    category: "general",
  },
  {
    name: "reason",
    type: "string",
    description: "Reason or purpose",
    category: "general",
  },
  {
    name: "priority",
    type: "string",
    description: "Priority level (low, medium, high)",
    category: "general",
  },
  {
    name: "status",
    type: "string",
    description: "Current status",
    category: "general",
  },
  {
    name: "reference_id",
    type: "string",
    description: "Reference ID or confirmation number",
    category: "general",
  },
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all suggested parameters
 */
export function getAllSuggestedParameters(): SuggestedParameter[] {
  return SUGGESTED_PARAMETERS
}

/**
 * Get suggested parameters by category
 */
export function getSuggestedParametersByCategory(
  category: SuggestedParameter["category"]
): SuggestedParameter[] {
  return SUGGESTED_PARAMETERS.filter((param) => param.category === category)
}

/**
 * Get suggested parameter categories
 */
export function getParameterCategories(): {
  key: SuggestedParameter["category"]
  label: string
}[] {
  return [
    { key: "contact", label: "Contact Info" },
    { key: "order", label: "Order Info" },
    { key: "appointment", label: "Appointment" },
    { key: "general", label: "General" },
  ]
}

export default SUGGESTED_PARAMETERS

