"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Building2, CheckCircle2, AlertCircle, Mail } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface InvitationData {
  id: string
  type: string
  email: string
  role: string
  message: string | null
  expires_at: string
  organization: {
    id: string
    name: string
    slug: string
    plan_tier: string
  }
}

function AcceptInvitationContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")

  const [loading, setLoading] = useState(true)
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<"loading" | "form" | "success">("loading")

  useEffect(() => {
    if (token) {
      fetchInvitation()
    } else {
      setError("No invitation token provided")
      setLoading(false)
    }
  }, [token])

  const fetchInvitation = async () => {
    if (!token) {
      setError("No invitation token provided")
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/invitations/get?token=${encodeURIComponent(token)}`)
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Invalid invitation")
        return
      }

      setInvitation(data.data)
      setEmail(data.data.email) // Pre-fill email from invitation
      setStep("form")
    } catch (err) {
      setError("Failed to load invitation")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters")
      return
    }

    setSubmitting(true)

    try {
      const supabase = createClient()

      // Step 1: Create auth account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      })

      if (authError) {
        if (authError.message.includes("already registered")) {
          toast.error("This email is already registered. Please login instead.")
        } else {
          throw authError
        }
        return
      }

      if (!authData.user) {
        throw new Error("Failed to create account")
      }

      // Step 2: Accept the invitation
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          first_name: firstName,
          last_name: lastName,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to accept invitation")
      }

      setStep("success")
      toast.success("Welcome to Inspralv!")

      // Redirect after short delay
      setTimeout(() => {
        router.push(result.data.redirect || "/onboarding")
        router.refresh()
      }, 2000)
    } catch (error: any) {
      console.error("Accept invitation error:", error)
      toast.error(error.message || "Failed to accept invitation")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600 mx-auto" />
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading invitation...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Card className="w-full max-w-md border-red-200 dark:border-red-800">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-red-600 dark:text-red-400">Invalid Invitation</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" onClick={() => router.push("/")}>
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Card className="w-full max-w-md border-green-200 dark:border-green-800">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-green-600 dark:text-green-400">Welcome Aboard!</CardTitle>
            <CardDescription>
              Your account has been created successfully. Redirecting to setup...
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 bg-violet-100 dark:bg-violet-900/30 rounded-2xl flex items-center justify-center mb-4">
            <Building2 className="h-7 w-7 text-violet-600 dark:text-violet-400" />
          </div>
          <CardTitle className="text-2xl">You're Invited!</CardTitle>
          <CardDescription className="text-base">
            Join{" "}
            <span className="font-semibold text-foreground">{invitation?.organization.name}</span>{" "}
            on Inspralv
          </CardDescription>
          <div className="flex justify-center gap-2 mt-2">
            <Badge variant="outline" className="capitalize">
              {invitation?.organization.plan_tier} Plan
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {invitation?.message && (
            <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border">
              <p className="text-sm text-slate-600 dark:text-slate-400 italic">
                "{invitation.message}"
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting || invitation?.email === email}
                  className="pl-10"
                />
              </div>
              {invitation?.email && (
                <p className="text-xs text-slate-500">Invitation sent to: {invitation.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
            </div>

            <Button
              type="submit"
              className="w-full bg-violet-600 hover:bg-violet-700"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Accept Invitation & Create Account
                </>
              )}
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground mt-6">
            By accepting, you agree to our Terms of Service and Privacy Policy.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      }
    >
      <AcceptInvitationContent />
    </Suspense>
  )
}
