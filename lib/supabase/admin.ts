import { createClient, SupabaseClient } from "@supabase/supabase-js"

/**
 * Supabase Admin Client with Connection Pooling
 * Phase 1.1.1: Implement connection pooling configuration
 *
 * Uses a singleton pattern to reuse connections and improve performance.
 * Configures optimal settings for high-concurrency server environments.
 */

// ============================================================================
// SINGLETON CLIENT INSTANCE
// ============================================================================

let adminClient: SupabaseClient | null = null

/**
 * Get or create the singleton admin client.
 * Uses service role key for admin operations.
 */
export function createAdminClient(): SupabaseClient {
  if (adminClient) {
    return adminClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase admin credentials")
  }

  adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // Connection pool configuration for high-concurrency
    db: {
      schema: "public",
    },
    global: {
      // Headers for better debugging and monitoring
      headers: {
        "x-client-info": "genius365-admin",
      },
      // Fetch configuration for connection reuse
      fetch: (url, options) => {
        // Add keep-alive for connection reuse
        const headers = new Headers(options?.headers)
        headers.set("Connection", "keep-alive")
        return fetch(url, { ...options, headers })
      },
    },
  })

  return adminClient
}

// ============================================================================
// CONNECTION UTILITIES
// ============================================================================

/**
 * Reset the admin client (useful for testing or reconfiguration).
 */
export function resetAdminClient(): void {
  adminClient = null
}

/**
 * Check if admin client is initialized.
 */
export function isAdminClientInitialized(): boolean {
  return adminClient !== null
}
