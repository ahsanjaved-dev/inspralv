"use client"

/**
 * MFA Challenge Component
 * Prompts users to enter their TOTP code when logging in
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
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react"

interface MFAChallengeProps {
  onVerified?: () => void
  onCancel?: () => void
}

interface Factor {
  id: string
  type: string
  friendly_name?: string
  status: string
}

export function MFAChallenge({ onVerified, onCancel }: MFAChallengeProps) {
  const [loading, setLoading] = useState(false)
  const [loadingFactors, setLoadingFactors] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [factors, setFactors] = useState<Factor[]>([])
  const [selectedFactor, setSelectedFactor] = useState<Factor | null>(null)
  const [code, setCode] = useState("")
  
  // Load factors on mount
  useEffect(() => {
    loadFactors()
  }, [])
  
  const loadFactors = async () => {
    setLoadingFactors(true)
    
    try {
      const response = await fetch("/api/auth/mfa")
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to load MFA factors")
      }
      
      const verifiedFactors = data.factors.filter(
        (f: Factor) => f.status === "verified"
      )
      
      setFactors(verifiedFactors)
      
      // Auto-select the first TOTP factor
      const totpFactor = verifiedFactors.find((f: Factor) => f.type === "totp")
      if (totpFactor) {
        setSelectedFactor(totpFactor)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load factors")
    } finally {
      setLoadingFactors(false)
    }
  }
  
  const handleVerify = async () => {
    if (!selectedFactor || !code) return
    
    setLoading(true)
    setError(null)
    
    try {
      // Create challenge
      const challengeResponse = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "challenge", factorId: selectedFactor.id }),
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
          factorId: selectedFactor.id,
          challengeId: challengeData.challengeId,
          code,
        }),
      })
      
      const verifyData = await verifyResponse.json()
      
      if (!verifyResponse.ok) {
        throw new Error(verifyData.error || "Invalid verification code")
      }
      
      onVerified?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed")
      setCode("") // Clear the code on error
    } finally {
      setLoading(false)
    }
  }
  
  // Handle enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && code.length === 6 && !loading) {
      handleVerify()
    }
  }
  
  if (loadingFactors) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }
  
  if (factors.length === 0) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>No MFA Factors Found</CardTitle>
          <CardDescription>
            You don't have any MFA factors set up yet.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={onCancel}>
            Go Back
          </Button>
        </CardFooter>
      </Card>
    )
  }
  
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Enter the code from your authenticator app
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="space-y-2">
          <Label htmlFor="mfaCode">Verification Code</Label>
          <Input
            id="mfaCode"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={handleKeyDown}
            className="text-center text-2xl tracking-widest font-mono"
            autoFocus
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground text-center">
            Open your authenticator app to view your code
          </p>
        </div>
      </CardContent>
      
      <CardFooter className="flex gap-2">
        {onCancel && (
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        )}
        
        <Button
          className="flex-1"
          onClick={handleVerify}
          disabled={loading || code.length !== 6}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Verify
        </Button>
      </CardFooter>
    </Card>
  )
}

