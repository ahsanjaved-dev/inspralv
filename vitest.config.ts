import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    // Environment setup
    environment: "jsdom",
    
    // Setup files run before tests
    setupFiles: ["./vitest.setup.ts"],
    
    // Global test utilities
    globals: true,
    
    // Include patterns
    include: [
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
    ],
    
    // Exclude patterns
    exclude: [
      "node_modules",
      ".next",
      "dist",
    ],
    
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // Only measure coverage from the specific source files being tested
      include: [
        "lib/billing/usage.ts",
        "lib/billing/workspace-paywall.ts",
        "lib/stripe/credits.ts",
        "lib/stripe/workspace-credits.ts",
        "lib/rbac/permissions.ts",
        "lib/integrations/vapi/agent/sync.ts",
        "lib/integrations/retell/agent/sync.ts",
      ],
      exclude: [
        "node_modules/",
        "vitest.config.ts",
        "vitest.setup.ts",
        "**/*.d.ts",
        "**/*.config.*",
        "lib/generated/**",
        "**/__tests__/**",
        "**/test/**",
        "**/*.test.*",
        "**/*.spec.*",
      ],
      // Coverage thresholds for the tested files
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
    
    // Test timeout
    testTimeout: 10000,
    
    // Watch mode options
    watch: false,
    
    // Clear mocks between tests
    clearMocks: true,
    
    // Restore mocks after each test
    restoreMocks: true,
  },
  
  // Path aliases to match tsconfig
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})
