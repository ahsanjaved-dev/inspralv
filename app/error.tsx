"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, RefreshCw, Home, ChevronDown } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

/**
 * Global Error Boundary
 * Phase 5.1.1: Implement enhanced global error boundary
 *
 * This component catches errors that occur in the app and provides:
 * - User-friendly error messages
 * - Recovery options (retry, go home)
 * - Error details for debugging (in development)
 */

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  const [showDetails, setShowDetails] = useState(false)
  const isDev = process.env.NODE_ENV === "development"

  // Log error to console in development
  useEffect(() => {
    console.error("Application error:", error)

    // In production, you could send this to an error tracking service like Sentry
    // if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    //   Sentry.captureException(error)
    // }
  }, [error])

  // Determine error type for better messaging
  const errorMessage = getErrorMessage(error)
  const isNetworkError =
    error.message?.toLowerCase().includes("network") ||
    error.message?.toLowerCase().includes("fetch")

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-red-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Card className="w-full max-w-lg shadow-xl border-red-200 dark:border-red-900/50">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-2xl text-red-700 dark:text-red-400">
            Something went wrong
          </CardTitle>
          <CardDescription className="text-base mt-2">{errorMessage}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Recovery Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={reset} className="flex-1 bg-red-600 hover:bg-red-700">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/select-workspace">
                <Home className="mr-2 h-4 w-4" />
                Go to Dashboard
              </Link>
            </Button>
          </div>

          {/* Network error specific message */}
          {isNetworkError && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Connection Issue Detected
              </p>
              <p className="text-amber-700 dark:text-amber-300 mt-1">
                Please check your internet connection and try again.
              </p>
            </div>
          )}

          {/* Error Details (Development) */}
          {isDev && (
            <div className="pt-4 border-t">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`}
                />
                {showDetails ? "Hide" : "Show"} Error Details
              </button>

              {showDetails && (
                <div className="mt-3 space-y-2">
                  <div className="bg-muted rounded-lg p-3 font-mono text-xs overflow-auto max-h-48">
                    <p className="font-semibold text-red-600 dark:text-red-400">
                      {error.name}: {error.message}
                    </p>
                    {error.stack && (
                      <pre className="mt-2 text-muted-foreground whitespace-pre-wrap">
                        {error.stack}
                      </pre>
                    )}
                  </div>
                  {error.digest && (
                    <p className="text-xs text-muted-foreground">
                      Error ID: <code className="bg-muted px-1 rounded">{error.digest}</code>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error ID for support (Production) */}
          {!isDev && error.digest && (
            <p className="text-center text-xs text-muted-foreground pt-4 border-t">
              If this problem persists, contact support with error ID:{" "}
              <code className="bg-muted px-1 rounded">{error.digest}</code>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Get user-friendly error message based on error type
 */
function getErrorMessage(error: Error): string {
  const message = error.message?.toLowerCase() || ""

  if (message.includes("network") || message.includes("fetch")) {
    return "Unable to connect to the server. Please check your connection."
  }

  if (message.includes("unauthorized") || message.includes("401")) {
    return "Your session has expired. Please log in again."
  }

  if (message.includes("forbidden") || message.includes("403")) {
    return "You don't have permission to access this resource."
  }

  if (message.includes("not found") || message.includes("404")) {
    return "The requested resource could not be found."
  }

  if (message.includes("timeout")) {
    return "The request took too long. Please try again."
  }

  return "An unexpected error occurred. Our team has been notified."
}
