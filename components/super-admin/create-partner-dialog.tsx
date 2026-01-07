"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Loader2,
  Check,
  Building2,
  Globe,
  Mail,
  Palette,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react"
import { useCreatePartner } from "@/lib/hooks/use-super-admin-partners"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "genius365.app"

interface CreatePartnerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Enterprise defaults for white-label partners
const enterpriseDefaults = {
  features: {
    white_label: true,
    custom_domain: true,
    api_access: true,
    sso: true,
    advanced_analytics: true,
  },
  limits: {
    max_workspaces: -1, // Unlimited
    max_users_per_workspace: -1,
    max_agents_per_workspace: -1,
  },
}

export function CreatePartnerDialog({ open, onOpenChange }: CreatePartnerDialogProps) {
  const [success, setSuccess] = useState(false)
  const [showBranding, setShowBranding] = useState(false)

  // Basic Info
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [subdomain, setSubdomain] = useState("")

  // Admin Contact
  const [adminEmail, setAdminEmail] = useState("")
  const [adminFirstName, setAdminFirstName] = useState("")
  const [adminLastName, setAdminLastName] = useState("")

  // Options
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true)
  const [createFirstWorkspace, setCreateFirstWorkspace] = useState(true)
  const [firstWorkspaceName, setFirstWorkspaceName] = useState("")

  // Branding (collapsible)
  const [companyName, setCompanyName] = useState("")
  const [primaryColor, setPrimaryColor] = useState("#7c3aed")
  const [logoUrl, setLogoUrl] = useState("")

  const createMutation = useCreatePartner()

  // Auto-generate slug and subdomain from name
  const handleNameChange = (value: string) => {
    setName(value)
    const generatedSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-")
    setSlug(generatedSlug)
    setSubdomain(generatedSlug)

    // Auto-set first workspace name
    if (!firstWorkspaceName || firstWorkspaceName === `${name} Workspace`) {
      setFirstWorkspaceName(`${value} Workspace`)
    }
  }

  // Update first workspace name when agency name changes
  useEffect(() => {
    if (createFirstWorkspace && name && !firstWorkspaceName) {
      setFirstWorkspaceName(`${name} Workspace`)
    }
  }, [name, createFirstWorkspace, firstWorkspaceName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!name.trim()) {
      toast.error("Agency name is required")
      return
    }
    if (!subdomain.trim()) {
      toast.error("Subdomain is required")
      return
    }
    if (!adminEmail.trim()) {
      toast.error("Admin email is required to create the first owner")
      return
    }
    if (createFirstWorkspace && !firstWorkspaceName.trim()) {
      toast.error("Workspace name is required")
      return
    }

    try {
      const hostname = `${subdomain}.${PLATFORM_DOMAIN}`

      await createMutation.mutateAsync({
        name,
        slug,
        hostname,
        branding: {
          company_name: companyName || name,
          primary_color: primaryColor,
          logo_url: logoUrl || undefined,
        },
        plan_tier: "enterprise", // Always enterprise for white-label partners
        features: enterpriseDefaults.features,
        resource_limits: enterpriseDefaults.limits,
        // New fields for admin creation
        admin_email: adminEmail,
        admin_first_name: adminFirstName || undefined,
        admin_last_name: adminLastName || undefined,
        send_welcome_email: sendWelcomeEmail,
        create_first_workspace: createFirstWorkspace,
        first_workspace_name: createFirstWorkspace ? firstWorkspaceName : undefined,
      })

      setSuccess(true)
      toast.success("Agency created successfully!")

      setTimeout(() => {
        handleClose(false)
      }, 2000)
    } catch (error: any) {
      toast.error(error.message || "Failed to create agency")
    }
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      // Reset all state
      setName("")
      setSlug("")
      setSubdomain("")
      setAdminEmail("")
      setAdminFirstName("")
      setAdminLastName("")
      setSendWelcomeEmail(true)
      setCreateFirstWorkspace(true)
      setFirstWorkspaceName("")
      setCompanyName("")
      setPrimaryColor("#7c3aed")
      setLogoUrl("")
      setShowBranding(false)
      setSuccess(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {success ? (
              <>
                <Check className="h-5 w-5 text-green-500" />
                Agency Created!
              </>
            ) : (
              <>
                <Building2 className="h-5 w-5 text-primary" />
                Create New Agency
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {success
              ? "The agency has been created and is ready to use."
              : "Set up a new white-label agency with Enterprise features."}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center flex-1 flex flex-col justify-center">
            <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-green-500" />
            </div>
            <p className="text-foreground font-medium">Agency "{name}" created!</p>
            <p className="text-muted-foreground text-sm mt-1">
              Access URL: <code className="bg-muted px-2 py-0.5 rounded">{subdomain}.{PLATFORM_DOMAIN}</code>
            </p>
            {sendWelcomeEmail && adminEmail && (
              <p className="text-muted-foreground text-sm mt-2">
                <Mail className="inline h-3.5 w-3.5 mr-1" />
                Welcome email sent to {adminEmail}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 -mr-1">
              {/* Agency Info */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Agency Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="Acme Agency"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                    disabled={createMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subdomain">
                    Subdomain <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="subdomain"
                      placeholder="acme"
                      value={subdomain}
                      onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      required
                      className="flex-1"
                      disabled={createMutation.isPending}
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">.{PLATFORM_DOMAIN}</span>
                  </div>
                </div>

                {subdomain && (
                  <div className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg border text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <code className="font-medium text-foreground truncate">
                      https://{subdomain}.{PLATFORM_DOMAIN}
                    </code>
                  </div>
                )}
              </div>

              <Separator />

              {/* Admin Contact */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Agency Admin</Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminEmail">
                    Email Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    placeholder="admin@agency.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                    disabled={createMutation.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    This person will be the owner of the agency
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="adminFirstName">First Name</Label>
                    <Input
                      id="adminFirstName"
                      placeholder="John"
                      value={adminFirstName}
                      onChange={(e) => setAdminFirstName(e.target.value)}
                      disabled={createMutation.isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminLastName">Last Name</Label>
                    <Input
                      id="adminLastName"
                      placeholder="Doe"
                      value={adminLastName}
                      onChange={(e) => setAdminLastName(e.target.value)}
                      disabled={createMutation.isPending}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Options */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-sm">Send Welcome Email</p>
                    <p className="text-xs text-muted-foreground">
                      Send login credentials to the admin
                    </p>
                  </div>
                  <Switch
                    checked={sendWelcomeEmail}
                    onCheckedChange={setSendWelcomeEmail}
                    disabled={createMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">Create First Workspace</p>
                      <p className="text-xs text-muted-foreground">
                        Set up a default workspace for the agency
                      </p>
                    </div>
                    <Switch
                      checked={createFirstWorkspace}
                      onCheckedChange={setCreateFirstWorkspace}
                      disabled={createMutation.isPending}
                    />
                  </div>

                  {createFirstWorkspace && (
                    <Input
                      placeholder="Workspace name"
                      value={firstWorkspaceName}
                      onChange={(e) => setFirstWorkspaceName(e.target.value)}
                      disabled={createMutation.isPending}
                      className="mt-2"
                    />
                  )}
                </div>
              </div>

              {/* Branding (Collapsible) */}
              <div className="border rounded-lg">
                <button
                  type="button"
                  onClick={() => setShowBranding(!showBranding)}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Branding</span>
                    <Badge variant="outline" className="text-xs">Optional</Badge>
                  </div>
                  {showBranding ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                <div
                  className={cn(
                    "overflow-hidden transition-all duration-200",
                    showBranding ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  <div className="p-3 pt-0 space-y-3 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Display Name</Label>
                      <Input
                        id="companyName"
                        placeholder={name || "Agency display name"}
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        disabled={createMutation.isPending}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">Brand Color</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          id="primaryColor"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="h-9 w-12 rounded border border-input cursor-pointer"
                          disabled={createMutation.isPending}
                        />
                        <Input
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="flex-1"
                          disabled={createMutation.isPending}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="logoUrl">Logo URL</Label>
                      <Input
                        id="logoUrl"
                        placeholder="https://example.com/logo.png"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        disabled={createMutation.isPending}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Enterprise Badge */}
              <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-purple-500/10 to-violet-500/10 border border-purple-500/20 rounded-lg">
                <Sparkles className="h-4 w-4 text-purple-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Enterprise Features</p>
                  <p className="text-xs text-muted-foreground">
                    White-label, custom domain, SSO, API access, unlimited resources
                  </p>
                </div>
                <Badge className="bg-purple-500/20 text-purple-600 border-purple-500/30">
                  Enterprise
                </Badge>
              </div>
            </div>

            <Separator className="my-4 flex-shrink-0" />

            <div className="flex gap-2 flex-shrink-0">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => handleClose(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-primary hover:bg-primary/90"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Agency"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
