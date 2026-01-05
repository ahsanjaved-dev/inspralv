/**
 * VAPI Phone Numbers API
 * Handles phone number provisioning and management via VAPI
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const VAPI_BASE_URL = "https://api.vapi.ai"

// ============================================================================
// TYPES
// ============================================================================

export interface VapiPhoneNumber {
  id: string
  orgId: string
  provider: "vapi" | "twilio" | "vonage" | "telnyx" | "byo-phone-number"
  number?: string
  sipUri?: string
  name?: string
  status?: "active" | "activating" | "blocked"
  assistantId?: string | null
  squadId?: string | null
  workflowId?: string | null
  credentialId?: string  // For BYO phone numbers linked to SIP trunk
  createdAt: string
  updatedAt: string
}

export interface ByoPhoneNumberParams {
  /** Vapi API key */
  apiKey: string
  /** E.164 phone number (e.g., +15551234567) */
  number: string
  /** SIP trunk credential ID */
  credentialId: string
  /** Optional name/label for the phone number */
  name?: string
  /** Whether to validate E164 format (default: true) */
  numberE164CheckEnabled?: boolean
}

export interface VapiPhoneNumberResponse {
  success: boolean
  data?: VapiPhoneNumber
  error?: string
}

export interface VapiPhoneNumberListResponse {
  success: boolean
  data?: VapiPhoneNumber[]
  error?: string
}

// ============================================================================
// LIST PHONE NUMBERS
// ============================================================================

export async function listPhoneNumbers(params: {
  apiKey: string
  limit?: number
}): Promise<VapiPhoneNumberListResponse> {
  const { apiKey, limit = 100 } = params

  try {
    const url = new URL(`${VAPI_BASE_URL}/phone-number`)
    url.searchParams.set("limit", limit.toString())

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiPhoneNumbers] List error:", errorData)
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    const data: VapiPhoneNumber[] = await response.json()
    return {
      success: true,
      data,
    }
  } catch (error) {
    console.error("[VapiPhoneNumbers] List exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error listing phone numbers",
    }
  }
}

// ============================================================================
// CREATE FREE US PHONE NUMBER
// ============================================================================

export async function createFreeUsPhoneNumber(params: {
  apiKey: string
  name?: string
}): Promise<VapiPhoneNumberResponse> {
  const { apiKey, name } = params

  try {
    console.log("[VapiPhoneNumbers] Creating free US phone number...")

    const payload: Record<string, unknown> = {
      provider: "vapi",
      // Not specifying numberDesiredAreaCode - let Vapi assign
    }

    if (name) {
      payload.name = name
    }

    const response = await fetch(`${VAPI_BASE_URL}/phone-number`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiPhoneNumbers] Create error:", errorData)
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    const data = await response.json()
    console.log("[VapiPhoneNumbers] Full Vapi create response:", JSON.stringify(data, null, 2))
    
    // According to Vapi docs:
    // - `number`: Optional PSTN phone number (only for purchased numbers)
    // - `sipUri`: SIP URI for inbound calls (may not be returned for free numbers)
    // For free Vapi numbers, we need to construct the SIP URI from the ID
    // Format: sip:{id}@sip.vapi.ai
    const constructedSipUri = data.sipUri || `sip:${data.id}@sip.vapi.ai`
    
    console.log("[VapiPhoneNumbers] Created phone - ID:", data.id, "Status:", data.status, "Number:", data.number, "SipUri:", constructedSipUri)
    
    return {
      success: true,
      data: {
        id: data.id,
        orgId: data.orgId,
        provider: data.provider,
        number: data.number || null, // PSTN number (may be null for free SIP numbers)
        sipUri: constructedSipUri, // SIP URI - constructed if not provided
        name: data.name,
        status: data.status,
        assistantId: data.assistantId,
        squadId: data.squadId,
        workflowId: data.workflowId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as VapiPhoneNumber,
    }
  } catch (error) {
    console.error("[VapiPhoneNumbers] Create exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error creating phone number",
    }
  }
}

// ============================================================================
// ATTACH PHONE NUMBER TO ASSISTANT
// ============================================================================

export async function attachPhoneNumberToAssistant(params: {
  apiKey: string
  phoneNumberId: string
  assistantId: string | null
}): Promise<VapiPhoneNumberResponse> {
  const { apiKey, phoneNumberId, assistantId } = params

  try {
    console.log(
      "[VapiPhoneNumbers] Attaching phone number",
      phoneNumberId,
      "to assistant",
      assistantId
    )

    const payload: Record<string, unknown> = {
      assistantId: assistantId,
    }

    const response = await fetch(`${VAPI_BASE_URL}/phone-number/${phoneNumberId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiPhoneNumbers] Attach error:", errorData)
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    const data: VapiPhoneNumber = await response.json()
    console.log("[VapiPhoneNumbers] Phone number attached successfully")
    return {
      success: true,
      data,
    }
  } catch (error) {
    console.error("[VapiPhoneNumbers] Attach exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error attaching phone number",
    }
  }
}

// ============================================================================
// GET PHONE NUMBER BY ID
// ============================================================================

export async function getPhoneNumber(params: {
  apiKey: string
  phoneNumberId: string
}): Promise<VapiPhoneNumberResponse> {
  const { apiKey, phoneNumberId } = params

  try {
    const response = await fetch(`${VAPI_BASE_URL}/phone-number/${phoneNumberId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiPhoneNumbers] Get error:", errorData)
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    const data = await response.json()
    console.log("[VapiPhoneNumbers] Get phone number response:", JSON.stringify(data, null, 2))
    
    // For free Vapi numbers, construct the SIP URI if not provided
    // Format: sip:{id}@sip.vapi.ai
    const constructedSipUri = data.sipUri || `sip:${data.id}@sip.vapi.ai`
    
    return {
      success: true,
      data: {
        id: data.id,
        orgId: data.orgId,
        provider: data.provider,
        number: data.number || null, // PSTN number (may be null)
        sipUri: constructedSipUri, // SIP URI - constructed if not provided
        name: data.name,
        status: data.status,
        assistantId: data.assistantId,
        squadId: data.squadId,
        workflowId: data.workflowId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as VapiPhoneNumber,
    }
  } catch (error) {
    console.error("[VapiPhoneNumbers] Get exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error getting phone number",
    }
  }
}

// ============================================================================
// DELETE PHONE NUMBER
// ============================================================================

export async function deletePhoneNumber(params: {
  apiKey: string
  phoneNumberId: string
}): Promise<{ success: boolean; error?: string }> {
  const { apiKey, phoneNumberId } = params

  try {
    console.log("[VapiPhoneNumbers] Deleting phone number:", phoneNumberId)

    const response = await fetch(`${VAPI_BASE_URL}/phone-number/${phoneNumberId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiPhoneNumbers] Delete error:", errorData)
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    console.log("[VapiPhoneNumbers] Phone number deleted successfully")
    return { success: true }
  } catch (error) {
    console.error("[VapiPhoneNumbers] Delete exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error deleting phone number",
    }
  }
}

// ============================================================================
// CREATE BYO PHONE NUMBER (linked to SIP trunk)
// ============================================================================

/**
 * Create a BYO (Bring Your Own) phone number linked to a SIP trunk credential.
 * This is used when you have your own SIP provider and want to use their DIDs with Vapi.
 * 
 * @see https://docs.vapi.ai/advanced/sip/sip-trunk
 */
export async function createByoPhoneNumber(
  params: ByoPhoneNumberParams
): Promise<VapiPhoneNumberResponse> {
  const { apiKey, number, credentialId, name, numberE164CheckEnabled = false } = params

  try {
    console.log("[VapiPhoneNumbers] Creating BYO phone number:", number, "with credential:", credentialId)

    const payload: Record<string, unknown> = {
      provider: "byo-phone-number",
      number,
      credentialId,
      numberE164CheckEnabled,
    }

    if (name) {
      payload.name = name
    }

    const response = await fetch(`${VAPI_BASE_URL}/phone-number`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiPhoneNumbers] Create BYO error:", errorData)
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    const data = await response.json()
    console.log("[VapiPhoneNumbers] BYO phone number created:", JSON.stringify(data, null, 2))

    return {
      success: true,
      data: {
        id: data.id,
        orgId: data.orgId,
        provider: data.provider,
        number: data.number,
        sipUri: data.sipUri,
        name: data.name,
        status: data.status,
        assistantId: data.assistantId,
        squadId: data.squadId,
        workflowId: data.workflowId,
        credentialId: data.credentialId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as VapiPhoneNumber,
    }
  } catch (error) {
    console.error("[VapiPhoneNumbers] Create BYO exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error creating BYO phone number",
    }
  }
}

// ============================================================================
// LIST BYO PHONE NUMBERS (filtered by credential)
// ============================================================================

/**
 * List phone numbers, optionally filtered by SIP trunk credential ID.
 * Use this to find all DIDs linked to a specific SIP trunk.
 */
export async function listByoPhoneNumbers(params: {
  apiKey: string
  credentialId?: string
  limit?: number
}): Promise<VapiPhoneNumberListResponse> {
  const { apiKey, credentialId, limit = 100 } = params

  try {
    const url = new URL(`${VAPI_BASE_URL}/phone-number`)
    url.searchParams.set("limit", limit.toString())

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("[VapiPhoneNumbers] List BYO error:", errorData)
      return {
        success: false,
        error:
          errorData.message ||
          `VAPI API error: ${response.status} ${response.statusText}`,
      }
    }

    let data: VapiPhoneNumber[] = await response.json()

    // Filter by credentialId if provided (Vapi API may not support this natively)
    if (credentialId) {
      data = data.filter((n) => n.credentialId === credentialId)
    }

    return {
      success: true,
      data,
    }
  } catch (error) {
    console.error("[VapiPhoneNumbers] List BYO exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error listing BYO phone numbers",
    }
  }
}

// ============================================================================
// GET VAPI INTEGRATION CONFIG HELPER
// ============================================================================

/**
 * Helper type for getting Vapi integration details including SIP trunk config.
 * This is used by routes that need to access the shared outbound number.
 */
export interface VapiIntegrationDetails {
  secretKey: string
  sipTrunkCredentialId?: string
  sharedOutboundPhoneNumberId?: string
  sharedOutboundPhoneNumber?: string
}

