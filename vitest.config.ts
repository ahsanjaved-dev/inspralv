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
      exclude: [
        "node_modules/",
        "vitest.config.ts",
        "vitest.setup.ts",
        "**/*.d.ts",
        "**/*.config.*",
        "lib/generated/**",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
    
    // Test timeout
    testTimeout: 10000,
    
    // Watch mode options
    watch: false,
  },
  
  // Path aliases to match tsconfig
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})

