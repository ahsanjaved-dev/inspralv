/**
 * VAPI SIP Trunk API
 * Handles SIP trunk credential management via VAPI
 * 
 * @see https://docs.vapi.ai/advanced/sip/sip-trunk
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const VAPI_BASE_URL = "https://api.vapi.ai"

// ============================================================================
// TYPES
// ============================================================================

export interface VapiSipTrunkCredential {
  id: string
  orgId: string
  provider: "byo-sip-trunk"
  name?: string
  sipTrunkAuthenticationPlan?: {
    type: "credentials"
    sipTrunkAuthenticationCredentials: {
      username: string
      password: string
    }
  }
  sipTrunkOutboundAuthenticationPlan?: {
    type: "credentials"
    sipTrunkOutboundAuthenticationCredentials: {
      username: string
      password: string
    }
  }
  gateways: {
    ip: string
    port?: number
    netmask?: number
    inboundEnabled?: boolean
    outboundEnabled?: boolean
    outboundProtocol?: "udp" | "tcp" | "tls"
  }[]
  outboundLeadingPlusEnabled?: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateVapiSipTrunkParams {
  apiKey: string
  name?: string
  sipServer: string
  sipPort?: number
  sipUsername: string
  sipPassword: string
  sipTransport?: "udp" | "tcp" | "tls"
  inboundEnabled?: boolean
  outboundEnabled?: boolean
  outboundLeadingPlusEnabled?: boolean
}

export interface VapiSipTrunkResponse {
  success: boolean
  data?: VapiSipTrunkCredential
  error?: string
}

export interface VapiSipTrunkListResponse {
  success: boolean
  data?: VapiSipTrunkCredential[]
  error?: string
}

// ============================================================================
// CREATE SIP TRUNK CREDENTIAL
// ============================================================================

/**
 * Create a BYO SIP trunk credential in Vapi.
 * This credential can then be used to create BYO phone numbers.
 */
export async function createSipTrunkCredential(
  params: CreateVapiSipTrunkParams
): Promise<VapiSipTrunkResponse> {
  const {
    apiKey,
    name,
    sipServer,
    sipPort = 5060,
    sipUsername,
    sipPassword,
    sipTransport = "udp",
    inboundEnabled = true,
    outboundEnabled = true,
    outboundLeadingPlusEnabled = true,
  } = params

  try {
    console.log("[VapiSipTrunk] Creating SIP trunk credential for server:", sipServer)

    // Vapi BYO SIP trunk requires:
    // - gateways array with IP/domain
    // - outboundAuthenticationPlan with authUsername and authPassword for SIP auth
    const payload: Record<string, unknown> = {
      provider: "byo-sip-trunk",
      name: name || `SIP Trunk - ${sipServer}`,
      gateways: [
        {
          ip: sipServer,
          port: sipPort,
          inboundEnabled,
          outboundEnabled,
          outboundProtocol: sipTransport,
        },
      ],
      outboundLeadingPlusEnabled,
    }

    // Add authentication if credentials provided
    if (sipUsername && sipPassword) {
      payload.outboundAuthenticationPlan = {
        authUsername: sipUsername,
        authPassword: sipPassword,
      }
    }

    console.log("[VapiSipTrunk] Payload:", JSON.stringify(payload, null, 2))

    const response = await fetch(`${VAPI_BASE_URL}/credential`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiSipTrunk] Create error:", errorData)
      // Handle error message that may be an array or string
      let errorMessage = `VAPI API error: ${response.status} ${response.statusText}`
      if (errorData.message) {
        errorMessage = Array.isArray(errorData.message) 
          ? errorData.message.join(", ") 
          : errorData.message
      }
      return {
        success: false,
        error: errorMessage,
      }
    }

    const data = await response.json()
    console.log("[VapiSipTrunk] SIP trunk credential created:", data.id)

    return {
      success: true,
      data: data as VapiSipTrunkCredential,
    }
  } catch (error) {
    console.error("[VapiSipTrunk] Create exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error creating SIP trunk credential",
    }
  }
}

// ============================================================================
// GET SIP TRUNK CREDENTIAL
// ============================================================================

export async function getSipTrunkCredential(params: {
  apiKey: string
  credentialId: string
}): Promise<VapiSipTrunkResponse> {
  const { apiKey, credentialId } = params

  try {
    const response = await fetch(`${VAPI_BASE_URL}/credential/${credentialId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiSipTrunk] Get error:", errorData)
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    const data = await response.json()
    return {
      success: true,
      data: data as VapiSipTrunkCredential,
    }
  } catch (error) {
    console.error("[VapiSipTrunk] Get exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error getting SIP trunk credential",
    }
  }
}

// ============================================================================
// LIST SIP TRUNK CREDENTIALS
// ============================================================================

export async function listSipTrunkCredentials(params: {
  apiKey: string
  limit?: number
}): Promise<VapiSipTrunkListResponse> {
  const { apiKey, limit = 100 } = params

  try {
    const url = new URL(`${VAPI_BASE_URL}/credential`)
    url.searchParams.set("limit", limit.toString())

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiSipTrunk] List error:", errorData)
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    const data = await response.json()
    // Filter to only BYO SIP trunk credentials
    const sipTrunkCredentials = (data as VapiSipTrunkCredential[]).filter(
      (c) => c.provider === "byo-sip-trunk"
    )

    return {
      success: true,
      data: sipTrunkCredentials,
    }
  } catch (error) {
    console.error("[VapiSipTrunk] List exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error listing SIP trunk credentials",
    }
  }
}

// ============================================================================
// UPDATE SIP TRUNK CREDENTIAL
// ============================================================================

export async function updateSipTrunkCredential(params: {
  apiKey: string
  credentialId: string
  name?: string
  sipServer?: string
  sipPort?: number
  sipUsername?: string
  sipPassword?: string
  sipTransport?: "udp" | "tcp" | "tls"
  inboundEnabled?: boolean
  outboundEnabled?: boolean
}): Promise<VapiSipTrunkResponse> {
  const {
    apiKey,
    credentialId,
    name,
    sipServer,
    sipPort,
    sipUsername,
    sipPassword,
    sipTransport,
    inboundEnabled,
    outboundEnabled,
  } = params

  try {
    console.log("[VapiSipTrunk] Updating SIP trunk credential:", credentialId)

    const payload: Record<string, unknown> = {}

    if (name !== undefined) {
      payload.name = name
    }

    // Credentials are now passed at gateway level, not at the top level

    // Update gateway if server details or credentials provided
    if (sipServer || sipPort || sipTransport || inboundEnabled !== undefined || outboundEnabled !== undefined || sipUsername || sipPassword) {
      // Need to get current config first to merge
      const currentResult = await getSipTrunkCredential({ apiKey, credentialId })
      if (!currentResult.success || !currentResult.data) {
        return {
          success: false,
          error: currentResult.error || "Failed to get current SIP trunk config",
        }
      }

      const currentGateway = currentResult.data.gateways?.[0] || {}
      
      const gatewayPayload = {
        ip: sipServer || currentGateway.ip,
        port: sipPort ?? currentGateway.port ?? 5060,
        inboundEnabled: inboundEnabled ?? currentGateway.inboundEnabled ?? true,
        outboundEnabled: outboundEnabled ?? currentGateway.outboundEnabled ?? true,
        outboundProtocol: sipTransport || currentGateway.outboundProtocol || "udp",
      }

      payload.gateways = [gatewayPayload]
    }

    // Add authentication if credentials provided
    if (sipUsername && sipPassword) {
      payload.outboundAuthenticationPlan = {
        authUsername: sipUsername,
        authPassword: sipPassword,
      }
    }

    const response = await fetch(`${VAPI_BASE_URL}/credential/${credentialId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiSipTrunk] Update error:", errorData)
      // Handle error message that may be an array or string
      let errorMessage = `VAPI API error: ${response.status} ${response.statusText}`
      if (errorData.message) {
        errorMessage = Array.isArray(errorData.message) 
          ? errorData.message.join(", ") 
          : errorData.message
      }
      return {
        success: false,
        error: errorMessage,
      }
    }

    const data = await response.json()
    console.log("[VapiSipTrunk] SIP trunk credential updated successfully")

    return {
      success: true,
      data: data as VapiSipTrunkCredential,
    }
  } catch (error) {
    console.error("[VapiSipTrunk] Update exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error updating SIP trunk credential",
    }
  }
}

// ============================================================================
// DELETE SIP TRUNK CREDENTIAL
// ============================================================================

export async function deleteSipTrunkCredential(params: {
  apiKey: string
  credentialId: string
}): Promise<{ success: boolean; error?: string }> {
  const { apiKey, credentialId } = params

  try {
    console.log("[VapiSipTrunk] Deleting SIP trunk credential:", credentialId)

    const response = await fetch(`${VAPI_BASE_URL}/credential/${credentialId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiSipTrunk] Delete error:", errorData)
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    console.log("[VapiSipTrunk] SIP trunk credential deleted successfully")
    return { success: true }
  } catch (error) {
    console.error("[VapiSipTrunk] Delete exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error deleting SIP trunk credential",
    }
  }
}

