"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle2, PartyPopper, Mail, Clock } from "lucide-react"

export default function AgencyCheckoutSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get("session_id")
  
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")

  useEffect(() => {
    // Simple validation - the webhook will handle the actual provisioning
    if (sessionId) {
      // Give a moment for the webhook to process
      const timer = setTimeout(() => {
        setStatus("success")
      }, 2000)
      return () => clearTimeout(timer)
    }
    setStatus("error")
    return undefined
  }, [sessionId])

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="pt-12 pb-12 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Processing your payment...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-12 pb-12 text-center">
            <p className="text-muted-foreground mb-4">
              Something went wrong. Please contact support if you were charged.
            </p>
            <Button onClick={() => router.push("/")}>Return Home</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-green-500/5 p-4">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-12 pb-12 text-center space-y-6">
          {/* Success Icon */}
          <div className="relative">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8">
              <PartyPopper className="h-8 w-8 text-yellow-500" />
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-green-600">Payment Successful!</h1>
            <p className="text-muted-foreground">
              Welcome to your new white-label platform
            </p>
          </div>

          {/* What's happening */}
          <div className="bg-muted rounded-lg p-4 text-left space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Setting up your platform</p>
                <p className="text-xs text-muted-foreground">
                  We're provisioning your account, domain, and workspace. This usually takes less than a minute.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Check your email</p>
                <p className="text-xs text-muted-foreground">
                  You'll receive login credentials and your platform URL shortly.
                </p>
              </div>
            </div>
          </div>

          {/* Next steps */}
          <div className="text-sm text-muted-foreground">
            <p>
              <strong>Next steps:</strong> Once you receive your credentials, log in to customize your branding, 
              invite your team, and start creating workspaces for your clients.
            </p>
          </div>

          {/* CTA */}
          <div className="pt-4">
            <p className="text-xs text-muted-foreground mb-4">
              Didn't receive an email? Check your spam folder or contact support@genius365.ai
            </p>
            <Button variant="outline" onClick={() => router.push("/")}>
              Return to Homepage
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
