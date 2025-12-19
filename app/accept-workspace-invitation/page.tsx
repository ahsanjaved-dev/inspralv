"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Building2, CheckCircle2, AlertCircle, LogIn } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import Link from "next/link"

interface InvitationData {
  id: string
  email: string
  role: string
  message: string | null
  expires_at: string
  workspace: {
    id: string
    name: string
    slug: string
    partner: {
      name: string
      branding: {
        company_name?: string
        primary_color?: string
        logo_url?: string
      }
    }
  }
}

function AcceptWorkspaceInvitationContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")

  const [loading, setLoading] = useState(true)
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    checkAuthAndLoadInvitation()
  }, [token])

  const checkAuthAndLoadInvitation = async () => {
    if (!token) {
      setError("No invitation token provided")
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()

      // Check if user is authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setIsAuthenticated(!!user)
      setUserEmail(user?.email || null)

      // Fetch invitation details
      const response = await fetch(
        `/api/workspace-invitations/accept?token=${encodeURIComponent(token)}`
      )
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Invalid invitation")
        return
      }

      setInvitation(data.data)
    } catch (err) {
      setError("Failed to load invitation")
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async () => {
    if (!token || !invitation) return

    setAccepting(true)
    try {
      const response = await fetch("/api/workspace-invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to accept invitation")
      }

      setSuccess(true)
      toast.success(result.data.message)

      // Redirect after short delay
      setTimeout(() => {
        router.push(result.data.redirect)
        router.refresh()
      }, 1500)
    } catch (error: any) {
      toast.error(error.message || "Failed to accept invitation")
    } finally {
      setAccepting(false)
    }
  }

  const primaryColor = invitation?.workspace.partner.branding.primary_color || "#7c3aed"
  const partnerName =
    invitation?.workspace.partner.branding.company_name || invitation?.workspace.partner.name

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" style={{ color: primaryColor }} />
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

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Card className="w-full max-w-md border-green-200 dark:border-green-800">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-green-600 dark:text-green-400">Welcome!</CardTitle>
            <CardDescription>
              You've joined {invitation?.workspace.name}. Redirecting...
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: primaryColor }} />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Not authenticated - prompt to login/signup
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            {invitation?.workspace.partner.branding.logo_url && (
              <img
                src={invitation.workspace.partner.branding.logo_url}
                alt={partnerName}
                className="h-10 mx-auto mb-4"
              />
            )}
            <div
              className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: `${primaryColor}20` }}
            >
              <Building2 className="h-7 w-7" style={{ color: primaryColor }} />
            </div>
            <CardTitle className="text-2xl">You're Invited!</CardTitle>
            <CardDescription className="text-base">
              Join{" "}
              <span className="font-semibold text-foreground">{invitation?.workspace.name}</span> on{" "}
              {partnerName}
            </CardDescription>
            <div className="flex justify-center gap-2 mt-2">
              <Badge variant="outline" className="capitalize">
                {invitation?.role}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {invitation?.message && (
              <div
                className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border"
                style={{ borderLeftColor: primaryColor, borderLeftWidth: 4 }}
              >
                <p className="text-sm text-slate-600 dark:text-slate-400 italic">
                  "{invitation.message}"
                </p>
              </div>
            )}

            <div className="text-center text-sm text-muted-foreground">
              <p>Sign in or create an account to accept this invitation.</p>
              <p className="mt-1">
                Invitation sent to: <strong>{invitation?.email}</strong>
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Button asChild style={{ backgroundColor: primaryColor }}>
                <Link href={`/login?redirect=/accept-workspace-invitation?token=${token}`}>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In to Accept
                </Link>
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Don't have an account? You can create one after clicking Sign In.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Authenticated but email doesn't match
  if (userEmail?.toLowerCase() !== invitation?.email.toLowerCase()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Card className="w-full max-w-md border-yellow-200 dark:border-yellow-800">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <CardTitle className="text-yellow-600 dark:text-yellow-400">Email Mismatch</CardTitle>
            <CardDescription>
              This invitation was sent to <strong>{invitation?.email}</strong>, but you're signed in
              as <strong>{userEmail}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full" onClick={() => router.push("/login")}>
              Sign in with different account
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Ready to accept
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {invitation?.workspace.partner.branding.logo_url && (
            <img
              src={invitation.workspace.partner.branding.logo_url}
              alt={partnerName}
              className="h-10 mx-auto mb-4"
            />
          )}
          <div
            className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: `${primaryColor}20` }}
          >
            <Building2 className="h-7 w-7" style={{ color: primaryColor }} />
          </div>
          <CardTitle className="text-2xl">Join {invitation?.workspace.name}</CardTitle>
          <CardDescription className="text-base">
            You've been invited to join as a{" "}
            <span className="font-semibold capitalize">{invitation?.role}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invitation?.message && (
            <div
              className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border"
              style={{ borderLeftColor: primaryColor, borderLeftWidth: 4 }}
            >
              <p className="text-sm text-slate-600 dark:text-slate-400 italic">
                "{invitation.message}"
              </p>
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleAccept}
            disabled={accepting}
            style={{ backgroundColor: primaryColor }}
          >
            {accepting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Accept & Join Workspace
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By accepting, you agree to the Terms of Service and Privacy Policy.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AcceptWorkspaceInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      }
    >
      <AcceptWorkspaceInvitationContent />
    </Suspense>
  )
}
