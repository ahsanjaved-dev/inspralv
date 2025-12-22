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

  // App Configuration
  appUrl: getEnvVar("NEXT_PUBLIC_APP_URL", false) || "http://localhost:3000",

  // Stripe (Optional)
  stripeSecretKey: getEnvVar("STRIPE_SECRET_KEY", false),
  stripePublishableKey: getEnvVar("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", false),

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
