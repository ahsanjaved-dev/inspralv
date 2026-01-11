"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, MoreHorizontal, Trash2, Users, Mail, Copy, CheckCircle2, Clock, ExternalLink, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { useSubscriptionPlans } from "@/lib/hooks/use-subscription-plans"

interface ClientInvitation {
  id: string
  email: string
  role: string
  message: string | null
  status: string
  token: string
  expires_at: string
  created_at: string
  metadata: {
    invitation_type: string
    plan_id: string
    plan_name: string
    workspace_name?: string
  }
  inviter: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
  } | null
  plan: {
    name: string
    includedMinutes: number
    maxAgents: number | null
  } | null
  workspace_name: string | null
}

function useClientInvitations() {
  return useQuery<ClientInvitation[]>({
    queryKey: ["client-invitations"],
    queryFn: async () => {
      const res = await fetch("/api/partner/client-invitations")
      if (!res.ok) throw new Error("Failed to fetch client invitations")
      const json = await res.json()
      return json.data || []
    },
  })
}

function useInviteClient() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: {
      email: string
      plan_id: string
      workspace_name?: string
      message?: string
    }) => {
      const res = await fetch("/api/partner/client-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to invite client")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-invitations"] })
    },
  })
}

function useCancelInvitation() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await fetch(`/api/partner/client-invitations/${invitationId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to cancel invitation")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-invitations"] })
    },
  })
}

export default function ClientsPage() {
  const { data: invitations, isLoading: isLoadingInvitations } = useClientInvitations()
  const { data: plansData, isLoading: isLoadingPlans } = useSubscriptionPlans()
  const cancelInvitation = useCancelInvitation()
  
  const [isInviteOpen, setIsInviteOpen] = useState(false)

  const plans = plansData?.plans?.filter((p) => p.isActive) || []
  const pendingInvitations = invitations || []

  const handleCancel = async (invitationId: string) => {
    if (!confirm("Are you sure you want to cancel this invitation?")) return
    
    try {
      await cancelInvitation.mutateAsync(invitationId)
      toast.success("Invitation canceled")
    } catch (err) {
      toast.error("Failed to cancel invitation", { description: (err as Error).message })
    }
  }

  const copyInviteLink = (token: string) => {
    const inviteLink = `${window.location.origin}/signup?token=${token}`
    navigator.clipboard.writeText(inviteLink)
    toast.success("Invite link copied to clipboard")
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Client Invitations</h2>
          <p className="text-muted-foreground">
            Invite clients to your platform. They'll get their own workspace with the selected plan.
          </p>
        </div>
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Client
            </Button>
          </DialogTrigger>
          <InviteClientDialog 
            plans={plans}
            onSuccess={() => setIsInviteOpen(false)}
          />
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Mail className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingInvitations.length}</p>
                <p className="text-sm text-muted-foreground">Pending Invitations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{plans.length}</p>
                <p className="text-sm text-muted-foreground">Active Plans</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Users className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">—</p>
                <p className="text-sm text-muted-foreground">Total Clients</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Invitations */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Invitations</CardTitle>
          <CardDescription>
            Clients who have been invited but haven't accepted yet
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingInvitations ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : pendingInvitations.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No pending invitations</h3>
              <p className="text-muted-foreground mb-4">
                Invite your first client to get started
              </p>
              <Button onClick={() => setIsInviteOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite Client
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Invited By</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>
                      <div className="font-medium">{invitation.email}</div>
                      {invitation.workspace_name && (
                        <div className="text-sm text-muted-foreground">
                          Workspace: {invitation.workspace_name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {invitation.plan?.name || invitation.metadata?.plan_name || "Unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {invitation.inviter?.first_name 
                        ? `${invitation.inviter.first_name} ${invitation.inviter.last_name || ""}`.trim()
                        : invitation.inviter?.email || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className={isExpired(invitation.expires_at) ? "text-destructive" : ""}>
                          {formatDate(invitation.expires_at)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isExpired(invitation.expires_at) ? (
                        <Badge variant="destructive">Expired</Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => copyInviteLink(invitation.token)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Invite Link
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleCancel(invitation.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Cancel Invitation
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ExternalLink className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">How client invitations work</h3>
              <p className="text-sm text-muted-foreground">
                When you invite a client, they receive an email with a signup link. 
                Upon signing up, they automatically get their own workspace with the limits 
                defined by the plan you selected. They become the owner of their workspace 
                and can manage their own team and agents.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Invite Client Dialog
function InviteClientDialog({ 
  plans,
  onSuccess 
}: { 
  plans: Array<{ id: string; name: string; includedMinutes: number; maxAgents: number | null }>
  onSuccess: () => void
}) {
  const inviteClient = useInviteClient()
  
  const [form, setForm] = useState({
    email: "",
    plan_id: "",
    workspace_name: "",
    message: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!form.email || !form.plan_id) {
      toast.error("Email and plan are required")
      return
    }

    try {
      await inviteClient.mutateAsync({
        email: form.email,
        plan_id: form.plan_id,
        workspace_name: form.workspace_name || undefined,
        message: form.message || undefined,
      })
      toast.success("Invitation sent", { 
        description: `Invitation email sent to ${form.email}` 
      })
      setForm({ email: "", plan_id: "", workspace_name: "", message: "" })
      onSuccess()
    } catch (err) {
      toast.error("Failed to send invitation", { description: (err as Error).message })
    }
  }

  const selectedPlan = plans.find(p => p.id === form.plan_id)

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Invite New Client</DialogTitle>
        <DialogDescription>
          Send an invitation to a new client. They'll get their own workspace with the selected plan.
        </DialogDescription>
      </DialogHeader>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Client Email *</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="client@example.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="plan">Plan *</Label>
          <Select
            value={form.plan_id}
            onValueChange={(value) => setForm({ ...form, plan_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a plan" />
            </SelectTrigger>
            <SelectContent>
              {plans.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No plans available. Create a plan first.
                </div>
              ) : (
                plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    <div className="flex items-center gap-2">
                      <span>{plan.name}</span>
                      <span className="text-muted-foreground">
                        ({plan.includedMinutes} min, {plan.maxAgents || "∞"} agents)
                      </span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {selectedPlan && (
            <p className="text-xs text-muted-foreground">
              Client will get {selectedPlan.includedMinutes} minutes and {selectedPlan.maxAgents || "unlimited"} agents
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="workspace_name">Workspace Name (Optional)</Label>
          <Input
            id="workspace_name"
            value={form.workspace_name}
            onChange={(e) => setForm({ ...form, workspace_name: e.target.value })}
            placeholder="e.g. Acme Corp"
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to auto-generate from client's name
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="message">Personal Message (Optional)</Label>
          <Textarea
            id="message"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Add a personal message to the invitation email..."
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={inviteClient.isPending}>
            {inviteClient.isPending ? "Sending..." : "Send Invitation"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

