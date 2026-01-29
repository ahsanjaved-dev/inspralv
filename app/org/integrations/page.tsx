"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Plug,
  Plus,
  Loader2,
  Check,
  Key,
  Settings,
  Trash2,
  Star,
  Building2,
  AlertCircle,
  MoreVertical,
  ExternalLink,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  usePartnerIntegrations,
  useDeletePartnerIntegration,
  useSetDefaultIntegration,
  type PartnerIntegration,
} from "@/lib/hooks/use-partner-integrations"
import { AddIntegrationDialog } from "@/components/org/integrations/add-integration-dialog"
import { ManageIntegrationDialog } from "@/components/org/integrations/manage-integration-dialog"
import { toast } from "sonner"

// Provider configuration
const PROVIDERS = {
  vapi: {
    name: "Vapi",
    description: "Build and deploy AI voice agents with Vapi's platform",
    icon: "🎙️",
    category: "Voice AI",
  },
  retell: {
    name: "Retell AI",
    description: "Create conversational AI agents with Retell",
    icon: "🤖",
    category: "Voice AI",
  },
  algolia: {
    name: "Algolia",
    description: "Fast, reliable search for your call logs and transcripts",
    icon: "🔍",
    category: "Search",
  },
  google_calendar: {
    name: "Google Calendar",
    description: "Enable appointment booking, cancellation, and rescheduling via Google Calendar",
    icon: "📅",
    category: "Calendar",
  },
}

export default function OrgIntegrationsPage() {
  const { data: integrations, isLoading, error } = usePartnerIntegrations()
  const deleteIntegration = useDeletePartnerIntegration()
  const setDefault = useSetDefaultIntegration()

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addDialogProvider, setAddDialogProvider] = useState<"vapi" | "retell" | "algolia" | "google_calendar" | null>(null)
  const [manageDialogOpen, setManageDialogOpen] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<PartnerIntegration | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [integrationToDelete, setIntegrationToDelete] = useState<PartnerIntegration | null>(null)

  // Group integrations by provider
  const integrationsByProvider = integrations?.reduce((acc, integration) => {
    const provider = integration.provider as keyof typeof PROVIDERS
    if (!acc[provider]) {
      acc[provider] = []
    }
    acc[provider].push(integration)
    return acc
  }, {} as Record<string, PartnerIntegration[]>) || {}

  const handleAddIntegration = (provider: "vapi" | "retell" | "algolia" | "google_calendar") => {
    setAddDialogProvider(provider)
    setAddDialogOpen(true)
  }

  const handleManageIntegration = (integration: PartnerIntegration) => {
    setSelectedIntegration(integration)
    setManageDialogOpen(true)
  }

  const handleSetDefault = async (integration: PartnerIntegration) => {
    try {
      await setDefault.mutateAsync(integration.id)
      toast.success(`${integration.name} is now the default for ${PROVIDERS[integration.provider as keyof typeof PROVIDERS]?.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to set as default")
    }
  }

  const handleDeleteClick = (integration: PartnerIntegration) => {
    setIntegrationToDelete(integration)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!integrationToDelete) return
    try {
      await deleteIntegration.mutateAsync(integrationToDelete.id)
      toast.success(`${integrationToDelete.name} has been deleted`)
      setDeleteDialogOpen(false)
      setIntegrationToDelete(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete integration")
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Integrations</h1>
          <p className="text-muted-foreground mt-1">
            Manage API keys for voice providers and services. Keys are assigned to workspaces automatically.
          </p>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Key className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-blue-700 dark:text-blue-400">
                Org-Level API Key Management
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Add API keys here to make them available for all workspaces. The <strong>default key</strong> for each provider 
                is automatically assigned to new workspaces. You can have multiple keys per provider and assign different 
                keys to specific workspaces.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-red-600">Failed to load integrations. Please try again.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Integrations by Provider */}
      {!isLoading && !error && (
        <div className="space-y-6">
          {(Object.keys(PROVIDERS) as Array<keyof typeof PROVIDERS>).map((provider) => {
            const providerConfig = PROVIDERS[provider]
            const providerIntegrations = integrationsByProvider[provider] || []
            const hasIntegrations = providerIntegrations.length > 0

            return (
              <Card key={provider}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{providerConfig.icon}</span>
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {providerConfig.name}
                          <Badge variant="secondary" className="text-xs">
                            {providerConfig.category}
                          </Badge>
                        </CardTitle>
                        <CardDescription>{providerConfig.description}</CardDescription>
                      </div>
                    </div>
                    <Button onClick={() => handleAddIntegration(provider)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Key
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!hasIntegrations ? (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/30">
                      <Plug className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                      <h4 className="font-medium mb-1">No {providerConfig.name} keys configured</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Add an API key to enable {providerConfig.name} for your workspaces.
                      </p>
                      <Button variant="outline" onClick={() => handleAddIntegration(provider)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add {providerConfig.name} Key
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {providerIntegrations.map((integration) => (
                        <div
                          key={integration.id}
                          className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Key className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{integration.name}</p>
                                {integration.is_default && (
                                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                                    <Star className="h-3 w-3 mr-1" />
                                    Default
                                  </Badge>
                                )}
                                {!integration.is_active && (
                                  <Badge variant="secondary">Inactive</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Check className="h-3 w-3 text-green-500" />
                                  Secret key
                                </span>
                                {integration.has_default_public_key && (
                                  <span className="flex items-center gap-1">
                                    <Check className="h-3 w-3 text-green-500" />
                                    Public key
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {integration.assigned_workspaces_count || 0} workspace(s)
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Google Calendar: Show Connect button */}
                            {provider === "google_calendar" && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => window.location.href = '/api/auth/google-calendar/authorize'}
                              >
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Connect Google
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleManageIntegration(integration)}
                            >
                              <Settings className="h-4 w-4 mr-1" />
                              Manage
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {!integration.is_default && (
                                  <DropdownMenuItem onClick={() => handleSetDefault(integration)}>
                                    <Star className="h-4 w-4 mr-2" />
                                    Set as Default
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => handleDeleteClick(integration)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add Integration Dialog */}
      <AddIntegrationDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        provider={addDialogProvider}
      />

      {/* Manage Integration Dialog */}
      <ManageIntegrationDialog
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
        integration={selectedIntegration}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Integration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{integrationToDelete?.name}</strong>?
              {(integrationToDelete?.assigned_workspaces_count || 0) > 0 && (
                <span className="block mt-2 text-red-600">
                  Warning: This integration is assigned to {integrationToDelete?.assigned_workspaces_count} workspace(s). 
                  You must reassign these workspaces first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteIntegration.isPending || (integrationToDelete?.assigned_workspaces_count || 0) > 0}
            >
              {deleteIntegration.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

