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
  stripePriceStarter: getEnvVar("STRIPE_PRICE_STARTER", false),
  stripePriceProfessional: getEnvVar("STRIPE_PRICE_PROFESSIONAL", false),
  stripePriceEnterprise: getEnvVar("STRIPE_PRICE_ENTERPRISE", false),

  // Resend Email Service
  resendApiKey: getEnvVar("RESEND_API_KEY", false),
  fromEmail: getEnvVar("FROM_EMAIL", false),
  superAdminEmail: getEnvVar("SUPER_ADMIN_EMAIL", false),

  // Supabase Storage
  supabaseStorageBucket: getEnvVar("NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET", false),

  // Environment
  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV === "production",
}
