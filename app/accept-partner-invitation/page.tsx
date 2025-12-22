"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle, XCircle, Building2, Mail, Shield } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

interface InvitationDetails {
  id: string
  email: string
  role: string
  status: string
  is_expired: boolean
  partner: {
    name: string
    slug: string
    branding: any
  }
  inviter: {
    name: string
  }
}

const roleLabels: Record<string, string> = {
  owner: "Organization Owner",
  admin: "Administrator",
  member: "Team Member",
}

export default function AcceptPartnerInvitationPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")

  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Check authentication status
  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setIsAuthenticated(!!user)
    }
    checkAuth()
  }, [])

  // Fetch invitation details
  useEffect(() => {
    async function fetchInvitation() {
      if (!token) {
        setError("Invalid invitation link")
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/partner-invitations/accept?token=${token}`)
        const result = await res.json()

        if (!res.ok) {
          setError(result.error || "Invalid invitation")
          setLoading(false)
          return
        }

        setInvitation(result.data)
      } catch (err) {
        setError("Failed to load invitation")
      } finally {
        setLoading(false)
      }
    }

    fetchInvitation()
  }, [token])

  const handleAccept = async () => {
    if (!token || !isAuthenticated) return

    setAccepting(true)
    try {
      const res = await fetch("/api/partner-invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })

      const result = await res.json()

      if (!res.ok) {
        toast.error(result.error || "Failed to accept invitation")
        return
      }

      setSuccess(true)
      toast.success(`Welcome to ${result.data.partner_name}!`)

      // Redirect to workspace selector after a short delay
      setTimeout(() => {
        router.push("/select-workspace")
      }, 2000)
    } catch (err) {
      toast.error("Failed to accept invitation")
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading invitation...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>{error || "This invitation is invalid or has expired."}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/">
              <Button variant="outline">Go to Homepage</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (invitation.status !== "pending" || invitation.is_expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <XCircle className="h-6 w-6 text-amber-600" />
            </div>
            <CardTitle>Invitation Expired</CardTitle>
            <CardDescription>
              This invitation has {invitation.status === "accepted" ? "already been used" : "expired"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/">
              <Button variant="outline">Go to Homepage</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Welcome to {invitation.partner.name}!</CardTitle>
            <CardDescription>
              You've successfully joined the organization. Redirecting...
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div 
            className="mx-auto w-16 h-16 rounded-xl flex items-center justify-center mb-4 text-white font-bold text-2xl"
            style={{ backgroundColor: invitation.partner.branding?.primary_color || "#7c3aed" }}
          >
            {invitation.partner.name.charAt(0)}
          </div>
          <CardTitle>Join {invitation.partner.name}</CardTitle>
          <CardDescription>
            {invitation.inviter.name} has invited you to join their organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Invitation Details */}
          <div className="space-y-4 bg-slate-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Invited as</p>
                <p className="font-medium">{invitation.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Your role</p>
                <Badge variant="secondary">{roleLabels[invitation.role] || invitation.role}</Badge>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Organization</p>
                <p className="font-medium">{invitation.partner.name}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          {isAuthenticated ? (
            <Button 
              className="w-full" 
              size="lg" 
              onClick={handleAccept}
              disabled={accepting}
            >
              {accepting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                "Accept Invitation"
              )}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-center text-muted-foreground">
                Sign in or create an account to accept this invitation
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Link href={`/login?redirect=${encodeURIComponent(`/accept-partner-invitation?token=${token}`)}`}>
                  <Button variant="outline" className="w-full">Sign In</Button>
                </Link>
                <Link href={`/signup?redirect=${encodeURIComponent(`/accept-partner-invitation?token=${token}`)}&email=${encodeURIComponent(invitation.email)}`}>
                  <Button className="w-full">Create Account</Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

