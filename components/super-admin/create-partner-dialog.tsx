"use client"

import { useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Check } from "lucide-react"
import { useCreatePartner } from "@/lib/hooks/use-super-admin-partners"
import { toast } from "sonner"

interface CreatePartnerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreatePartnerDialog({ open, onOpenChange }: CreatePartnerDialogProps) {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [hostname, setHostname] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [primaryColor, setPrimaryColor] = useState("#7c3aed")
  const [planTier, setPlanTier] = useState("starter")
  const [success, setSuccess] = useState(false)

  const createMutation = useCreatePartner()

  const handleNameChange = (value: string) => {
    setName(value)
    // Auto-generate slug from name
    const generatedSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-")
    setSlug(generatedSlug)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await createMutation.mutateAsync({
        name,
        slug,
        hostname,
        branding: {
          company_name: companyName || name,
          primary_color: primaryColor,
        },
        plan_tier: planTier,
      })

      setSuccess(true)
      toast.success("Partner created successfully!")

      setTimeout(() => {
        handleClose(false)
      }, 1500)
    } catch (error: any) {
      toast.error(error.message || "Failed to create partner")
    }
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      setName("")
      setSlug("")
      setHostname("")
      setCompanyName("")
      setPrimaryColor("#7c3aed")
      setPlanTier("starter")
      setSuccess(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>{success ? "Partner Created!" : "Create Partner"}</DialogTitle>
          <DialogDescription className="text-slate-400">
            {success
              ? "The partner has been created and is ready to use."
              : "Create a new white-label partner with their own branding."}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-slate-300">Partner "{name}" has been created.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">
                Partner Name
              </Label>
              <Input
                id="name"
                placeholder="Acme Agency"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                disabled={createMutation.isPending}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug" className="text-slate-300">
                Slug
              </Label>
              <Input
                id="slug"
                placeholder="acme-agency"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                disabled={createMutation.isPending}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
              <p className="text-xs text-slate-500">Used in URLs and for identification</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hostname" className="text-slate-300">
                Primary Hostname
              </Label>
              <Input
                id="hostname"
                placeholder="app.acme.com"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                required
                disabled={createMutation.isPending}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
              <p className="text-xs text-slate-500">The domain users will access</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="companyName" className="text-slate-300">
                  Display Name
                </Label>
                <Input
                  id="companyName"
                  placeholder="Acme Corp"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={createMutation.isPending}
                  className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="primaryColor" className="text-slate-300">
                  Brand Color
                </Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="primaryColor"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-10 w-14 rounded border border-slate-600 cursor-pointer"
                    disabled={createMutation.isPending}
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1 bg-slate-900 border-slate-600 text-white"
                    disabled={createMutation.isPending}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Plan Tier</Label>
              <Select
                value={planTier}
                onValueChange={setPlanTier}
                disabled={createMutation.isPending}
              >
                <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-slate-600 hover:bg-slate-700"
                onClick={() => handleClose(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-violet-500 hover:bg-violet-600"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Partner"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
