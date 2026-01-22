/**
 * Book Appointment Tool Webhook
 * 
 * This is a TEST endpoint that receives tool execution requests from the MCP server.
 * In production, you would replace this with actual booking logic
 * (e.g., Google Calendar, Calendly, CRM integration, etc.)
 * 
 * Flow:
 * 1. Retell AI decides to call book_appointment tool
 * 2. Retell sends request to MCP server
 * 3. MCP server forwards to this webhook
 * 4. This webhook processes and returns result
 * 5. Result flows back to Retell AI
 */

import { NextRequest, NextResponse } from "next/server"

// Types for the incoming request
interface BookAppointmentPayload {
  // Tool execution metadata from MCP
  tool?: string
  function?: string  // Alternative field name
  call_id?: string
  tool_id?: string
  agent_id?: string
  timestamp?: string
  
  // The actual arguments from the AI (two possible field names)
  arguments?: {
    caller_name?: string
    phone_number?: string
    email?: string
    preferred_date?: string
    preferred_time?: string
    appointment_type?: string
    notes?: string
  }
  
  // Alternative: "parameters" instead of "arguments"
  parameters?: {
    caller_name?: string
    phone_number?: string
    email?: string
    preferred_date?: string
    preferred_time?: string
    appointment_type?: string
    notes?: string
  }
  
  // Alternative: arguments might be at root level
  caller_name?: string
  phone_number?: string
  email?: string
  preferred_date?: string
  preferred_time?: string
  appointment_type?: string
  notes?: string
}

export async function POST(request: NextRequest) {
  console.log("\n" + "=".repeat(60))
  console.log("📅 BOOK APPOINTMENT TOOL CALLED")
  console.log("=".repeat(60))
  
  try {
    const payload: BookAppointmentPayload = await request.json()
    
    // Log the full payload for debugging
    console.log("\n📨 Received payload:")
    console.log(JSON.stringify(payload, null, 2))
    
    // Extract arguments (handle multiple formats for compatibility)
    // Priority: arguments > parameters > root level fields
    const args = payload.arguments || payload.parameters || {
      caller_name: payload.caller_name,
      phone_number: payload.phone_number,
      email: payload.email,
      preferred_date: payload.preferred_date,
      preferred_time: payload.preferred_time,
      appointment_type: payload.appointment_type,
      notes: payload.notes,
    }
    
    console.log("\n📋 Extracted arguments:")
    console.log(`  - Caller Name: ${args.caller_name || "Not provided"}`)
    console.log(`  - Phone: ${args.phone_number || "Not provided"}`)
    console.log(`  - Email: ${args.email || "Not provided"}`)
    console.log(`  - Date: ${args.preferred_date || "Not provided"}`)
    console.log(`  - Time: ${args.preferred_time || "Not provided"}`)
    console.log(`  - Type: ${args.appointment_type || "Not provided"}`)
    console.log(`  - Notes: ${args.notes || "Not provided"}`)
    
    // =========================================================================
    // TODO: Replace this mock logic with your actual booking implementation
    // Examples:
    // - Create event in Google Calendar API
    // - Book appointment in Calendly
    // - Insert record in your database
    // - Create lead in CRM (Salesforce, HubSpot, etc.)
    // =========================================================================
    
    // Generate a mock confirmation ID
    const confirmationId = `APT-${Date.now().toString(36).toUpperCase()}`
    
    // Simulate some processing time (remove in production)
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Mock success response
    const response = {
      success: true,
      result: {
        confirmation_id: confirmationId,
        message: `Appointment successfully booked for ${args.caller_name || "the caller"}`,
        details: {
          date: args.preferred_date || "To be confirmed",
          time: args.preferred_time || "To be confirmed",
          type: args.appointment_type || "General consultation",
        },
        next_steps: "You will receive a confirmation email shortly.",
      },
    }
    
    console.log("\n✅ Booking successful!")
    console.log(`  - Confirmation ID: ${confirmationId}`)
    console.log("=".repeat(60) + "\n")
    
    return NextResponse.json(response)
    
  } catch (error) {
    console.error("\n❌ Error processing booking:", error)
    console.log("=".repeat(60) + "\n")
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to book appointment",
      },
      { status: 500 }
    )
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    tool: "book_appointment",
    description: "Test endpoint for book_appointment tool webhook",
    usage: "POST with appointment details",
  })
}

