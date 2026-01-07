"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useWorkspaceIntegrations } from "@/lib/hooks/use-workspace-integrations"
import { ConnectIntegrationDialog } from "@/components/workspace/integrations/connect-integartion-dialog"
import { ConnectAlgoliaDialog } from "@/components/workspace/integrations/connect-algolia-dialog"
import { Plug, Loader2, Check, Plus } from "lucide-react"

interface AvailableIntegration {
  id: string
  name: string
  description: string
  icon: string
  category: string
}

const availableIntegrations: AvailableIntegration[] = [
  {
    id: "vapi",
    name: "Vapi",
    description: "Build and deploy AI voice agents with Vapi's platform",
    icon: "🎙️",
    category: "Voice AI",
  },
  {
    id: "retell",
    name: "Retell AI",
    description: "Create conversational AI agents with Retell",
    icon: "🤖",
    category: "Voice AI",
  },
  {
    id: "algolia",
    name: "Algolia",
    description: "Fast, reliable search for your call logs and transcripts",
    icon: "🔍",
    category: "Search",
  },
]

export default function WorkspaceIntegrationsPage() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  const [dialogState, setDialogState] = useState<{
    open: boolean
    integration: AvailableIntegration | null
    isManageMode: boolean
  }>({
    open: false,
    integration: null,
    isManageMode: false,
  })

  const [algoliaDialogState, setAlgoliaDialogState] = useState<{
    open: boolean
    isManageMode: boolean
  }>({
    open: false,
    isManageMode: false,
  })

  const { data: connectedIntegrations, isLoading, error } = useWorkspaceIntegrations()

  const connectedProviders = new Set(connectedIntegrations?.map((i) => i.provider) || [])

  const handleOpenDialog = (integration: AvailableIntegration, isManageMode: boolean) => {
    // Use special dialog for Algolia
    if (integration.id === "algolia") {
      setAlgoliaDialogState({
        open: true,
        isManageMode,
      })
      return
    }

    setDialogState({
      open: true,
      integration,
      isManageMode,
    })
  }

  const handleCloseDialog = () => {
    setDialogState({
      open: false,
      integration: null,
      isManageMode: false,
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect your voice AI providers to enable agent syncing
        </p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-12 border rounded-lg bg-red-50 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">Failed to load integrations.</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}

      {/* Integrations Grid */}
      {!isLoading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {availableIntegrations.map((integration) => {
            const isConnected = connectedProviders.has(integration.id)
            const connectedInfo = connectedIntegrations?.find((i) => i.provider === integration.id)

            return (
              <Card key={integration.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{integration.icon}</span>
                      <div>
                        <CardTitle className="text-lg">{integration.name}</CardTitle>
                        <Badge variant="secondary" className="mt-1">
                          {integration.category}
                        </Badge>
                      </div>
                    </div>
                    {isConnected && (
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                        <Check className="w-3 h-3 mr-1" />
                        Connected
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CardDescription>{integration.description}</CardDescription>

                  {isConnected && connectedInfo && (
                    <div className="text-sm text-muted-foreground">
                      <p>Name: {connectedInfo.name}</p>
                      {connectedInfo.additional_keys_count > 0 && (
                        <p>{connectedInfo.additional_keys_count} additional key(s)</p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {isConnected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleOpenDialog(integration, true)}
                      >
                        Manage
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => handleOpenDialog(integration, false)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Connect
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Empty connected state info */}
      {!isLoading && !error && connectedProviders.size === 0 && (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <Plug className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No integrations connected</h3>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
            Connect a voice AI provider above to start syncing your agents.
          </p>
        </div>
      )}

      {/* Connect/Manage Dialog */}
      <ConnectIntegrationDialog
        open={dialogState.open}
        onOpenChange={(open) => {
          if (!open) handleCloseDialog()
        }}
        integration={dialogState.integration}
        isManageMode={dialogState.isManageMode}
      />

      {/* Algolia Connect/Manage Dialog */}
      <ConnectAlgoliaDialog
        open={algoliaDialogState.open}
        onOpenChange={(open) => {
          if (!open) {
            setAlgoliaDialogState({ open: false, isManageMode: false })
          }
        }}
        isManageMode={algoliaDialogState.isManageMode}
      />
    </div>
  )
}
