"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Server, Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import {
  useSipTrunk,
  useCreateSipTrunk,
  useUpdateSipTrunk,
} from "@/lib/hooks/use-telephony"
import { createSipTrunkSchema, type CreateSipTrunkInput } from "@/types/database.types"

interface SipTrunkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sipTrunkId: string | null
}

export function SipTrunkDialog({ open, onOpenChange, sipTrunkId }: SipTrunkDialogProps) {
  const isEditing = !!sipTrunkId
  const { data: sipTrunk, isLoading: isLoadingTrunk } = useSipTrunk(sipTrunkId)
  const createSipTrunk = useCreateSipTrunk()
  const updateSipTrunk = useUpdateSipTrunk()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateSipTrunkInput>({
    resolver: zodResolver(createSipTrunkSchema),
    defaultValues: {
      name: "",
      description: "",
      sip_server: "",
      sip_port: 5060,
      sip_transport: "udp",
      sip_username: "",
      sip_password: "",
      sip_realm: "",
      register: true,
      registration_expiry: 3600,
      outbound_proxy: "",
      outbound_caller_id: "",
      is_default: false,
    },
  })

  const sipTransport = watch("sip_transport")
  const isDefault = watch("is_default")
  const registerEnabled = watch("register")

  // Load existing data when editing
  useEffect(() => {
    if (sipTrunk && isEditing) {
      reset({
        name: sipTrunk.name,
        description: sipTrunk.description || "",
        sip_server: sipTrunk.sip_server,
        sip_port: sipTrunk.sip_port,
        sip_transport: sipTrunk.sip_transport as "udp" | "tcp" | "tls",
        sip_username: sipTrunk.sip_username,
        sip_password: "", // Don't show existing password
        sip_realm: sipTrunk.sip_realm || "",
        register: sipTrunk.register,
        registration_expiry: sipTrunk.registration_expiry,
        outbound_proxy: sipTrunk.outbound_proxy || "",
        outbound_caller_id: sipTrunk.outbound_caller_id || "",
        is_default: sipTrunk.is_default,
      })
    } else if (!isEditing) {
      reset({
        name: "",
        description: "",
        sip_server: "",
        sip_port: 5060,
        sip_transport: "udp",
        sip_username: "",
        sip_password: "",
        sip_realm: "",
        register: true,
        registration_expiry: 3600,
        outbound_proxy: "",
        outbound_caller_id: "",
        is_default: false,
      })
    }
  }, [sipTrunk, isEditing, reset])

  const onSubmit = async (data: CreateSipTrunkInput) => {
    try {
      if (isEditing && sipTrunkId) {
        // Only include password if it was changed
        const updateData = { ...data }
        if (!updateData.sip_password) {
          delete (updateData as Record<string, unknown>).sip_password
        }
        await updateSipTrunk.mutateAsync({ id: sipTrunkId, data: updateData })
      } else {
        await createSipTrunk.mutateAsync(data)
      }
      onOpenChange(false)
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            {isEditing ? "Edit SIP Trunk" : "Add SIP Trunk"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update your SIP trunk configuration."
              : "Configure a new SIP trunk for BYO telephony."}
          </DialogDescription>
        </DialogHeader>

        {isLoadingTrunk && isEditing ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Basic Information</h3>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    placeholder="My SIP Trunk"
                    {...register("name")}
                  />
                  {errors.name && (
                    <p className="text-sm text-red-500">{errors.name.message}</p>
                  )}
                </div>

                <div className="flex items-center justify-between space-x-2 pt-6">
                  <Label htmlFor="is_default">Set as Default</Label>
                  <Switch
                    id="is_default"
                    checked={isDefault}
                    onCheckedChange={(checked) => setValue("is_default", checked)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional description..."
                  rows={2}
                  {...register("description")}
                />
              </div>
            </div>

            {/* Server Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Server Configuration</h3>
              
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="sip_server">SIP Server *</Label>
                  <Input
                    id="sip_server"
                    placeholder="sip.example.com"
                    {...register("sip_server")}
                  />
                  {errors.sip_server && (
                    <p className="text-sm text-red-500">{errors.sip_server.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sip_port">Port *</Label>
                  <Input
                    id="sip_port"
                    type="number"
                    placeholder="5060"
                    {...register("sip_port", { valueAsNumber: true })}
                  />
                  {errors.sip_port && (
                    <p className="text-sm text-red-500">{errors.sip_port.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sip_transport">Transport Protocol</Label>
                <Select
                  value={sipTransport}
                  onValueChange={(value) => setValue("sip_transport", value as "udp" | "tcp" | "tls")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select transport" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="udp">UDP (Default)</SelectItem>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="tls">TLS (Secure)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Authentication */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Authentication</h3>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sip_username">Username *</Label>
                  <Input
                    id="sip_username"
                    placeholder="username"
                    {...register("sip_username")}
                  />
                  {errors.sip_username && (
                    <p className="text-sm text-red-500">{errors.sip_username.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sip_password">
                    Password {isEditing ? "(leave blank to keep)" : "*"}
                  </Label>
                  <div className="relative">
                    <Input
                      id="sip_password"
                      type={showPassword ? "text" : "password"}
                      placeholder={isEditing ? "••••••••" : "password"}
                      {...register("sip_password")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {errors.sip_password && (
                    <p className="text-sm text-red-500">{errors.sip_password.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sip_realm">Realm (Optional)</Label>
                <Input
                  id="sip_realm"
                  placeholder="Optional authentication realm"
                  {...register("sip_realm")}
                />
              </div>
            </div>

            {/* Registration */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Registration</h3>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="register">Enable Registration</Label>
                  <p className="text-sm text-muted-foreground">
                    Register with the SIP server to receive inbound calls
                  </p>
                </div>
                <Switch
                  id="register"
                  checked={registerEnabled}
                  onCheckedChange={(checked) => setValue("register", checked)}
                />
              </div>

              {registerEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="registration_expiry">Registration Expiry (seconds)</Label>
                  <Input
                    id="registration_expiry"
                    type="number"
                    placeholder="3600"
                    {...register("registration_expiry", { valueAsNumber: true })}
                  />
                </div>
              )}
            </div>

            {/* Outbound Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Outbound Settings (Optional)</h3>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="outbound_proxy">Outbound Proxy</Label>
                  <Input
                    id="outbound_proxy"
                    placeholder="proxy.example.com"
                    {...register("outbound_proxy")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="outbound_caller_id">Default Caller ID</Label>
                  <Input
                    id="outbound_caller_id"
                    placeholder="+1234567890"
                    {...register("outbound_caller_id")}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isEditing ? "Saving..." : "Creating..."}
                  </>
                ) : (
                  isEditing ? "Save Changes" : "Create SIP Trunk"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

