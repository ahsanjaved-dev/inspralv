"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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
import { Plus, MoreHorizontal, Pencil, Trash2, Users, Clock, DollarSign, Check } from "lucide-react"
import { useSubscriptionPlans, useCreateSubscriptionPlan, useUpdateSubscriptionPlan, useDeleteSubscriptionPlan, type CreatePlanInput } from "@/lib/hooks/use-subscription-plans"
import { toast } from "sonner"

export default function PlansPage() {
  const { data, isLoading, error } = useSubscriptionPlans()
  const createPlan = useCreateSubscriptionPlan()
  const deletePlan = useDeleteSubscriptionPlan()
  
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<string | null>(null)

  const plans = data?.plans || []

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Subscription Plans</h2>
            <p className="text-muted-foreground">Manage plans for your workspaces</p>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading plans...
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-destructive">
          <CardContent className="py-12 text-center text-destructive">
            Failed to load plans: {(error as Error).message}
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleDelete = async (planId: string, planName: string) => {
    if (!confirm(`Are you sure you want to delete "${planName}"?`)) return
    
    try {
      const result = await deletePlan.mutateAsync(planId)
      if (result.deactivated) {
        toast.info("Plan deactivated", { description: result.message })
      } else {
        toast.success("Plan deleted")
      }
    } catch (err) {
      toast.error("Failed to delete plan", { description: (err as Error).message })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Subscription Plans</h2>
          <p className="text-muted-foreground">
            Create and manage subscription plans that workspaces can subscribe to
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Plan
            </Button>
          </DialogTrigger>
          <CreatePlanDialog 
            onSuccess={() => setIsCreateOpen(false)}
            createPlan={createPlan}
          />
        </Dialog>
      </div>

      {/* Plans Table */}
      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No subscription plans yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first plan for workspaces to subscribe to
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your Plans</CardTitle>
            <CardDescription>
              {plans.length} plan{plans.length !== 1 && "s"} • {plans.filter(p => p.isActive).length} active
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Minutes</TableHead>
                  <TableHead>Max Agents</TableHead>
                  <TableHead>Subscribers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{plan.name}</p>
                        {plan.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{plan.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {plan.billingType === "postpaid" ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                          Postpaid
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30">
                          Prepaid
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {plan.monthlyPriceCents === 0 ? (
                        <span className="text-green-600 font-medium">Free</span>
                      ) : (
                        <span className="font-medium">${(plan.monthlyPriceCents / 100).toFixed(2)}/mo</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {plan.billingType === "postpaid" 
                          ? `${plan.postpaidMinutesLimit || 0} limit`
                          : plan.includedMinutes > 0 ? `${plan.includedMinutes} incl` : "None"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {plan.maxAgents ? plan.maxAgents : "∞"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {plan.subscriberCount}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {plan.isActive ? (
                          <Badge variant="default" className="bg-green-600">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                        {plan.isPublic && <Badge variant="outline">Public</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingPlan(plan.id)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDelete(plan.id, plan.name)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      {editingPlan && (
        <EditPlanDialog
          planId={editingPlan}
          onClose={() => setEditingPlan(null)}
        />
      )}
    </div>
  )
}

// Package icon placeholder
function Package({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  )
}

// Create Plan Dialog
function CreatePlanDialog({ 
  onSuccess, 
  createPlan 
}: { 
  onSuccess: () => void
  createPlan: ReturnType<typeof useCreateSubscriptionPlan>
}) {
  const [form, setForm] = useState<CreatePlanInput>({
    name: "",
    description: "",
    monthlyPriceCents: 0,
    includedMinutes: 0,
    overageRateCents: 20,
    features: [],
    billingType: "prepaid",
    postpaidMinutesLimit: null,
    maxAgents: null,
    maxConversationsPerMonth: null,
    isPublic: true,
  })
  const [featureInput, setFeatureInput] = useState("")

  const isPostpaid = form.billingType === "postpaid"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      await createPlan.mutateAsync(form)
      toast.success("Plan created successfully")
      onSuccess()
    } catch (err) {
      toast.error("Failed to create plan", { description: (err as Error).message })
    }
  }

  const addFeature = () => {
    if (featureInput.trim()) {
      setForm({ ...form, features: [...(form.features || []), featureInput.trim()] })
      setFeatureInput("")
    }
  }

  const removeFeature = (index: number) => {
    const features = [...(form.features || [])]
    features.splice(index, 1)
    setForm({ ...form, features })
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Create Subscription Plan</DialogTitle>
        <DialogDescription>
          Create a new subscription plan for your workspaces
        </DialogDescription>
      </DialogHeader>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Plan Name</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Pro, Business, Enterprise"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={form.description || ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Brief description of this plan"
            rows={2}
          />
        </div>

        {/* Billing Type Selection */}
        <div className="space-y-3">
          <Label>Billing Type</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setForm({ ...form, billingType: "prepaid", postpaidMinutesLimit: null })}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                !isPostpaid 
                  ? "border-primary bg-primary/5" 
                  : "border-muted hover:border-muted-foreground/50"
              }`}
            >
              <div className="font-medium">Prepaid</div>
              <p className="text-xs text-muted-foreground mt-1">
                Workspaces pay upfront with credits
              </p>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, billingType: "postpaid", postpaidMinutesLimit: 1000 })}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                isPostpaid 
                  ? "border-primary bg-primary/5" 
                  : "border-muted hover:border-muted-foreground/50"
              }`}
            >
              <div className="font-medium">Postpaid</div>
              <p className="text-xs text-muted-foreground mt-1">
                Invoice at end of billing period
              </p>
            </button>
          </div>
        </div>

        {/* Postpaid Minutes Limit - only shown for postpaid plans */}
        {isPostpaid && (
          <div className="space-y-2 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Label htmlFor="postpaidLimit" className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              Minutes Threshold
            </Label>
            <Input
              id="postpaidLimit"
              type="number"
              min={1}
              value={form.postpaidMinutesLimit || ""}
              onChange={(e) => setForm({ ...form, postpaidMinutesLimit: parseInt(e.target.value) || null })}
              placeholder="e.g. 1000"
              required
            />
            <p className="text-xs text-muted-foreground">
              Maximum minutes allowed per billing period. Calls will be blocked when this limit is reached.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="price">Monthly Price ($)</Label>
            <Input
              id="price"
              type="number"
              min={0}
              step={0.01}
              value={(form.monthlyPriceCents || 0) / 100}
              onChange={(e) => setForm({ ...form, monthlyPriceCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
            />
            <p className="text-xs text-muted-foreground">Reference price (billed externally)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="minutes">Included Minutes</Label>
            <Input
              id="minutes"
              type="number"
              min={0}
              value={form.includedMinutes || 0}
              onChange={(e) => setForm({ ...form, includedMinutes: parseInt(e.target.value || "0") })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="maxAgents">Max Agents</Label>
            <Input
              id="maxAgents"
              type="number"
              min={1}
              value={form.maxAgents || ""}
              onChange={(e) => setForm({ ...form, maxAgents: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="Unlimited"
            />
            <p className="text-xs text-muted-foreground">Leave empty for unlimited</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxConversations">Max Conversations/Month</Label>
            <Input
              id="maxConversations"
              type="number"
              min={1}
              value={form.maxConversationsPerMonth || ""}
              onChange={(e) => setForm({ ...form, maxConversationsPerMonth: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="Unlimited"
            />
            <p className="text-xs text-muted-foreground">Leave empty for unlimited</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="overage">Overage Rate ($/min)</Label>
          <Input
            id="overage"
            type="number"
            min={0}
            step={0.01}
            value={(form.overageRateCents || 0) / 100}
            onChange={(e) => setForm({ ...form, overageRateCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
          />
          <p className="text-xs text-muted-foreground">Charged per minute after included minutes are used</p>
        </div>

        <div className="space-y-2">
          <Label>Features</Label>
          <div className="flex gap-2">
            <Input
              value={featureInput}
              onChange={(e) => setFeatureInput(e.target.value)}
              placeholder="Add a feature"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFeature())}
            />
            <Button type="button" variant="outline" onClick={addFeature}>Add</Button>
          </div>
          {form.features && form.features.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {form.features.map((feature, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  <Check className="h-3 w-3" />
                  {feature}
                  <button
                    type="button"
                    onClick={() => removeFeature(i)}
                    className="ml-1 hover:text-destructive"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="public">Make plan public</Label>
          <Switch
            id="public"
            checked={form.isPublic}
            onCheckedChange={(checked) => setForm({ ...form, isPublic: checked })}
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={createPlan.isPending}>
            {createPlan.isPending ? "Creating..." : "Create Plan"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

// Edit Plan Dialog
function EditPlanDialog({ planId, onClose }: { planId: string; onClose: () => void }) {
  const updatePlan = useUpdateSubscriptionPlan(planId)
  const { data } = useSubscriptionPlans()
  const plan = data?.plans.find(p => p.id === planId)

  const [form, setForm] = useState({
    name: plan?.name || "",
    description: plan?.description || "",
    includedMinutes: plan?.includedMinutes || 0,
    overageRateCents: plan?.overageRateCents || 20,
    postpaidMinutesLimit: plan?.postpaidMinutesLimit || null,
    maxAgents: plan?.maxAgents || null,
    maxConversationsPerMonth: plan?.maxConversationsPerMonth || null,
    isActive: plan?.isActive ?? true,
    isPublic: plan?.isPublic ?? true,
  })

  if (!plan) return null

  const isPostpaid = plan.billingType === "postpaid"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updatePlan.mutateAsync(form)
      toast.success("Plan updated")
      onClose()
    } catch (err) {
      toast.error("Failed to update", { description: (err as Error).message })
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* Billing Type - Read Only */}
          <div className="space-y-2">
            <Label>Billing Type</Label>
            <div className="flex items-center gap-2">
              {isPostpaid ? (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                  Postpaid
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/30">
                  Prepaid
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">(Cannot be changed)</span>
            </div>
          </div>

          {/* Postpaid Minutes Limit - only for postpaid plans */}
          {isPostpaid && (
            <div className="space-y-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Minutes Threshold
              </Label>
              <Input
                type="number"
                min={1}
                value={form.postpaidMinutesLimit || ""}
                onChange={(e) => setForm({ ...form, postpaidMinutesLimit: parseInt(e.target.value) || null })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Maximum minutes allowed per billing period before blocking calls.
              </p>
            </div>
          )}

          {/* Prepaid: Included Minutes */}
          {!isPostpaid && (
            <div className="space-y-2">
              <Label>Included Minutes</Label>
              <Input 
                type="number" 
                value={form.includedMinutes} 
                onChange={(e) => setForm({ ...form, includedMinutes: parseInt(e.target.value || "0") })} 
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Overage Rate ($/min)</Label>
            <Input 
              type="number" 
              step={0.01} 
              value={form.overageRateCents / 100} 
              onChange={(e) => setForm({ ...form, overageRateCents: Math.round(parseFloat(e.target.value || "0") * 100) })} 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Agents</Label>
              <Input
                type="number"
                min={1}
                value={form.maxAgents || ""}
                onChange={(e) => setForm({ ...form, maxAgents: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="Unlimited"
              />
            </div>
            <div className="space-y-2">
              <Label>Max Conversations/Month</Label>
              <Input
                type="number"
                min={1}
                value={form.maxConversationsPerMonth || ""}
                onChange={(e) => setForm({ ...form, maxConversationsPerMonth: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="Unlimited"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>Active</Label>
            <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Public</Label>
            <Switch checked={form.isPublic} onCheckedChange={(v) => setForm({ ...form, isPublic: v })} />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={updatePlan.isPending}>
              {updatePlan.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

