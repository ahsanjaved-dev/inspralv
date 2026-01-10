"use client"

import { useState } from "react"
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
import { Loader2, Key, Globe, Eye, EyeOff } from "lucide-react"
import { useCreatePartnerIntegration } from "@/lib/hooks/use-partner-integrations"
import { toast } from "sonner"

interface AddIntegrationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: "vapi" | "retell" | "algolia" | null
}

const PROVIDER_LABELS = {
  vapi: "Vapi",
  retell: "Retell AI",
  algolia: "Algolia",
}

export function AddIntegrationDialog({ open, onOpenChange, provider }: AddIntegrationDialogProps) {
  const createIntegration = useCreatePartnerIntegration()

  // Form state
  const [name, setName] = useState("")
  const [secretKey, setSecretKey] = useState("")
  const [publicKey, setPublicKey] = useState("")
  const [isDefault, setIsDefault] = useState(true)
  const [showSecretKey, setShowSecretKey] = useState(false)
  
  // Algolia-specific fields
  const [algoliaAppId, setAlgoliaAppId] = useState("")
  const [algoliaAdminKey, setAlgoliaAdminKey] = useState("")
  const [algoliaSearchKey, setAlgoliaSearchKey] = useState("")
  const [algoliaIndex, setAlgoliaIndex] = useState("call_logs")

  const isAlgolia = provider === "algolia"
  const providerLabel = provider ? PROVIDER_LABELS[provider] : ""

  const resetForm = () => {
    setName("")
    setSecretKey("")
    setPublicKey("")
    setIsDefault(true)
    setShowSecretKey(false)
    setAlgoliaAppId("")
    setAlgoliaAdminKey("")
    setAlgoliaSearchKey("")
    setAlgoliaIndex("call_logs")
  }

  const handleClose = () => {
    resetForm()
    onOpenChange(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!provider) return

    // Validation
    if (!name.trim()) {
      toast.error("Please enter a name for this integration")
      return
    }

    if (isAlgolia) {
      if (!algoliaAppId.trim()) {
        toast.error("Please enter the Algolia App ID")
        return
      }
      if (!algoliaAdminKey.trim()) {
        toast.error("Please enter the Algolia Admin API Key")
        return
      }
    } else {
      if (!secretKey.trim()) {
        toast.error("Please enter the secret API key")
        return
      }
    }

    try {
      const payload: any = {
        provider,
        name: name.trim(),
        default_secret_key: isAlgolia ? algoliaAdminKey : secretKey,
        default_public_key: isAlgolia ? algoliaSearchKey : publicKey || undefined,
        is_default: isDefault,
      }

      // Add Algolia-specific config
      if (isAlgolia) {
        payload.config = {
          app_id: algoliaAppId,
          admin_api_key: algoliaAdminKey,
          search_api_key: algoliaSearchKey,
          call_logs_index: algoliaIndex,
        }
      }

      await createIntegration.mutateAsync(payload)
      toast.success(`${providerLabel} integration added successfully`)
      handleClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add integration")
    }
  }

  if (!provider) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add {providerLabel} Integration</DialogTitle>
            <DialogDescription>
              Enter your {providerLabel} API keys to enable this provider for your workspaces.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Integration Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Integration Name</Label>
              <Input
                id="name"
                placeholder={`e.g., Production ${providerLabel}, Client A ${providerLabel}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A descriptive name to identify this set of API keys
              </p>
            </div>

            {isAlgolia ? (
              // Algolia-specific fields
              <>
                <div className="space-y-2">
                  <Label htmlFor="algolia-app-id">Application ID</Label>
                  <Input
                    id="algolia-app-id"
                    placeholder="Your Algolia Application ID"
                    value={algoliaAppId}
                    onChange={(e) => setAlgoliaAppId(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="algolia-admin-key" className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Admin API Key
                  </Label>
                  <div className="relative">
                    <Input
                      id="algolia-admin-key"
                      type={showSecretKey ? "text" : "password"}
                      placeholder="Your Algolia Admin API Key"
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
                      {showSecretKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="algolia-search-key" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Search API Key (Optional)
                  </Label>
                  <Input
                    id="algolia-search-key"
                    placeholder="Your Algolia Search-Only API Key"
                    value={algoliaSearchKey}
                    onChange={(e) => setAlgoliaSearchKey(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="algolia-index">Index Name</Label>
                  <Input
                    id="algolia-index"
                    placeholder="call_logs"
                    value={algoliaIndex}
                    onChange={(e) => setAlgoliaIndex(e.target.value)}
                  />
                </div>
              </>
            ) : (
              // VAPI / Retell fields
              <>
                <div className="space-y-2">
                  <Label htmlFor="secret-key" className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Secret API Key
                  </Label>
                  <div className="relative">
                    <Input
                      id="secret-key"
                      type={showSecretKey ? "text" : "password"}
                      placeholder={`Your ${providerLabel} secret/private API key`}
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
                      {showSecretKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used for server-side operations like agent sync
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="public-key" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Public API Key (Optional)
                  </Label>
                  <Input
                    id="public-key"
                    placeholder={`Your ${providerLabel} public API key`}
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used for client-side operations like test calls
                  </p>
                </div>
              </>
            )}

            {/* Set as Default */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="is-default">Set as Default</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically assign this key to all new workspaces
                </p>
              </div>
              <Switch
                id="is-default"
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createIntegration.isPending}>
              {createIntegration.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Integration"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

