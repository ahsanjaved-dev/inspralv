"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Phone, Loader2 } from "lucide-react"
import { TestCallModal } from "./test-call-modal"
import { useTestCallValidation } from "@/lib/hooks/use-test-call-validation"
import type { AIAgent } from "@/types/database.types"

interface TestCallButtonProps {
  agent: AIAgent
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  showDisabledReason?: boolean
}

export function TestCallButton({
  agent,
  variant = "outline",
  size = "sm",
  className,
  showDisabledReason = false,
}: TestCallButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const validation = useTestCallValidation(agent)

  if (validation.isLoading) {
    return (
      <Button variant={variant} size={size} disabled className={className}>
        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
        Loading...
      </Button>
    )
  }

  if (!validation.canCall) {
    return (
      <div className={showDisabledReason ? "flex flex-col gap-2" : ""}>
        <Button variant={variant} size={size} disabled className={className}>
          <Phone className="mr-2 h-3 w-3" />
          Test Call
        </Button>
        {showDisabledReason && validation.reason && (
          <div className="text-xs text-muted-foreground bg-muted/50 dark:bg-muted/30 rounded-md p-2 border border-border/50">
            <p className="font-medium text-foreground/80">{validation.reason}</p>
            <p className="mt-0.5">{validation.solution}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setIsModalOpen(true)}
        className={className}
      >
        <Phone className="mr-2 h-3 w-3" />
        Test Call
      </Button>

      <TestCallModal agent={agent} open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  )
}