"use client"

import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp, 
  Calendar,
  RefreshCw,
  CheckCircle2,
} from "lucide-react"
import type { GoogleCredentialsStatus } from "@/lib/hooks/use-partner-integrations"

interface GoogleAccountSwitchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: GoogleCredentialsStatus | null
  onConfirm: () => void
}

export function GoogleAccountSwitchDialog({
  open,
  onOpenChange,
  status,
  onConfirm,
}: GoogleAccountSwitchDialogProps) {
  const [confirmed, setConfirmed] = useState(false)
  const [showAgentList, setShowAgentList] = useState(false)

  // Reset confirmation when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setConfirmed(false)
      setShowAgentList(false)
    }
    onOpenChange(newOpen)
  }

  const handleConfirm = () => {
    if (confirmed) {
      onConfirm()
      handleOpenChange(false)
    }
  }

  // Get active agents that will be affected by the switch
  const activeAgents = status?.affectedAgents.filter(a => a.isActive) || []
  const hasActiveAgents = activeAgents.length > 0

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-500" />
            Switch Google Account
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {/* Current account info */}
              {status?.googleEmail && (
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-sm font-medium text-foreground">
                    Currently connected:
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {status.googleEmail}
                  </p>
                </div>
              )}

              {/* Warning about affected agents */}
              {hasActiveAgents && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        {activeAgents.length} agent{activeAgents.length !== 1 ? "s" : ""} will be affected
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Calendar configurations for these agents will be deactivated when you switch accounts.
                      </p>
                    </div>
                  </div>

                  {/* Collapsible agent list */}
                  <Collapsible open={showAgentList} onOpenChange={setShowAgentList}>
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline">
                      {showAgentList ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          Hide affected agents
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          Show affected agents
                        </>
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ScrollArea className="h-[120px] mt-2">
                        <div className="space-y-1.5">
                          {activeAgents.map((agent) => (
                            <div
                              key={agent.id}
                              className="flex items-center gap-2 text-xs bg-background/50 rounded px-2 py-1.5"
                            >
                              <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="font-medium truncate">{agent.name}</span>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-muted-foreground truncate">
                                {agent.workspaceName}
                              </span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {/* Smart reactivation notice */}
              <div className="rounded-lg border border-green-500/50 bg-green-50 dark:bg-green-950/30 p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-300">
                      Smart Reactivation Enabled
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      If you switch back to{" "}
                      <strong>{status?.googleEmail || "this account"}</strong>{" "}
                      later, your calendar configurations will be automatically restored.
                    </p>
                  </div>
                </div>
              </div>

              {/* No agents message */}
              {!hasActiveAgents && status?.googleEmail && (
                <p className="text-sm text-muted-foreground">
                  No agents are currently using this Google Calendar connection.
                  You can safely switch to a different account.
                </p>
              )}

              {/* First time connection */}
              {!status?.googleEmail && (
                <p className="text-sm text-muted-foreground">
                  You'll be redirected to Google to authorize calendar access.
                  After connecting, you can configure your agents to use Google Calendar for appointments.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Confirmation checkbox - only show if there are affected agents */}
        {hasActiveAgents && (
          <div className="flex items-start space-x-3 py-2">
            <Checkbox
              id="confirm-switch"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <label
              htmlFor="confirm-switch"
              className="text-sm leading-tight cursor-pointer"
            >
              I understand that {activeAgents.length} agent calendar configuration
              {activeAgents.length !== 1 ? "s" : ""} will be temporarily deactivated
            </label>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={hasActiveAgents && !confirmed}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {status?.googleEmail ? "Switch Account" : "Connect Google Account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

