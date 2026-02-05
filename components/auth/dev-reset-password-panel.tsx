"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  AlertTriangle,
  ChevronDown,
  Loader2,
  CheckCircle2,
  Wrench,
  Mail,
  Key,
} from "lucide-react"

interface DevResetPasswordPanelProps {
  email?: string
  onPasswordReset?: () => void
}

export function DevResetPasswordPanel({
  email: initialEmail = "",
  onPasswordReset,
}: DevResetPasswordPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleDirectReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError("Email and password are required")
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/dev/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset password")
      }

      setSuccess(true)
      onPasswordReset?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password")
    } finally {
      setLoading(false)
    }
  }

  // Only render in development mode - returns null in production
  if (process.env.NODE_ENV !== "development") {
    return null
  }

  return (
    <div className="mt-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between p-3 h-auto text-left bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg"
          >
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-500">
                Development Mode
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-amber-500 transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3">
          <div className="space-y-4 p-4 bg-card/50 border border-border/50 rounded-lg">
            {/* Warning */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-500/5 p-3 rounded-md border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-500 mb-1">
                  Development Only
                </p>
                <p>
                  This option is only available in development mode and won't
                  appear in production.
                </p>
              </div>
            </div>

            {/* Direct Reset Form */}
            {success ? (
              <div className="text-center py-4">
                <div className="mx-auto w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <p className="text-sm font-medium text-green-500">
                  Password reset successfully!
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  You can now{" "}
                  <a href="/login" className="text-primary hover:underline">
                    sign in
                  </a>{" "}
                  with your new password.
                </p>
              </div>
            ) : (
              <form onSubmit={handleDirectReset} className="space-y-3">
                <div className="space-y-2">
                  <Label
                    htmlFor="dev-email"
                    className="text-xs flex items-center gap-2"
                  >
                    <Mail className="h-3 w-3" />
                    Email
                  </Label>
                  <Input
                    id="dev-email"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-9 text-sm"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="dev-password"
                    className="text-xs flex items-center gap-2"
                  >
                    <Key className="h-3 w-3" />
                    New Password
                  </Label>
                  <Input
                    id="dev-password"
                    type="password"
                    placeholder="New password (min 8 chars)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-9 text-sm"
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="outline"
                  className="w-full h-9 text-sm"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <Wrench className="mr-2 h-3 w-3" />
                      Reset Password (Dev)
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
