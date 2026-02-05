"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Key, Globe, Eye, EyeOff, Building2, Star } from "lucide-react"
import {
  usePartnerIntegration,
  useUpdatePartnerIntegration,
  type PartnerIntegration,
} from "@/lib/hooks/use-partner-integrations"
import { toast } from "sonner"

interface ManageIntegrationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  integration: PartnerIntegration | null
}

const PROVIDER_LABELS = {
  vapi: "Vapi",
  retell: "Retell AI",
  algolia: "Algolia",
  google_calendar: "Google Calendar",
  elevenlabs: "ElevenLabs",
}

export function ManageIntegrationDialog({ open, onOpenChange, integration }: ManageIntegrationDialogProps) {
  const { data: integrationDetail, isLoading } = usePartnerIntegration(open ? integration?.id || null : null)
  const updateIntegration = useUpdatePartnerIntegration(integration?.id || "")

  // Form state
  const [name, setName] = useState("")
  const [secretKey, setSecretKey] = useState("")
  const [publicKey, setPublicKey] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [showSecretKey, setShowSecretKey] = useState(false)
  
  // Algolia-specific fields
  const [algoliaAppId, setAlgoliaAppId] = useState("")
  const [algoliaAdminKey, setAlgoliaAdminKey] = useState("")
  const [algoliaSearchKey, setAlgoliaSearchKey] = useState("")
  const [algoliaIndex, setAlgoliaIndex] = useState("")

  // Reset form when integration changes
  useEffect(() => {
    if (integration) {
      setName(integration.name)
      setIsActive(integration.is_active)
      setSecretKey("") // Don't show actual key
      setPublicKey("")
      
      // Algolia config
      if (integration.provider === "algolia" && integration.config) {
        const config = integration.config as any
        setAlgoliaAppId(config.app_id || "")
        setAlgoliaIndex(config.call_logs_index || "")
        setAlgoliaAdminKey("")
        setAlgoliaSearchKey("")
      }
    }
  }, [integration])

  const isAlgolia = integration?.provider === "algolia"
  const isElevenLabs = integration?.provider === "elevenlabs"
  const isGoogleCalendar = integration?.provider === "google_calendar"
  const providerLabel = integration?.provider ? PROVIDER_LABELS[integration.provider as keyof typeof PROVIDER_LABELS] : ""

  const handleClose = () => {
    setShowSecretKey(false)
    onOpenChange(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!integration) return

    try {
      const payload: any = {
        name: name.trim(),
        is_active: isActive,
      }

      // Only include keys if they were changed (not empty)
      if (isAlgolia) {
        if (algoliaAdminKey) {
          payload.default_secret_key = algoliaAdminKey
        }
        if (algoliaSearchKey) {
          payload.default_public_key = algoliaSearchKey
        }
        payload.config = {
          app_id: algoliaAppId,
          call_logs_index: algoliaIndex,
        }
      } else if (isElevenLabs) {
        if (secretKey) {
          payload.default_secret_key = secretKey
          payload.config = {
            elevenlabs_api_key: secretKey,
          }
        }
      } else {
        if (secretKey) {
          payload.default_secret_key = secretKey
        }
        if (publicKey) {
          payload.default_public_key = publicKey
        }
      }

      await updateIntegration.mutateAsync(payload)
      toast.success("Integration updated successfully")
      handleClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update integration")
    }
  }

  if (!integration) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Manage {providerLabel} Integration
            {integration.is_default && (
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                <Star className="h-3 w-3 mr-1" />
                Default
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Update API keys and settings for this integration
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="settings" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="workspaces">
              Assigned Workspaces ({integrationDetail?.assigned_workspaces?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              {/* Integration Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-name">Integration Name</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {isAlgolia ? (
                // Algolia-specific fields
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-algolia-app-id">Application ID</Label>
                    <Input
                      id="edit-algolia-app-id"
                      value={algoliaAppId}
                      onChange={(e) => setAlgoliaAppId(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-algolia-admin-key" className="flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      Admin API Key
                    </Label>
                    <div className="relative">
                      <Input
                        id="edit-algolia-admin-key"
                        type={showSecretKey ? "text" : "password"}
                        placeholder="Enter new key to update (leave empty to keep current)"
                        value={algoliaAdminKey}
                        onChange={(e) => setAlgoliaAdminKey(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowSecretKey(!showSecretKey)}
                      >
                        {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {integration.has_default_secret_key && (
                      <p className="text-xs text-green-600">✓ Admin key configured</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-algolia-search-key" className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Search API Key
                    </Label>
                    <Input
                      id="edit-algolia-search-key"
                      placeholder="Enter new key to update (leave empty to keep current)"
                      value={algoliaSearchKey}
                      onChange={(e) => setAlgoliaSearchKey(e.target.value)}
                    />
                    {integration.has_default_public_key && (
                      <p className="text-xs text-green-600">✓ Search key configured</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-algolia-index">Index Name</Label>
                    <Input
                      id="edit-algolia-index"
                      value={algoliaIndex}
                      onChange={(e) => setAlgoliaIndex(e.target.value)}
                    />
                  </div>
                </>
              ) : isElevenLabs ? (
                // ElevenLabs fields
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-secret-key" className="flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      ElevenLabs API Key
                    </Label>
                    <div className="relative">
                      <Input
                        id="edit-secret-key"
                        type={showSecretKey ? "text" : "password"}
                        placeholder="Enter new key to update (leave empty to keep current)"
                        value={secretKey}
                        onChange={(e) => setSecretKey(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowSecretKey(!showSecretKey)}
                      >
                        {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {integration.has_default_secret_key && (
                      <p className="text-xs text-green-600">✓ API key configured</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Find your API key at{" "}
                      <a
                        href="https://elevenlabs.io/app/settings/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline hover:no-underline"
                      >
                        ElevenLabs Settings → API Keys
                      </a>
                    </p>
                  </div>
                </>
              ) : (
                // VAPI / Retell / Google Calendar fields
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-secret-key" className="flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      {isGoogleCalendar ? "Client Secret" : "Secret API Key"}
                    </Label>
                    <div className="relative">
                      <Input
                        id="edit-secret-key"
                        type={showSecretKey ? "text" : "password"}
                        placeholder="Enter new key to update (leave empty to keep current)"
                        value={secretKey}
                        onChange={(e) => setSecretKey(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowSecretKey(!showSecretKey)}
                      >
                        {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {integration.has_default_secret_key && (
                      <p className="text-xs text-green-600">✓ {isGoogleCalendar ? "Client secret" : "Secret key"} configured</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-public-key" className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      {isGoogleCalendar ? "Client ID" : "Public API Key"}
                    </Label>
                    <Input
                      id="edit-public-key"
                      placeholder="Enter new key to update (leave empty to keep current)"
                      value={publicKey}
                      onChange={(e) => setPublicKey(e.target.value)}
                    />
                    {integration.has_default_public_key && (
                      <p className="text-xs text-green-600">✓ {isGoogleCalendar ? "Client ID" : "Public key"} configured</p>
                    )}
                  </div>
                </>
              )}

              {/* Active Status */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-is-active">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive integrations cannot be assigned to workspaces
                  </p>
                </div>
                <Switch
                  id="edit-is-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateIntegration.isPending}>
                  {updateIntegration.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="workspaces" className="pt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : integrationDetail?.assigned_workspaces?.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No workspaces are using this integration</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {integrationDetail?.assigned_workspaces?.map((workspace) => (
                    <div
                      key={workspace.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{workspace.name}</p>
                          <p className="text-xs text-muted-foreground">{workspace.slug}</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        Assigned
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                To change workspace assignments, go to the Workspaces section in your organization dashboard.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

