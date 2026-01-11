"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { PhoneOutgoing, Loader2 } from "lucide-react"
import { TestOutboundCallModal } from "./test-outbound-call-modal"
import type { AIAgent } from "@/types/database.types"

interface TestOutboundCallButtonProps {
  agent: AIAgent
  workspaceSlug: string
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  showDisabledReason?: boolean
}

export function TestOutboundCallButton({
  agent,
  workspaceSlug,
  variant = "outline",
  size = "sm",
  className,
  showDisabledReason = false,
}: TestOutboundCallButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Check if agent can make outbound calls
  const canMakeOutboundCall = agent.provider === "vapi" && !!agent.external_agent_id
  
  // Determine reason if can't make calls
  let disabledReason: string | null = null
  let disabledSolution: string | null = null
  
  if (agent.provider !== "vapi") {
    disabledReason = "Outbound calls only work with Vapi agents"
    disabledSolution = "Change the agent provider to Vapi"
  } else if (!agent.external_agent_id) {
    disabledReason = "Agent must be synced to Vapi first"
    disabledSolution = "Save the agent to sync it with Vapi"
  }

  if (!canMakeOutboundCall) {
    return (
      <div className={showDisabledReason ? "flex flex-col gap-2" : ""}>
        <Button variant={variant} size={size} disabled className={className}>
          <PhoneOutgoing className="mr-2 h-3 w-3" />
          Test Outbound
        </Button>
        {showDisabledReason && disabledReason && (
          <div className="text-xs text-muted-foreground bg-muted/50 dark:bg-muted/30 rounded-md p-2 border border-border/50">
            <p className="font-medium text-foreground/80">{disabledReason}</p>
            <p className="mt-0.5">{disabledSolution}</p>
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
        <PhoneOutgoing className="mr-2 h-3 w-3" />
        Test Outbound
      </Button>

      <TestOutboundCallModal 
        agent={agent} 
        workspaceSlug={workspaceSlug}
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
      />
    </>
  )
}

