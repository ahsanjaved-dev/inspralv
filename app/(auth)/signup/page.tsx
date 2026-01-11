"use client"

import { useState, Suspense, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, ArrowRight, Sparkles, Gift, Mail, Lock } from "lucide-react"
import { workspacePlans, type PlanSlug } from "@/config/plans"
import { PasswordStrengthIndicator } from "@/components/auth/password-strength"
import { validatePassword } from "@/lib/auth/password"
import { usePartner, getDisplayName } from "@/lib/hooks/use-partner"

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirect")
  const planParam = searchParams.get("plan")
  const invitationToken = searchParams.get("token")

  // Fetch partner info to check if platform partner
  const { data: partnerData, isLoading: isLoadingPartner } = usePartner()
  const isPlatformPartner = partnerData?.partner?.is_platform_partner ?? true
  const partnerName = getDisplayName(partnerData?.partner)

  const selectedPlan = useMemo((): PlanSlug | null => {
    if (!planParam) return null
    const normalized = planParam.toLowerCase()
    if (normalized === "starter" || normalized === "professional") return "pro"
    if (normalized === "enterprise") return "agency"
    if (normalized in workspacePlans) return normalized as PlanSlug
    return null
  }, [planParam])

  const prefilledEmail = searchParams.get("email") || ""
  const isInvitation = redirectTo?.includes("invitation") || !!invitationToken

  // For platform partner: redirect to pricing if no plan selected (unless invitation)
  // For non-platform partners: only allow invitation-based signup
  useEffect(() => {
    if (isLoadingPartner) return
    
    // For non-platform partners (white-label): require invitation
    if (!isPlatformPartner && !isInvitation) {
      // Don't redirect, we'll show the invitation-only message
      return
    }
    
    // For platform partner: require plan selection (unless invitation)
    if (isPlatformPartner && !isInvitation) {
      if (!selectedPlan || selectedPlan === "agency") {
        router.replace("/pricing")
      }
    }
  }, [selectedPlan, isInvitation, router, isPlatformPartner, isLoadingPartner])

  const [email, setEmail] = useState(prefilledEmail)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const planInfo = selectedPlan ? workspacePlans[selectedPlan] : null
  const isPaidPlan = planInfo && planInfo.monthlyPriceCents > 0

  const passwordValidation = useMemo(
    () => validatePassword(password, { email, firstName, lastName }),
    [password, email, firstName, lastName]
  )

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setLoading(false)
      return
    }

    if (!passwordValidation.valid) {
      setError(passwordValidation.errors[0]?.message || "Password does not meet requirements")
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            selected_plan: selectedPlan || "free",
            signup_source: isInvitation ? "invitation" : "pricing_page",
          },
        },
      })

      if (authError) throw authError

      if (authData.user && !authData.session) {
        setSuccess(true)
        return
      }

      if (authData.user && authData.session) {
        const setupRes = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: authData.user.id,
            email: authData.user.email,
            firstName,
            lastName,
            selectedPlan: selectedPlan || "free",
            signupSource: redirectTo ? "invitation" : selectedPlan ? "pricing_page" : "direct",
            isInvitation: isInvitation,
            invitationToken: invitationToken || null,
          }),
        })

        let setupData = null
        if (setupRes.ok) {
          const res = await setupRes.json()
          setupData = res.data
        }

        if (setupData?.checkoutUrl) {
          window.location.href = setupData.checkoutUrl
          return
        }

        if (redirectTo) {
          router.push(redirectTo)
        } else if (setupData?.redirect) {
          router.push(setupData.redirect)
        } else {
          router.push("/select-workspace")
        }
        router.refresh()
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create account"
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Loading state while checking partner
  if (isLoadingPartner) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  // For non-platform partners: Show invitation-only message if not an invitation
  if (!isPlatformPartner && !isInvitation) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Invitation Required</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            Access to <span className="font-medium text-foreground">{partnerName}</span> is by invitation only. 
            Please contact your administrator for an invitation.
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>Check your email for an invitation link</span>
            </div>
            <Link 
              href="/login" 
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              Already have an account? Sign in
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  // For platform partner: Loading state while redirecting to pricing
  if (isPlatformPartner && !isInvitation && (!selectedPlan || selectedPlan === "agency")) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground text-sm">Redirecting to pricing...</p>
        </CardContent>
      </Card>
    )
  }

  // Success state
  if (success) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Check your email</h2>
          <p className="text-muted-foreground mb-6">
            We've sent a confirmation link to <span className="font-medium text-foreground">{email}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Click the link in the email to verify your account.
          </p>
          <Link 
            href="/login" 
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline mt-6"
          >
            Back to sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Plan Badge - Only show for platform partner with plan selected */}
      {isPlatformPartner && planInfo && !isInvitation && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Gift className="h-5 w-5 text-primary" />
              <span className="font-medium">{planInfo.name} Plan</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">
                {isPaidPlan ? `$${planInfo.monthlyPriceCents / 100}/mo` : "Free"}
              </Badge>
              <Link href="/pricing" className="text-xs text-muted-foreground hover:text-primary transition-colors">
                Change
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invitation Banner */}
      {isInvitation && prefilledEmail && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-blue-500" />
            <div className="text-sm">
              <span className="text-muted-foreground">You've been invited! Create an account with </span>
              <span className="font-medium">{prefilledEmail}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Partner Invitation Banner - For non-platform partners */}
      {!isPlatformPartner && isInvitation && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <div className="text-sm">
              <span className="text-muted-foreground">Welcome to </span>
              <span className="font-medium">{partnerName}</span>
              <span className="text-muted-foreground">. Complete your account setup below.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signup Form */}
      <Card>
        <CardHeader className="text-center pb-2">
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            {isPlatformPartner && isPaidPlan
              ? "Start your subscription after signing up"
              : isInvitation
              ? "Complete your registration"
              : "Get started with free credits"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading || (isInvitation && !!prefilledEmail)}
              />
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
                disabled={loading}
                minLength={12}
              />
              {password && (
                <PasswordStrengthIndicator
                  password={password}
                  showRequirements={true}
                  className="mt-3"
                />
              )}
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
                disabled={loading}
                className={confirmPassword && confirmPassword !== password ? "border-destructive" : ""}
              />
              {confirmPassword && confirmPassword !== password && (
                <p className="text-sm text-destructive">Passwords do not match</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : isPlatformPartner && isPaidPlan ? (
                <>
                  Continue to Payment
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Create Account
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{" "}
            <Link
              href={redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login"}
              className="text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      }
    >
      <SignupForm />
    </Suspense>
  )
}
