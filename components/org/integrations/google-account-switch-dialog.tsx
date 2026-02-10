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
  Loader2,
} from "lucide-react"
import type { GoogleCredentialsStatus } from "@/lib/hooks/use-partner-integrations"

interface GoogleAccountSwitchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: GoogleCredentialsStatus | null
  isLoading?: boolean
  onConfirm: () => void
}

export function GoogleAccountSwitchDialog({
  open,
  onOpenChange,
  status,
  isLoading = false,
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
    // Allow confirmation if either: no active agents, or user has confirmed
    if (!hasActiveAgents || confirmed) {
      onConfirm()
      handleOpenChange(false)
    }
  }

  // Get agents that will be affected by the switch
  const allAgents = status?.affectedAgents || []
  const activeAgents = allAgents.filter(a => a.isActive)
  const inactiveAgents = allAgents.filter(a => !a.isActive)
  const hasActiveAgents = activeAgents.length > 0
  const hasInactiveAgents = inactiveAgents.length > 0
  const hasAnyAgents = allAgents.length > 0

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
              {/* Loading state */}
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading account information...</p>
                  </div>
                </div>
              )}

              {/* Current account info */}
              {!isLoading && status?.googleEmail && (
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-sm font-medium text-foreground">
                    Currently connected:
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {status.googleEmail}
                  </p>
                </div>
              )}

              {/* Warning about affected agents - ACTIVE agents will be deactivated */}
              {!isLoading && hasActiveAgents && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        {activeAgents.length} active agent{activeAgents.length !== 1 ? "s" : ""} will be deactivated
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Calendar configurations for these agents will be temporarily deactivated when you switch accounts.
                      </p>
                    </div>
                  </div>

                  {/* Collapsible agent list */}
                  <Collapsible open={showAgentList} onOpenChange={setShowAgentList}>
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline">
                      {showAgentList ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          Hide agents
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          Show agents
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
                              <Calendar className="h-3 w-3 text-green-500 shrink-0" />
                              <span className="font-medium truncate">{agent.name}</span>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-muted-foreground truncate">
                                {agent.workspaceName}
                              </span>
                              <Badge variant="outline" className="ml-auto text-[10px] bg-green-500/10 text-green-600 border-green-500/30">
                                Active
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {/* Info about inactive agents - will be reactivated if switching back to same email */}
              {!isLoading && !hasActiveAgents && hasInactiveAgents && (
                <div className="rounded-lg border border-blue-500/50 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        {inactiveAgents.length} inactive agent{inactiveAgents.length !== 1 ? "s" : ""} available
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        These calendar configurations were created with <strong>{status?.googleEmail}</strong>. 
                        They will be automatically reactivated if you connect the same account again.
                      </p>
                    </div>
                  </div>

                  {/* Collapsible inactive agent list */}
                  <Collapsible open={showAgentList} onOpenChange={setShowAgentList}>
                    <CollapsibleTrigger className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      {showAgentList ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          Hide agents
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          Show agents
                        </>
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ScrollArea className="h-[120px] mt-2">
                        <div className="space-y-1.5">
                          {inactiveAgents.map((agent) => (
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
                              <Badge variant="outline" className="ml-auto text-[10px] bg-gray-500/10 text-gray-600 border-gray-500/30">
                                Inactive
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {/* Smart reactivation notice */}
              {!isLoading && status?.googleEmail && (
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
              )}

              {/* No agents message - only show if NO agents at all */}
              {!isLoading && !hasAnyAgents && status?.googleEmail && (
                <p className="text-sm text-muted-foreground">
                  No agents are currently using this Google Calendar connection.
                  You can safely switch to a different account.
                </p>
              )}

              {/* First time connection */}
              {!isLoading && !status?.googleEmail && (
                <p className="text-sm text-muted-foreground">
                  You'll be redirected to Google to authorize calendar access.
                  After connecting, you can configure your agents to use Google Calendar for appointments.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Confirmation checkbox - only show if there are ACTIVE agents that will be deactivated */}
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
              I understand that {activeAgents.length} active agent calendar configuration
              {activeAgents.length !== 1 ? "s" : ""} will be temporarily deactivated
            </label>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading || (hasActiveAgents && !confirmed)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              status?.googleEmail ? "Switch Account" : "Connect Google Account"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

