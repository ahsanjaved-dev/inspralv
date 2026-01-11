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
import { Loader2, Phone } from "lucide-react"
import {
  usePhoneNumber,
  useCreatePhoneNumber,
  useUpdatePhoneNumber,
  useSipTrunks,
} from "@/lib/hooks/use-telephony"
import { createPhoneNumberSchema, type CreatePhoneNumberInput } from "@/types/database.types"

interface PhoneNumberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  phoneNumberId: string | null
}

export function PhoneNumberDialog({ open, onOpenChange, phoneNumberId }: PhoneNumberDialogProps) {
  const isEditing = !!phoneNumberId
  const { data: phoneNumber, isLoading: isLoadingNumber } = usePhoneNumber(phoneNumberId)
  const { data: sipTrunks } = useSipTrunks()
  const createPhoneNumber = useCreatePhoneNumber()
  const updatePhoneNumber = useUpdatePhoneNumber()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreatePhoneNumberInput>({
    // @ts-expect-error: zod schema validation type mismatch with react-hook-form
    resolver: zodResolver(createPhoneNumberSchema),
    defaultValues: {
      phone_number: "",
      phone_number_e164: "",
      friendly_name: "",
      description: "",
      country_code: "",
      provider: "sip",
      external_id: "",
      sip_uri: "",
      sip_trunk_id_ref: undefined,
      supports_inbound: true,
      supports_outbound: true,
      supports_sms: false,
      config: {},
    } as CreatePhoneNumberInput,
  })

  const provider = watch("provider")
  const supportsInbound = watch("supports_inbound")
  const supportsOutbound = watch("supports_outbound")
  const supportsSms = watch("supports_sms")
  const selectedTrunkId = watch("sip_trunk_id_ref")

  // Load existing data when editing
  useEffect(() => {
    if (phoneNumber && isEditing) {
      reset({
        phone_number: phoneNumber.phone_number,
        phone_number_e164: phoneNumber.phone_number_e164 || "",
        friendly_name: phoneNumber.friendly_name || "",
        description: phoneNumber.description || "",
        country_code: phoneNumber.country_code || "",
        provider: phoneNumber.provider,
        external_id: phoneNumber.external_id || "",
        sip_uri: phoneNumber.sip_uri || "",
        sip_trunk_id_ref: phoneNumber.sip_trunk_id_ref || undefined,
        supports_inbound: phoneNumber.supports_inbound,
        supports_outbound: phoneNumber.supports_outbound,
        supports_sms: phoneNumber.supports_sms,
        config: (phoneNumber.config as Record<string, unknown>) || {},
      })
    } else if (!isEditing) {
      reset({
        phone_number: "",
        phone_number_e164: "",
        friendly_name: "",
        description: "",
        country_code: "",
        provider: "sip",
        external_id: "",
        sip_uri: "",
        sip_trunk_id_ref: undefined,
        supports_inbound: true,
        supports_outbound: true,
        supports_sms: false,
        config: {},
      })
    }
  }, [phoneNumber, isEditing, reset])

  // Auto-generate SIP URI when trunk is selected
  useEffect(() => {
    if (provider === "sip" && selectedTrunkId) {
      const trunk = sipTrunks?.find(t => t.id === selectedTrunkId)
      if (trunk) {
        const phoneNum = watch("phone_number_e164") || watch("phone_number")
        if (phoneNum) {
          setValue("sip_uri", `sip:${phoneNum}@${trunk.sip_server}:${trunk.sip_port}`)
        }
      }
    }
  }, [selectedTrunkId, provider, sipTrunks, setValue, watch])

  const onSubmit = async (data: CreatePhoneNumberInput) => {
    try {
      if (isEditing && phoneNumberId) {
        await updatePhoneNumber.mutateAsync({ id: phoneNumberId, data })
      } else {
        await createPhoneNumber.mutateAsync(data)
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
            <Phone className="h-5 w-5" />
            {isEditing ? "Edit Phone Number" : "Add Phone Number"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update phone number configuration."
              : "Add a new phone number to your inventory."}
          </DialogDescription>
        </DialogHeader>

        {isLoadingNumber && isEditing ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit((data) => onSubmit(data as unknown as CreatePhoneNumberInput))} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Phone Number Details</h3>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone_number">Phone Number *</Label>
                  <Input
                    id="phone_number"
                    placeholder="+61 420 107 030"
                    {...register("phone_number")}
                  />
                  {errors.phone_number && (
                    <p className="text-sm text-red-500">{errors.phone_number.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone_number_e164">E.164 Format</Label>
                  <Input
                    id="phone_number_e164"
                    placeholder="+61420107030"
                    {...register("phone_number_e164")}
                  />
                  <p className="text-xs text-muted-foreground">
                    International format without spaces
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="friendly_name">Friendly Name</Label>
                  <Input
                    id="friendly_name"
                    placeholder="Main Support Line"
                    {...register("friendly_name")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country_code">Country Code</Label>
                  <Input
                    id="country_code"
                    placeholder="AU"
                    maxLength={5}
                    {...register("country_code")}
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

            {/* Provider Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Provider Configuration</h3>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="provider">Provider</Label>
                  <Select
                    value={provider}
                    onValueChange={(value) => setValue("provider", value as "sip" | "vapi" | "retell" | "twilio")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sip">SIP (BYO)</SelectItem>
                      <SelectItem value="vapi">Vapi</SelectItem>
                      <SelectItem value="retell">Retell</SelectItem>
                      <SelectItem value="twilio">Twilio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {provider !== "sip" && (
                  <div className="space-y-2">
                    <Label htmlFor="external_id">External ID</Label>
                    <Input
                      id="external_id"
                      placeholder="Provider's phone number ID"
                      {...register("external_id")}
                    />
                  </div>
                )}
              </div>

              {/* SIP-specific settings */}
              {provider === "sip" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="sip_trunk_id_ref">SIP Trunk</Label>
                    <Select
                      value={selectedTrunkId || ""}
                      onValueChange={(value) => setValue("sip_trunk_id_ref", value || undefined)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a SIP trunk" />
                      </SelectTrigger>
                      <SelectContent>
                        {sipTrunks?.map((trunk) => (
                          <SelectItem key={trunk.id} value={trunk.id}>
                            {trunk.name} ({trunk.sip_server})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {sipTrunks?.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No SIP trunks configured. Add one first.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sip_uri">SIP URI</Label>
                    <Input
                      id="sip_uri"
                      placeholder="sip:+61420107030@sip.example.com:5060"
                      {...register("sip_uri")}
                    />
                    <p className="text-xs text-muted-foreground">
                      Auto-generated when you select a SIP trunk
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Capabilities */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Capabilities</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="supports_inbound">Supports Inbound</Label>
                    <p className="text-sm text-muted-foreground">
                      Can receive incoming calls
                    </p>
                  </div>
                  <Switch
                    id="supports_inbound"
                    checked={supportsInbound}
                    onCheckedChange={(checked) => setValue("supports_inbound", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="supports_outbound">Supports Outbound</Label>
                    <p className="text-sm text-muted-foreground">
                      Can make outgoing calls
                    </p>
                  </div>
                  <Switch
                    id="supports_outbound"
                    checked={supportsOutbound}
                    onCheckedChange={(checked) => setValue("supports_outbound", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="supports_sms">Supports SMS</Label>
                    <p className="text-sm text-muted-foreground">
                      Can send and receive SMS messages
                    </p>
                  </div>
                  <Switch
                    id="supports_sms"
                    checked={supportsSms}
                    onCheckedChange={(checked) => setValue("supports_sms", checked)}
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
                    {isEditing ? "Saving..." : "Adding..."}
                  </>
                ) : (
                  isEditing ? "Save Changes" : "Add Phone Number"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

