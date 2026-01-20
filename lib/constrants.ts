// Query keys for React Query
export const QUERY_KEYS = {
  agents: "agents",
  organization: "organization",
  dashboardStats: "dashboard-stats",
  conversations: "conversations",
  integrations: "integrations",
  usage: "usage",
  invoices: "invoices",
} as const

// API endpoints
export const API_ROUTES = {
  agents: "/api/agents",
  organizations: "/api/organizations",
  dashboardStats: "/api/dashboard/stats",
  authSignup: "/api/auth/signup",
} as const

// Pagination defaults
export const PAGINATION = {
  defaultPage: 1,
  defaultPageSize: 10,
  maxPageSize: 100,
} as const

// Provider display names
export const PROVIDER_NAMES: Record<string, string> = {
  vapi: "Vapi",
  retell: "Retell AI",
  elevenlabs: "ElevenLabs",
  deepgram: "Deepgram",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  groq: "Groq",
  azure: "Azure",
  cartesia: "Cartesia",
  assemblyai: "AssemblyAI",
}
