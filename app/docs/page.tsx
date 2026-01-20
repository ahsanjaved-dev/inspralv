"use client"

/**
 * API Documentation Page
 * Interactive Swagger UI for exploring the API
 */

import { useEffect, useRef } from "react"
import Script from "next/script"

export default function DocsPage() {
  const swaggerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Initialize Swagger UI after the script loads
    const initSwagger = () => {
      if (typeof window !== "undefined" && (window as any).SwaggerUIBundle && swaggerRef.current) {
        (window as any).SwaggerUIBundle({
          url: "/api/docs",
          dom_id: "#swagger-ui",
          presets: [
            (window as any).SwaggerUIBundle.presets.apis,
            (window as any).SwaggerUIStandalonePreset,
          ],
          plugins: [
            (window as any).SwaggerUIBundle.plugins.DownloadUrl,
          ],
          layout: "StandaloneLayout",
          deepLinking: true,
          showExtensions: true,
          showCommonExtensions: true,
          defaultModelsExpandDepth: 2,
          defaultModelExpandDepth: 2,
          docExpansion: "list",
          filter: true,
          tryItOutEnabled: true,
        })
      }
    }

    // Check if already loaded
    if ((window as any).SwaggerUIBundle) {
      initSwagger()
    } else {
      // Wait for script to load
      window.addEventListener("swagger-loaded", initSwagger)
      return () => window.removeEventListener("swagger-loaded", initSwagger)
    }
  }, [])

  return (
    <>
      {/* Swagger UI CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css"
      />
      
      {/* Swagger UI JS */}
      <Script
        src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"
        onLoad={() => {
          window.dispatchEvent(new Event("swagger-loaded"))
        }}
      />
      <Script
        src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"
        strategy="afterInteractive"
      />

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">Genius365 API</h1>
                <p className="text-sm text-muted-foreground">
                  Interactive API documentation
                </p>
              </div>
              <div className="flex items-center gap-4">
                <a
                  href="/api/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Download OpenAPI Spec
                </a>
              </div>
            </div>
          </div>
        </header>

        {/* Swagger UI Container */}
        <div id="swagger-ui" ref={swaggerRef} className="swagger-container" />

        {/* Custom styles for Swagger UI */}
        <style jsx global>{`
          .swagger-ui .topbar {
            display: none;
          }
          
          .swagger-ui .info {
            margin: 20px 0;
          }
          
          .swagger-ui .info .title {
            font-size: 2rem;
          }
          
          .swagger-ui .opblock-tag {
            font-size: 1.25rem;
            font-weight: 600;
          }
          
          .swagger-ui .opblock {
            border-radius: 8px;
            margin-bottom: 8px;
          }
          
          .swagger-ui .opblock-summary {
            padding: 12px 16px;
          }
          
          .swagger-ui .btn {
            border-radius: 6px;
          }
          
          .swagger-ui .model-box {
            border-radius: 8px;
          }
          
          /* Dark mode support */
          @media (prefers-color-scheme: dark) {
            .swagger-ui {
              filter: invert(88%) hue-rotate(180deg);
            }
            
            .swagger-ui img {
              filter: invert(100%) hue-rotate(180deg);
            }
          }
        `}</style>
      </div>
    </>
  )
}

