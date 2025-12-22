"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Loader2, CheckCircle2, Check, Sparkles } from "lucide-react"
import { plans } from "@/config/plans"

type PlanKey = keyof typeof plans

const planBenefits: Record<PlanKey, string[]> = {
  starter: ["5 AI agents", "1,000 minutes/month", "Email support"],
  professional: ["25 AI agents", "5,000 minutes/month", "Priority support", "Custom branding"],
  enterprise: ["Unlimited agents", "Custom minutes", "Dedicated support", "White-label"],
}

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirect")
  const selectedPlan = (searchParams.get("plan") as PlanKey) || null

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Get plan info if selected
  const planInfo = selectedPlan && plans[selectedPlan] ? plans[selectedPlan] : null
  const planFeatures = selectedPlan ? planBenefits[selectedPlan] || [] : []

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()

      // Sign up with Supabase Auth - include plan in metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            selected_plan: selectedPlan || "starter",
            signup_source: "pricing_page",
          },
        },
      })

      if (authError) throw authError

      // Check if email confirmation is required
      if (authData.user && !authData.session) {
        // Email confirmation required
        setSuccess(true)
        return
      }

      // If no email confirmation, complete user setup
      if (authData.user && authData.session) {
        // Call our API to create user record and add to platform partner
        const setupRes = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: authData.user.id,
            email: authData.user.email,
            firstName,
            lastName,
            selectedPlan: selectedPlan || "starter",
            signupSource: redirectTo ? "invitation" : selectedPlan ? "pricing_page" : "direct",
          }),
        })

        if (!setupRes.ok) {
          console.error("User setup failed:", await setupRes.text())
          // Continue anyway - user is authenticated
        }

        // Redirect to invitation or workspace selector
        if (redirectTo) {
          router.push(redirectTo)
        } else {
          router.push("/select-workspace")
        }
        router.refresh()
      }
    } catch (error: any) {
      setError(error.message || "Failed to create account")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <Card className="shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We've sent a confirmation link to <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            Click the link in the email to verify your account, then come back to sign in.
          </p>
          {planInfo && (
            <p className="text-sm text-muted-foreground mt-2">
              Your selected plan: <strong className="capitalize">{planInfo.name}</strong>
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <div className="w-full max-w-md space-y-4">
      {/* Selected Plan Banner */}
      {planInfo && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">{planInfo.name} Plan</span>
              </div>
              {planInfo.price ? (
                <Badge variant="outline" className="bg-background">
                  ${planInfo.price}/mo
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-background">
                  Custom
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {planFeatures.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="h-3 w-3 text-primary shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
            <Link
              href="/pricing"
              className="text-xs text-primary hover:underline mt-2 inline-block"
            >
              Change plan →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Signup Form */}
      <Card className="shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            {planInfo
              ? `Sign up to get started with the ${planInfo.name} plan`
              : "Enter your details to get started"}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
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
                disabled={loading}
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
                minLength={8}
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
                disabled={loading}
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : planInfo ? (
                `Get Started with ${planInfo.name}`
              ) : (
                "Create Account"
              )}
            </Button>

            <p className="text-sm text-muted-foreground text-center">
              Already have an account?{" "}
              <Link
                href={redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login"}
                className="text-primary hover:underline"
              >
                Sign in
              </Link>
            </p>

            {!planInfo && (
              <p className="text-xs text-muted-foreground text-center">
                <Link href="/pricing" className="text-primary hover:underline">
                  View pricing plans
                </Link>
              </p>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <Card className="shadow-xl w-full max-w-md">
          <CardContent className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </CardContent>
        </Card>
      }
    >
      <SignupForm />
    </Suspense>
  )
}
