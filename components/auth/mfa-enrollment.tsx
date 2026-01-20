"use client"

/**
 * MFA Enrollment Component
 * Allows users to set up TOTP-based MFA for their account
 */

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert"
import { Loader2, ShieldCheck, Copy, Check, AlertCircle } from "lucide-react"
import { toast } from "sonner"

interface MFAEnrollmentProps {
  onEnrolled?: () => void
  onCancelled?: () => void
}

export function MFAEnrollment({ onEnrolled, onCancelled }: MFAEnrollmentProps) {
  const [step, setStep] = useState<"setup" | "verify">("setup")
  const [loading, setLoading] = useState(false)
  const [enrolling, setEnrolling] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Enrollment data
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  
  // Verification
  const [verifyCode, setVerifyCode] = useState("")
  const [copied, setCopied] = useState(false)
  
  // Start enrollment on mount
  useEffect(() => {
    startEnrollment()
  }, [])
  
  const startEnrollment = async () => {
    setEnrolling(true)
    setError(null)
    
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enroll" }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to start enrollment")
      }
      
      setFactorId(data.factorId)
      setQrCode(data.qrCode)
      setSecret(data.secret)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start enrollment")
    } finally {
      setEnrolling(false)
    }
  }
  
  const handleVerify = async () => {
    if (!factorId || !verifyCode) return
    
    setLoading(true)
    setError(null)
    
    try {
      // Create challenge
      const challengeResponse = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "challenge", factorId }),
      })
      
      const challengeData = await challengeResponse.json()
      
      if (!challengeResponse.ok) {
        throw new Error(challengeData.error || "Failed to create challenge")
      }
      
      // Verify
      const verifyResponse = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          factorId,
          challengeId: challengeData.challengeId,
          code: verifyCode,
        }),
      })
      
      const verifyData = await verifyResponse.json()
      
      if (!verifyResponse.ok) {
        throw new Error(verifyData.error || "Invalid verification code")
      }
      
      toast.success("Two-factor authentication enabled!")
      onEnrolled?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed")
    } finally {
      setLoading(false)
    }
  }
  
  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret)
      setCopied(true)
      toast.success("Secret copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    }
  }
  
  if (enrolling) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Set Up Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Add an extra layer of security to your account
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {step === "setup" && (
          <>
            <div className="space-y-2">
              <Label>1. Scan QR Code</Label>
              <p className="text-sm text-muted-foreground">
                Open your authenticator app (like Google Authenticator, 1Password, or Authy) and scan this QR code.
              </p>
              
              {qrCode && (
                <div className="flex justify-center py-4">
                  <img
                    src={qrCode}
                    alt="MFA QR Code"
                    className="h-48 w-48 rounded-lg border bg-white p-2"
                  />
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label>Can't scan? Enter this code manually:</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                  {secret}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copySecret}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            
            <Button
              className="w-full"
              onClick={() => setStep("verify")}
            >
              I've scanned the code
            </Button>
          </>
        )}
        
        {step === "verify" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="verifyCode">2. Enter Verification Code</Label>
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app to verify setup.
              </p>
              
              <Input
                id="verifyCode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-2xl tracking-widest font-mono"
                autoFocus
              />
            </div>
          </>
        )}
      </CardContent>
      
      <CardFooter className="flex gap-2">
        {step === "verify" && (
          <Button
            variant="outline"
            onClick={() => setStep("setup")}
            disabled={loading}
          >
            Back
          </Button>
        )}
        
        {onCancelled && (
          <Button
            variant="ghost"
            onClick={onCancelled}
            disabled={loading}
          >
            Cancel
          </Button>
        )}
        
        {step === "verify" && (
          <Button
            className="flex-1"
            onClick={handleVerify}
            disabled={loading || verifyCode.length !== 6}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enable Two-Factor Auth
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

