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
import { Loader2, Key, Globe, Eye, EyeOff, Copy, Check, BookOpen, ExternalLink, CheckCircle2 } from "lucide-react"
import { useCreatePartnerIntegration } from "@/lib/hooks/use-partner-integrations"
import { toast } from "sonner"
import { ScrollArea } from "@/components/ui/scroll-area"

interface AddIntegrationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: "vapi" | "retell" | "algolia" | "google_calendar" | null
}

const PROVIDER_LABELS = {
  vapi: "Vapi",
  retell: "Retell AI",
  algolia: "Algolia",
  google_calendar: "Google Calendar",
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

  // Google Calendar-specific fields (OAuth)
  const [googleClientId, setGoogleClientId] = useState("")
  const [googleClientSecret, setGoogleClientSecret] = useState("")
  const [showGuide, setShowGuide] = useState(false)
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({})

  const isAlgolia = provider === "algolia"
  const isGoogleCalendar = provider === "google_calendar"
  const providerLabel = provider ? PROVIDER_LABELS[provider] : ""

  // Get the redirect URI for Google Calendar OAuth
  const redirectUri = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/auth/google-calendar/callback`
    : ''

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedItems(prev => ({ ...prev, [key]: true }))
    setTimeout(() => setCopiedItems(prev => ({ ...prev, [key]: false })), 2000)
  }

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
    setGoogleClientId("")
    setGoogleClientSecret("")
    setShowGuide(false)
    setCopiedItems({})
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
    } else if (isGoogleCalendar) {
      if (!googleClientId.trim()) {
        toast.error("Please enter the Google Client ID")
        return
      }
      if (!googleClientSecret.trim()) {
        toast.error("Please enter the Google Client Secret")
        return
      }
    } else {
      if (!secretKey.trim()) {
        toast.error("Please enter the secret API key")
        return
      }
    }

    try {
      let payload: any = {
        provider,
        name: name.trim(),
        is_default: isDefault,
      }

      if (isAlgolia) {
        payload.default_secret_key = algoliaAdminKey
        payload.default_public_key = algoliaSearchKey || undefined
        payload.config = {
          app_id: algoliaAppId,
          admin_api_key: algoliaAdminKey,
          search_api_key: algoliaSearchKey,
          call_logs_index: algoliaIndex,
        }
      } else if (isGoogleCalendar) {
        // Google Calendar uses OAuth credentials
        payload.default_secret_key = googleClientSecret
        payload.default_public_key = googleClientId
        payload.config = {
          client_id: googleClientId,
          client_secret: googleClientSecret,
        }
      } else {
        // VAPI / Retell
        payload.default_secret_key = secretKey
        payload.default_public_key = publicKey || undefined
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
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Add {providerLabel} Integration</DialogTitle>
            <DialogDescription>
              {isGoogleCalendar 
                ? "Enter your Google OAuth credentials to enable calendar features for your agents."
                : `Enter your ${providerLabel} API keys to enable this provider for your workspaces.`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto flex-1">
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
            ) : isGoogleCalendar ? (
              // Google Calendar OAuth credentials - Clean form with guide button
              <>
                {/* Setup Guide Button */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2 h-auto py-3"
                  onClick={() => setShowGuide(true)}
                >
                  <BookOpen className="h-4 w-4 text-blue-500" />
                  <div className="text-left">
                    <div className="font-medium">Setup Guide</div>
                    <div className="text-xs text-muted-foreground">Step-by-step instructions to get Google Calendar credentials</div>
                  </div>
                </Button>

                {/* Important Email Warning */}
                <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="shrink-0 mt-0.5">
                      <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        Important: Calendar Event Notifications
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        The Google account used for OAuth authentication will <strong>not receive calendar event notifications</strong> created by agents. 
                        This is the account that owns the calendar.
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        To receive email notifications for appointments, configure a <strong>different email address</strong> in your agent's calendar settings as the attendee/notification recipient.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="google-client-id" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Client ID
                  </Label>
                  <Input
                    id="google-client-id"
                    placeholder="xxxx.apps.googleusercontent.com"
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="google-client-secret" className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Client Secret
                  </Label>
                  <div className="relative">
                    <Input
                      id="google-client-secret"
                      type={showSecretKey ? "text" : "password"}
                      placeholder="GOCSPX-xxxxxxxxxxxxxxxx"
                      value={googleClientSecret}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
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

          <DialogFooter className="shrink-0 pt-4">
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

      {/* Google Calendar Setup Guide Dialog */}
      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-500" />
              Google Calendar Integration Guide
            </DialogTitle>
            <DialogDescription>
              Follow these steps to set up Google Calendar integration
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] px-6">
            <div className="space-y-6 py-4">
              {/* Requirements Section */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-bold">!</span>
                  Requirements
                </h3>
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span>A Google account with access to Google Cloud Console</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span>A Google Cloud project (new or existing)</span>
                  </div>
                </div>
              </div>

              {/* Step 1: Create Project */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                  Create or Select a Google Cloud Project
                </h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Go to Google Cloud Console and create a new project or select an existing one.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => window.open('https://console.cloud.google.com/projectcreate', '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open Google Cloud Console
                  </Button>
                </div>
              </div>

              {/* Step 2: Enable API */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                  Enable Google Calendar API
                </h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Search for "Google Calendar API" in the API Library and enable it.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => window.open('https://console.cloud.google.com/apis/library/calendar-json.googleapis.com', '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Enable Google Calendar API
                  </Button>
                </div>
              </div>

              {/* Step 3: Configure OAuth Consent Screen */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                  Configure OAuth Consent Screen
                </h3>
                <div className="text-sm text-muted-foreground space-y-3">
                  <p>Set up the consent screen that users will see when connecting their Google account.</p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs">
                    <div><strong>User Type:</strong> External (or Internal for Google Workspace)</div>
                    <div><strong>App Name:</strong> Your application name</div>
                    <div><strong>Support Email:</strong> Your support email</div>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">Required OAuth Scopes:</p>
                    {[
                      'https://www.googleapis.com/auth/calendar.events',
                      'https://www.googleapis.com/auth/calendar.readonly',
                      'https://www.googleapis.com/auth/userinfo.email'
                    ].map((scope) => (
                      <div key={scope} className="flex items-center gap-2">
                        <code className="flex-1 px-2 py-1 text-xs bg-background rounded border font-mono truncate">
                          {scope}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0"
                          onClick={() => copyToClipboard(scope, scope)}
                        >
                          {copiedItems[scope] ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => window.open('https://console.cloud.google.com/apis/credentials/consent', '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Configure Consent Screen
                  </Button>
                </div>
              </div>

              {/* Step 4: Create OAuth Credentials */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
                  Create OAuth 2.0 Credentials
                </h3>
                <div className="text-sm text-muted-foreground space-y-3">
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Go to Credentials page</li>
                    <li>Click "Create Credentials" → "OAuth client ID"</li>
                    <li>Select "Web application" as application type</li>
                    <li>Add a name (e.g., "Genius365 Calendar")</li>
                  </ol>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => window.open('https://console.cloud.google.com/apis/credentials', '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Go to Credentials
                  </Button>
                </div>
              </div>

              {/* Step 5: Add Redirect URI */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">5</span>
                  Add Authorized Redirect URI
                </h3>
                <div className="text-sm text-muted-foreground space-y-3">
                  <p>In your OAuth client settings, add this redirect URI:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 text-xs bg-background rounded border font-mono break-all">
                      {redirectUri}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => copyToClipboard(redirectUri, 'redirectUri')}
                    >
                      {copiedItems['redirectUri'] ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-orange-600 dark:text-orange-400">
                    ⚠️ This must be added to "Authorized redirect URIs", NOT "Authorized JavaScript origins"
                  </p>
                </div>
              </div>

              {/* Step 6: Copy Credentials */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">6</span>
                  Copy Your Credentials
                </h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>After creating the OAuth client, you'll see:</p>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs">
                    <div><strong>Client ID:</strong> <code>xxxxxxxxxxxx.apps.googleusercontent.com</code></div>
                    <div><strong>Client Secret:</strong> <code>GOCSPX-xxxxxxxxxxxxxxxxxx</code></div>
                  </div>
                  <p>Copy these values and paste them in the form above.</p>
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="p-6 pt-4 border-t">
            <Button 
              type="button" 
              className="w-full"
              onClick={() => setShowGuide(false)}
            >
              Got it, back to form
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

