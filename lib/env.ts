function getEnvVar(key: string, required = true): string {
  const value = process.env[key]
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value || ""
}

export const env = {
  // Supabase
  supabaseUrl: getEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: getEnvVar("SUPABASE_SERVICE_ROLE_KEY"),

  // Prisma / Database
  // DATABASE_URL: Pooled connection string for Prisma queries
  // Format: postgresql://[user]:[password]@[host]:[port]/postgres?pgbouncer=true&connection_limit=10
  databaseUrl: getEnvVar("DATABASE_URL", false),
  // DIRECT_URL: Direct connection for Prisma migrations (bypasses pgbouncer)
  // Format: postgresql://[user]:[password]@[host]:[port]/postgres
  directUrl: getEnvVar("DIRECT_URL", false),

  // App Configuration
  appUrl: getEnvVar("NEXT_PUBLIC_APP_URL", false) || "http://localhost:3000",

  // Stripe
  stripeSecretKey: getEnvVar("STRIPE_SECRET_KEY", false),
  stripePublishableKey: getEnvVar("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", false),
  stripeWebhookSecret: getEnvVar("STRIPE_WEBHOOK_SECRET", false),
  stripeConnectWebhookSecret: getEnvVar("STRIPE_CONNECT_WEBHOOK_SECRET", false),
  // Stripe Price IDs (create in Stripe Dashboard first)
  // New simplified plan structure (canonical)
  stripePriceFree: getEnvVar("STRIPE_PRICE_FREE", false),
  stripePricePro: getEnvVar("STRIPE_PRICE_PRO", false),
  stripePriceAgency: getEnvVar("STRIPE_PRICE_AGENCY", false),
  // Legacy price IDs (for backwards compatibility)
  stripePriceStarter: getEnvVar("STRIPE_PRICE_STARTER", false),
  stripePriceProfessional: getEnvVar("STRIPE_PRICE_PROFESSIONAL", false),
  stripePriceEnterprise: getEnvVar("STRIPE_PRICE_ENTERPRISE", false),
  // Stripe Connect: Global platform fee percentage taken from each payment on Connect accounts
  // Default: 10% (e.g., if workspace pays $100, platform gets $10, agency gets $90)
  stripeConnectPlatformFeePercent: parseFloat(getEnvVar("STRIPE_CONNECT_PLATFORM_FEE_PERCENT", false) || "10"),

  // SMTP Email Service (Mailgun)
  // SMTP Configuration
  smtpHost: getEnvVar("SMTP_HOST", false) || "smtp.mailgun.org",
  smtpPort: parseInt(getEnvVar("SMTP_PORT", false) || "465", 10),
  smtpSecure: getEnvVar("SMTP_SECURE", false) !== "false", // Default true for port 465
  smtpUser: getEnvVar("SMTP_USER", false),
  smtpPass: getEnvVar("SMTP_PASS", false),
  // Sender configuration
  fromEmail: getEnvVar("FROM_EMAIL", false) || "noreply@genius365.ai",
  fromName: getEnvVar("FROM_NAME", false) || "Genius365 AI",
  // Admin email
  superAdminEmail: getEnvVar("SUPER_ADMIN_EMAIL", false),
  // Test email address for development mode - all emails will be sent to this address
  // When not set, defaults to the hardcoded test email
  testEmail: getEnvVar("TEST_EMAIL", false),
  

  // Supabase Storage
  supabaseStorageBucket: getEnvVar("NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET", false),

  // Platform Configuration
  // The base domain for partner subdomains (e.g., genius365.app)
  // Partners get subdomains like: acme-corp.genius365.app
  platformDomain: getEnvVar("NEXT_PUBLIC_PLATFORM_DOMAIN", false) || "genius365.app",

  // Environment
  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV === "production",

  // Development helpers
  // Set this to a partner slug to bypass hostname resolution in development
  // Example: DEV_PARTNER_SLUG=acme-corp will resolve to that partner regardless of hostname
  devPartnerSlug: getEnvVar("DEV_PARTNER_SLUG", false),

  // MCP Server Configuration
  // URL of the MCP server for custom tool execution
  // In development: http://localhost:3001
  // In production: https://mcp.yourdomain.com
  mcpServerUrl: getEnvVar("MCP_SERVER_URL", false),
  // API key for authenticating with the MCP server
  mcpApiKey: getEnvVar("MCP_API_KEY", false),

  // Redis/Upstash Configuration (for distributed caching and rate limiting)
  // Get these from your Upstash dashboard: https://console.upstash.com/
  upstashRedisRestUrl: getEnvVar("UPSTASH_REDIS_REST_URL", false),
  upstashRedisRestToken: getEnvVar("UPSTASH_REDIS_REST_TOKEN", false),
}
