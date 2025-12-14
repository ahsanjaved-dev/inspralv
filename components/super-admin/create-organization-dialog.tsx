"use client"

import { useState } from "react"
import { useQueryClient, useMutation } from "@tanstack/react-query"
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
import { Loader2, Copy, Check, ExternalLink } from "lucide-react"
import { api } from "@/lib/api/fetcher"
import { toast } from "sonner"
import type { Organization, PlanTier } from "@/types/database.types"

interface CreateOrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CreateOrgResponse {
  organization: Organization
  invitation: {
    token: string
    expires_at: string
  }
  invitation_link: string
}

export function CreateOrganizationDialog({ open, onOpenChange }: CreateOrganizationDialogProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [planTier, setPlanTier] = useState<PlanTier>("starter")
  const [trialDays, setTrialDays] = useState("14")
  const [message, setMessage] = useState("")

  const [result, setResult] = useState<CreateOrgResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string
      email: string
      plan_tier: PlanTier
      trial_days: number
      message?: string
    }) => api.post<CreateOrgResponse>("/api/super-admin/organizations", data),
    onSuccess: (data) => {
      setResult(data)
      queryClient.invalidateQueries({ queryKey: ["super-admin-organizations"] })
      toast.success("Organization created successfully!")
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create organization")
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      name,
      email,
      plan_tier: planTier,
      trial_days: parseInt(trialDays),
      message: message || undefined,
    })
  }

  const copyLink = async () => {
    if (result?.invitation_link) {
      await navigator.clipboard.writeText(result.invitation_link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      // Reset form
      setName("")
      setEmail("")
      setPlanTier("starter")
      setTrialDays("14")
      setMessage("")
      setResult(null)
      setCopied(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>{result ? "Organization Created!" : "Create Organization"}</DialogTitle>
          <DialogDescription className="text-slate-400">
            {result
              ? "Send the invitation link to the organization owner."
              : "Create a new organization and send an invitation to the owner."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-4">
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-sm text-green-400 font-medium">
                ✓ Organization "{result.organization.name}" has been created
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Invitation Link</Label>
              <div className="flex gap-2">
                <Input
                  value={result.invitation_link}
                  readOnly
                  className="bg-slate-900 border-slate-600 text-slate-300 text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyLink}
                  className="border-slate-600 hover:bg-slate-700"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-slate-500">This link expires in 7 days</p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1 border-slate-600 hover:bg-slate-700"
                onClick={() => handleClose(false)}
              >
                Close
              </Button>
              <Button
                className="flex-1 bg-violet-500 hover:bg-violet-600"
                onClick={() => {
                  handleClose(false)
                  // Could open email client here
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">
                Organization Name
              </Label>
              <Input
                id="name"
                placeholder="Acme Corporation"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={createMutation.isPending}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">
                Owner Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="owner@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={createMutation.isPending}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
              <p className="text-xs text-slate-500">An invitation will be created for this email</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Plan</Label>
                <Select
                  value={planTier}
                  onValueChange={(v) => setPlanTier(v as PlanTier)}
                  disabled={createMutation.isPending}
                >
                  <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="trialDays" className="text-slate-300">
                  Trial Days
                </Label>
                <Input
                  id="trialDays"
                  type="number"
                  min="0"
                  max="90"
                  value={trialDays}
                  onChange={(e) => setTrialDays(e.target.value)}
                  disabled={createMutation.isPending}
                  className="bg-slate-900 border-slate-600 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message" className="text-slate-300">
                Personal Message (Optional)
              </Label>
              <textarea
                id="message"
                placeholder="Welcome to Inspralv! We're excited to have you..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={createMutation.isPending}
                className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 resize-none"
              />
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
                  "Create Organization"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
