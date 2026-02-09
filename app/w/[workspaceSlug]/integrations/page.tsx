"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Plug, Calendar, Plus, Settings as SettingsIcon, ExternalLink } from "lucide-react"
import { ConnectCalcomDialog } from "@/components/workspace/integrations/connect-calcom-dialog"
import { useWorkspaceIntegrations } from "@/lib/hooks/use-workspace-integrations"

// ============================================================================
// AVAILABLE INTEGRATIONS
// ============================================================================

interface Integration {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  category: string
  docsUrl: string
  enabled?: boolean
}

const AVAILABLE_INTEGRATIONS: Integration[] = [
  {
    id: "calcom",
    name: "Cal.com",
    description: "Enable appointment booking with Cal.com calendars for Retell agents",
    icon: <Calendar className="h-6 w-6" />,
    category: "calendar",
    docsUrl: "https://cal.com/docs/api-reference",
  },
]

// ============================================================================
// COMPONENT
// ============================================================================

export default function IntegrationsPage() {
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [isManageMode, setIsManageMode] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: existingIntegrations, isLoading } = useWorkspaceIntegrations()

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setSelectedIntegration(null)
    setIsManageMode(false)
  }

  const handleConnect = (integration: Integration) => {
    setSelectedIntegration(integration)
    setIsManageMode(false)
    setDialogOpen(true)
  }

  const handleManage = (integration: Integration) => {
    setSelectedIntegration(integration)
    setIsManageMode(true)
    setDialogOpen(true)
  }

  const isIntegrationConnected = (integrationId: string) => {
    return existingIntegrations?.some(
      (i) => i.provider === integrationId && i.is_active
    )
  }

  const renderIntegrationCard = (integration: Integration) => {
    const isConnected = isIntegrationConnected(integration.id)

    return (
      <Card key={integration.id} className="hover:shadow-md transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                {integration.icon}
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {integration.name}
                  {isConnected && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      Connected
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1">
                  {integration.description}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <a
              href={integration.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              Documentation
              <ExternalLink className="h-3 w-3" />
            </a>
            {isConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleManage(integration)}
              >
                <SettingsIcon className="h-4 w-4 mr-2" />
                Manage
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => handleConnect(integration)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Connect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Plug className="h-8 w-8" />
          Integrations
        </h1>
        <p className="text-muted-foreground mt-2">
          Connect third-party services to extend your workspace capabilities. These integrations are available to all agents in this workspace.
        </p>
      </div>

      <Separator />

      {/* Integrations Grid */}
      <div className="space-y-6">
        {/* Calendar Category */}
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Calendar & Scheduling
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {AVAILABLE_INTEGRATIONS.filter((i) => i.category === "calendar").map(
              renderIntegrationCard
            )}
          </div>
        </div>
      </div>

      {/* Integration Dialogs */}
      {selectedIntegration?.id === "calcom" && (
        <ConnectCalcomDialog
          open={dialogOpen}
          onOpenChange={handleCloseDialog}
          isManageMode={isManageMode}
        />
      )}
    </div>
  )
}

