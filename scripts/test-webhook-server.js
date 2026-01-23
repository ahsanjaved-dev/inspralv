/**
 * Test Webhook Server for Retell Custom Functions
 * 
 * This server simulates your external API endpoint for testing custom functions.
 * 
 * Usage:
 *   1. Run: node scripts/test-webhook-server.js
 *   2. In another terminal: cloudflared tunnel --url http://localhost:3333
 *   3. Copy the cloudflared URL and use it as the API URL in your custom function
 *   4. Make a test call to your Retell agent
 * 
 * Test Functions Available:
 *   - get_weather: Get weather for a city
 *   - book_appointment: Book an appointment
 *   - check_inventory: Check product inventory
 *   - create_ticket: Create a support ticket
 */

const http = require("http")

const PORT = process.env.PORT || 3333

// ============================================================================
// MOCK FUNCTION HANDLERS
// ============================================================================

const functionHandlers = {
  
  // Weather function
  get_weather: (args) => {
    const city = args.city || "Unknown"
    const unit = args.unit || "fahrenheit"
    
    // Simulated weather data
    const weatherData = {
      "new york": { temp: 72, condition: "sunny", humidity: 45 },
      "los angeles": { temp: 85, condition: "clear", humidity: 30 },
      "chicago": { temp: 55, condition: "cloudy", humidity: 60 },
      "miami": { temp: 88, condition: "partly cloudy", humidity: 75 },
      "seattle": { temp: 58, condition: "rainy", humidity: 80 },
      "london": { temp: 55, condition: "overcast", humidity: 70 },
      "paris": { temp: 65, condition: "sunny", humidity: 50 },
      "tokyo": { temp: 70, condition: "clear", humidity: 55 },
    }
    
    const cityLower = city.toLowerCase()
    const weather = weatherData[cityLower] || { temp: 70, condition: "partly cloudy", humidity: 50 }
    
    const tempDisplay = unit === "celsius" 
      ? `${Math.round((weather.temp - 32) * 5/9)}°C`
      : `${weather.temp}°F`
    
    return {
      success: true,
      result: {
        city: city,
        temperature: tempDisplay,
        condition: weather.condition,
        humidity: `${weather.humidity}%`,
        description: `The weather in ${city} is currently ${weather.condition} with a temperature of ${tempDisplay} and ${weather.humidity}% humidity.`
      }
    }
  },

  // Book appointment function
  book_appointment: (args) => {
    const name = args.name || "Customer"
    const date = args.date || "tomorrow"
    const time = args.time || "10:00 AM"
    const service = args.service || "consultation"
    
    // Generate a fake confirmation number
    const confirmationNumber = `APT-${Date.now().toString(36).toUpperCase()}`
    
    return {
      success: true,
      result: {
        confirmation_number: confirmationNumber,
        customer_name: name,
        appointment_date: date,
        appointment_time: time,
        service: service,
        message: `Great! I've booked your ${service} appointment for ${name} on ${date} at ${time}. Your confirmation number is ${confirmationNumber}.`
      }
    }
  },

  // Check inventory function
  check_inventory: (args) => {
    const product = args.product || "item"
    const quantity = args.quantity || 1
    
    // Simulated inventory
    const inventory = {
      "iphone": { stock: 25, price: 999 },
      "macbook": { stock: 12, price: 1299 },
      "airpods": { stock: 50, price: 249 },
      "ipad": { stock: 30, price: 799 },
      "apple watch": { stock: 40, price: 399 },
    }
    
    const productLower = product.toLowerCase()
    const item = inventory[productLower]
    
    if (!item) {
      return {
        success: true,
        result: {
          product: product,
          available: false,
          message: `I'm sorry, I couldn't find "${product}" in our inventory. Would you like me to check for something else?`
        }
      }
    }
    
    const available = item.stock >= quantity
    
    return {
      success: true,
      result: {
        product: product,
        requested_quantity: quantity,
        available: available,
        in_stock: item.stock,
        unit_price: `$${item.price}`,
        total_price: `$${item.price * quantity}`,
        message: available 
          ? `Yes, we have ${item.stock} ${product}s in stock. You requested ${quantity}. The price is $${item.price} each, totaling $${item.price * quantity}.`
          : `I'm sorry, we only have ${item.stock} ${product}s in stock, but you requested ${quantity}. Would you like a smaller quantity?`
      }
    }
  },

  // Create support ticket function
  create_ticket: (args) => {
    const issue = args.issue || "General inquiry"
    const priority = args.priority || "normal"
    const email = args.email || ""
    const phone = args.phone || ""
    
    // Generate ticket ID
    const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`
    
    return {
      success: true,
      result: {
        ticket_id: ticketId,
        issue_summary: issue,
        priority: priority,
        contact_email: email || "not provided",
        contact_phone: phone || "not provided",
        status: "open",
        estimated_response: priority === "high" ? "within 1 hour" : priority === "normal" ? "within 24 hours" : "within 48 hours",
        message: `I've created support ticket ${ticketId} for your issue: "${issue}". Priority is set to ${priority}. You should receive a response ${priority === "high" ? "within 1 hour" : priority === "normal" ? "within 24 hours" : "within 48 hours"}.`
      }
    }
  },

  // Transfer to human function (just logs and returns success)
  transfer_to_human: (args) => {
    const department = args.department || "general support"
    const reason = args.reason || "customer request"
    
    return {
      success: true,
      result: {
        department: department,
        reason: reason,
        message: `Transferring you to ${department}. Please hold while I connect you with a human representative.`
      }
    }
  },

  // Generic handler for unknown functions
  default: (args) => {
    return {
      success: true,
      result: {
        received_args: args,
        message: "Function executed successfully. This is a generic response for testing."
      }
    }
  }
}

// ============================================================================
// REQUEST HANDLER
// ============================================================================

function handleRequest(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  
  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  // Health check
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      status: "healthy",
      message: "Test webhook server is running",
      available_functions: Object.keys(functionHandlers).filter(k => k !== "default"),
      usage: "POST to /<function_name> or POST to / with { tool: '<function_name>', arguments: {...} }"
    }))
    return
  }

  // Handle POST requests
  if (req.method === "POST") {
    let body = ""
    
    req.on("data", (chunk) => {
      body += chunk.toString()
    })
    
    req.on("end", () => {
      try {
        const payload = body ? JSON.parse(body) : {}
        
        // Get function name from URL path or payload
        const urlPath = req.url?.replace(/^\//, "") || ""
        const functionName = urlPath || payload.tool || payload.function || "default"
        
        // Get arguments
        const args = payload.arguments || payload.parameters || {}
        
        // Log the request
        console.log("\n" + "═".repeat(70))
        console.log(`📥 ${new Date().toISOString()}`)
        console.log(`🔧 Function: ${functionName}`)
        console.log(`📝 Arguments:`, JSON.stringify(args, null, 2))
        if (payload.metadata) {
          console.log(`📋 Metadata:`, JSON.stringify(payload.metadata, null, 2))
        }
        console.log("═".repeat(70))
        
        // Find and execute the handler
        const handler = functionHandlers[functionName] || functionHandlers.default
        const response = handler(args)
        
        // Log the response
        console.log(`📤 Response:`, JSON.stringify(response, null, 2))
        console.log("═".repeat(70) + "\n")
        
        // Send response
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(response))
        
      } catch (error) {
        console.error("❌ Error processing request:", error)
        
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({
          success: false,
          error: error.message || "Invalid request"
        }))
      }
    })
    
    return
  }
  
  // Method not allowed
  res.writeHead(405, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: "Method not allowed" }))
}

// ============================================================================
// START SERVER
// ============================================================================

const server = http.createServer(handleRequest)

server.listen(PORT, () => {
  console.log("\n" + "═".repeat(70))
  console.log("🚀 Test Webhook Server Started")
  console.log("═".repeat(70))
  console.log(`\n📍 Server running at: http://localhost:${PORT}`)
  console.log("\n📋 Available test functions:")
  console.log("   • get_weather      - Get weather for a city")
  console.log("   • book_appointment - Book an appointment")
  console.log("   • check_inventory  - Check product inventory")
  console.log("   • create_ticket    - Create a support ticket")
  console.log("   • transfer_to_human - Transfer to human agent")
  console.log("\n🔗 Next steps:")
  console.log("   1. In another terminal, run:")
  console.log(`      cloudflared tunnel --url http://localhost:${PORT}`)
  console.log("   2. Copy the cloudflared URL (e.g., https://xxx.trycloudflare.com)")
  console.log("   3. Use it as the API URL in your Retell custom function")
  console.log("   4. Test by calling your Retell agent!")
  console.log("\n💡 Example custom function config:")
  console.log("   Function Name: get_weather")
  console.log("   Description: Get the current weather for a specified city.")
  console.log("   API URL: https://your-tunnel.trycloudflare.com/get_weather")
  console.log("   HTTP Method: POST")
  console.log("   Parameters:")
  console.log("     - city (string, required): The city to get weather for")
  console.log("     - unit (string, optional): 'fahrenheit' or 'celsius'")
  console.log("\n" + "═".repeat(70))
  console.log("⏳ Waiting for requests...\n")
})

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down server...")
  server.close(() => {
    console.log("✅ Server closed")
    process.exit(0)
  })
})

