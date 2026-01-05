"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { 
  Coins, 
  Loader2, 
  Plus, 
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle
} from "lucide-react"
import { useCredits, useTopupIntent } from "@/lib/hooks/use-billing"
import { toast } from "sonner"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"

// Initialize Stripe - memoized at module level to prevent re-creation
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY 
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) 
  : null

// Top-up amount options
const TOPUP_OPTIONS = [
  { label: "$10", value: 1000 },
  { label: "$25", value: 2500 },
  { label: "$50", value: 5000 },
  { label: "$100", value: 10000 },
]

// =============================================================================
// PAYMENT FORM (inside Elements provider)
// =============================================================================

function PaymentForm({ 
  onSuccess, 
  onCancel,
  amountCents 
}: { 
  onSuccess: () => void
  onCancel: () => void
  amountCents: number
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsProcessing(true)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/org/billing?topup=success`,
      },
    })

    if (error) {
      toast.error(error.message || "Payment failed")
      setIsProcessing(false)
    }
    // If successful, user will be redirected
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center mb-4">
        <p className="text-2xl font-bold">${(amountCents / 100).toFixed(2)}</p>
        <p className="text-sm text-muted-foreground">Credit top-up</p>
      </div>
      
      <PaymentElement />
      
      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={isProcessing}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={!stripe || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            `Pay $${(amountCents / 100).toFixed(2)}`
          )}
        </Button>
      </div>
    </form>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function CreditsCard() {
  const { data, isLoading, refetch } = useCredits()
  const topupIntent = useTopupIntent()
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const credits = data?.credits
  const transactions = data?.transactions || []

  const handleSelectAmount = async (amountCents: number) => {
    setSelectedAmount(amountCents)
    try {
      const result = await topupIntent.mutateAsync(amountCents)
      setClientSecret(result.clientSecret)
      setIsDialogOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start top-up")
      setSelectedAmount(null)
    }
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    setClientSecret(null)
    setSelectedAmount(null)
  }

  const handlePaymentSuccess = () => {
    handleDialogClose()
    toast.success("Credits added successfully!")
    refetch()
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Credits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5" />
                Credits
              </CardTitle>
              <CardDescription>
                Prepaid balance for usage-based billing
              </CardDescription>
            </div>
            {credits?.isLowBalance && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Low Balance
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Balance Display */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border">
            <div>
              <p className="text-sm text-muted-foreground">Current Balance</p>
              <p className="text-3xl font-bold">
                ${credits?.balanceDollars.toFixed(2) || "0.00"}
              </p>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  ~{credits?.estimatedMinutesRemaining || 0} min remaining
                </span>
                <span>@ ${((credits?.perMinuteRateCents || 15) / 100).toFixed(2)}/min</span>
              </div>
            </div>
          </div>

          {/* Top-up Options */}
          <div>
            <p className="text-sm font-medium mb-3">Add Credits</p>
            <div className="grid grid-cols-4 gap-2">
              {TOPUP_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant="outline"
                  className="h-12"
                  onClick={() => handleSelectAmount(option.value)}
                  disabled={topupIntent.isPending && selectedAmount === option.value}
                >
                  {topupIntent.isPending && selectedAmount === option.value ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-1" />
                      {option.label}
                    </>
                  )}
                </Button>
              ))}
            </div>
          </div>

          {/* Recent Transactions */}
          {transactions.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-3">Recent Activity</p>
              <div className="space-y-2">
                {transactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-full ${
                        tx.amountCents > 0 
                          ? "bg-green-500/10 text-green-600" 
                          : "bg-red-500/10 text-red-600"
                      }`}>
                        {tx.amountCents > 0 ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium capitalize">{tx.type}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.description || new Date(tx.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${
                        tx.amountCents > 0 ? "text-green-600" : "text-red-600"
                      }`}>
                        {tx.amountCents > 0 ? "+" : ""}${(tx.amountCents / 100).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Bal: ${(tx.balanceAfterCents / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Credits</DialogTitle>
            <DialogDescription>
              Complete your payment to add credits to your account
            </DialogDescription>
          </DialogHeader>
          
          {!stripePromise && (
            <div className="p-4 text-center text-red-500">
              <p className="font-medium">Failed to load Stripe</p>
              <p className="text-sm text-muted-foreground mt-2">
                Unable to load payment form. Please check your internet connection
                or try refreshing the page.
              </p>
            </div>
          )}
          
          {clientSecret && selectedAmount && stripePromise && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: "night",
                  variables: {
                    colorPrimary: "#7c3aed",
                  },
                },
              }}
            >
              <PaymentForm
                amountCents={selectedAmount}
                onSuccess={handlePaymentSuccess}
                onCancel={handleDialogClose}
              />
            </Elements>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

