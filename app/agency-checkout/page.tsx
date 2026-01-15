"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  CreditCard,
  Package,
  Globe,
  ArrowRight,
  Clock,
} from "lucide-react"

interface CheckoutData {
  request: {
    id: string
    companyName: string
    contactName: string
    contactEmail: string
    desiredSubdomain: string
    status: string
  }
  variant: {
    id: string
    name: string
    description: string | null
    monthlyPriceCents: number
    maxWorkspaces: number
  }
  expiresAt: string
}

export default function AgencyCheckoutPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkoutData, setCheckoutData] = useState<CheckoutData | null>(null)
  const [processingCheckout, setProcessingCheckout] = useState(false)

  // Validate token and fetch checkout data
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError("Missing checkout token. Please use the link from your email.")
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/public/agency-checkout?token=${encodeURIComponent(token)}`)
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || "Invalid or expired checkout link")
          setLoading(false)
          return
        }

        setCheckoutData(data.data)
      } catch (err) {
        setError("Failed to validate checkout link. Please try again.")
      } finally {
        setLoading(false)
      }
    }

    validateToken()
  }, [token])

  const handleCheckout = async () => {
    if (!token) return

    setProcessingCheckout(true)
    try {
      const res = await fetch("/api/public/agency-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout session")
      }

      // Redirect to Stripe Checkout
      if (data.data?.url) {
        window.location.href = data.data.url
      } else {
        throw new Error("No checkout URL returned")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout")
      setProcessingCheckout(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="pt-12 pb-12 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Validating checkout link...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-12 pb-12 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Checkout Link Invalid</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                If you believe this is an error, please contact your account manager or request a new checkout link.
              </p>
              <Button variant="outline" onClick={() => router.push("/")}>
                Return Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Already completed (status is not "approved")
  if (checkoutData && checkoutData.request.status !== "approved") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-12 pb-12 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Already Completed</h2>
            <p className="text-muted-foreground mb-6">
              This checkout has already been completed. Check your email for login credentials.
            </p>
            <Button onClick={() => router.push("/login")}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Main checkout view
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <Badge variant="secondary" className="mb-4">
            <CreditCard className="h-3 w-3 mr-1" />
            Complete Your Subscription
          </Badge>
          <h1 className="text-3xl font-bold">Welcome, {checkoutData?.request.contactName}!</h1>
          <p className="text-muted-foreground">
            Complete payment to activate your white-label platform for{" "}
            <strong>{checkoutData?.request.companyName}</strong>
          </p>
        </div>

        {/* Plan Details Card */}
        <Card className="border-primary/20">
          <CardHeader className="text-center pb-2">
            <CardDescription>Selected Plan</CardDescription>
            <CardTitle className="text-2xl">{checkoutData?.variant.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Price */}
            <div className="text-center py-4 bg-primary/5 rounded-lg">
              <span className="text-5xl font-bold">
                ${((checkoutData?.variant.monthlyPriceCents || 0) / 100).toFixed(0)}
              </span>
              <span className="text-muted-foreground text-lg">/month</span>
            </div>

            {/* Features */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <span>
                  {checkoutData?.variant.maxWorkspaces === -1
                    ? "Unlimited workspaces"
                    : `${checkoutData?.variant.maxWorkspaces} workspaces included`}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Globe className="h-4 w-4 text-primary" />
                </div>
                <span>
                  Your platform: <code className="bg-muted px-2 py-0.5 rounded text-xs">
                    {checkoutData?.request.desiredSubdomain}.genius365.app
                  </code>
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <span>Full white-label customization</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-primary" />
                </div>
                <span>Stripe Connect for billing your clients</span>
              </div>
            </div>

            {checkoutData?.variant.description && (
              <p className="text-sm text-muted-foreground text-center border-t pt-4">
                {checkoutData.variant.description}
              </p>
            )}

            {/* Checkout Button */}
            <Button
              onClick={handleCheckout}
              disabled={processingCheckout}
              className="w-full h-12 text-lg"
              size="lg"
            >
              {processingCheckout ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Redirecting to Stripe...
                </>
              ) : (
                <>
                  Complete Payment
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>

            {/* Expiry notice */}
            {checkoutData?.expiresAt && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Link expires: {new Date(checkoutData.expiresAt).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* What happens next */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What happens after payment?</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <span>Your platform is automatically provisioned</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <span>You receive login credentials via email</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  3
                </span>
                <span>Customize your branding and invite your team</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  4
                </span>
                <span>Start creating workspaces for your clients!</span>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Questions? Contact{" "}
          <a href="mailto:support@genius365.ai" className="text-primary hover:underline">
            support@genius365.ai
          </a>
        </p>
      </div>
    </div>
  )
}
