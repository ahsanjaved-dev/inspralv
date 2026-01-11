"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Phone,
  Plus,
  Loader2,
  Settings,
  Trash2,
  Server,
  PhoneCall,
  Check,
  AlertCircle,
  MoreVertical,
  Star,
  Globe,
  Wifi,
  CloudUpload,
  CloudOff,
  RefreshCw,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  useSipTrunks,
  useDeleteSipTrunk,
  usePhoneNumbers,
  useDeletePhoneNumber,
  useSyncSipTrunk,
  useUnsyncSipTrunk,
  useSyncPhoneNumber,
  useUnsyncPhoneNumber,
} from "@/lib/hooks/use-telephony"
import { SipTrunkDialog } from "@/components/org/telephony/sip-trunk-dialog"
import { PhoneNumberDialog } from "@/components/org/telephony/phone-number-dialog"
import { toast } from "sonner"

export default function OrgTelephonyPage() {
  const { data: sipTrunks, isLoading: sipTrunksLoading, error: sipTrunksError } = useSipTrunks()
  const { data: phoneNumbers, isLoading: phoneNumbersLoading, error: phoneNumbersError } = usePhoneNumbers()
  const deleteSipTrunk = useDeleteSipTrunk()
  const deletePhoneNumber = useDeletePhoneNumber()
  const syncSipTrunk = useSyncSipTrunk()
  const unsyncSipTrunk = useUnsyncSipTrunk()
  const syncPhoneNumber = useSyncPhoneNumber()
  const unsyncPhoneNumber = useUnsyncPhoneNumber()

  // Dialog states
  const [sipTrunkDialogOpen, setSipTrunkDialogOpen] = useState(false)
  const [selectedSipTrunk, setSelectedSipTrunk] = useState<string | null>(null)
  const [phoneNumberDialogOpen, setPhoneNumberDialogOpen] = useState(false)
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null)
  
  // Delete confirmation states
  const [deleteType, setDeleteType] = useState<"sip-trunk" | "phone-number" | null>(null)
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null)

  const isLoading = sipTrunksLoading || phoneNumbersLoading
  const hasError = sipTrunksError || phoneNumbersError

  // Stats
  const totalPhoneNumbers = phoneNumbers?.length || 0
  const assignedNumbers = phoneNumbers?.filter(p => p.status === "assigned").length || 0
  const availableNumbers = phoneNumbers?.filter(p => p.status === "available").length || 0
  const activeSipTrunks = sipTrunks?.filter(t => t.is_active).length || 0

  const handleEditSipTrunk = (id: string) => {
    setSelectedSipTrunk(id)
    setSipTrunkDialogOpen(true)
  }

  const handleEditPhoneNumber = (id: string) => {
    setSelectedPhoneNumber(id)
    setPhoneNumberDialogOpen(true)
  }

  const handleDeleteClick = (type: "sip-trunk" | "phone-number", id: string, name: string) => {
    setDeleteType(type)
    setItemToDelete({ id, name })
  }

  const handleConfirmDelete = async () => {
    if (!itemToDelete || !deleteType) return
    
    try {
      if (deleteType === "sip-trunk") {
        await deleteSipTrunk.mutateAsync(itemToDelete.id)
      } else {
        await deletePhoneNumber.mutateAsync(itemToDelete.id)
      }
      toast.success(`${itemToDelete.name} has been deleted`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete")
    } finally {
      setDeleteType(null)
      setItemToDelete(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Telephony</h1>
          <p className="text-muted-foreground mt-1">
            Configure SIP trunks and manage phone numbers for your organization.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Phone Numbers</p>
                <p className="text-2xl font-bold">{totalPhoneNumbers}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Phone className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Assigned</p>
                <p className="text-2xl font-bold">{assignedNumbers}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <PhoneCall className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Available</p>
                <p className="text-2xl font-bold">{availableNumbers}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Globe className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">SIP Trunks</p>
                <p className="text-2xl font-bold">{activeSipTrunks}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Server className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {hasError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-red-600">Failed to load telephony settings. Please try again.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      {!isLoading && !hasError && (
        <Tabs defaultValue="phone-numbers" className="space-y-4">
          <TabsList>
            <TabsTrigger value="phone-numbers" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Phone Numbers
            </TabsTrigger>
            <TabsTrigger value="sip-trunks" className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              SIP Trunks
            </TabsTrigger>
          </TabsList>

          {/* Phone Numbers Tab */}
          <TabsContent value="phone-numbers">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Phone Numbers</CardTitle>
                    <CardDescription>
                      Manage your phone number inventory. Assign numbers to agents for inbound calls.
                    </CardDescription>
                  </div>
                  <Button onClick={() => {
                    setSelectedPhoneNumber(null)
                    setPhoneNumberDialogOpen(true)
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Number
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {phoneNumbers?.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/30">
                    <Phone className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No phone numbers configured</h3>
                    <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                      Add phone numbers to enable inbound calling for your voice agents.
                      Numbers can be assigned to specific agents or workspaces.
                    </p>
                    <Button onClick={() => {
                      setSelectedPhoneNumber(null)
                      setPhoneNumberDialogOpen(true)
                    }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Number
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {phoneNumbers?.map((number) => (
                      <div
                        key={number.id}
                        className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Phone className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium font-mono">
                                {number.friendly_name || number.phone_number}
                              </p>
                              <Badge variant={number.status === "assigned" ? "default" : "secondary"}>
                                {number.status}
                              </Badge>
                              {number.provider && (
                                <Badge variant="outline" className="text-xs">
                                  {number.provider.toUpperCase()}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              {number.phone_number_e164 && number.phone_number_e164 !== number.phone_number && (
                                <span className="font-mono">{number.phone_number_e164}</span>
                              )}
                              {number.assignedAgent && (
                                <span className="flex items-center gap-1">
                                  <Check className="h-3 w-3 text-green-500" />
                                  {number.assignedAgent.name}
                                </span>
                              )}
                              {number.assignedWorkspace && (
                                <span className="flex items-center gap-1">
                                  <Globe className="h-3 w-3" />
                                  {number.assignedWorkspace.name}
                                </span>
                              )}
                              {number.sipTrunk && (
                                <span className="flex items-center gap-1">
                                  <Server className="h-3 w-3" />
                                  {number.sipTrunk.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Sync Status Badge */}
                          {number.external_id ? (
                            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                              <CloudUpload className="h-3 w-3 mr-1" />
                              Synced
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              <CloudOff className="h-3 w-3 mr-1" />
                              Not Synced
                            </Badge>
                          )}
                          
                          {/* Sync Button */}
                          {!number.external_id && (number.sipTrunk || number.sip_trunk_id) && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => syncPhoneNumber.mutate(number.id)}
                              disabled={syncPhoneNumber.isPending}
                            >
                              {syncPhoneNumber.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CloudUpload className="h-4 w-4 mr-1" />
                                  Sync to Vapi
                                </>
                              )}
                            </Button>
                          )}
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditPhoneNumber(number.id)}
                          >
                            <Settings className="h-4 w-4 mr-1" />
                            Manage
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditPhoneNumber(number.id)}>
                                <Settings className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              {number.external_id && (
                                <DropdownMenuItem
                                  onClick={() => unsyncPhoneNumber.mutate(number.id)}
                                  disabled={unsyncPhoneNumber.isPending}
                                >
                                  <CloudOff className="h-4 w-4 mr-2" />
                                  Unsync from Vapi
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => handleDeleteClick("phone-number", number.id, number.phone_number)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SIP Trunks Tab */}
          <TabsContent value="sip-trunks">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>SIP Trunks</CardTitle>
                    <CardDescription>
                      Configure SIP trunk connections for your BYO (Bring Your Own) telephony.
                    </CardDescription>
                  </div>
                  <Button onClick={() => {
                    setSelectedSipTrunk(null)
                    setSipTrunkDialogOpen(true)
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add SIP Trunk
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {sipTrunks?.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/30">
                    <Server className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No SIP trunks configured</h3>
                    <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                      Add a SIP trunk to connect your own telephony provider.
                      This enables BYO (Bring Your Own) phone numbers.
                    </p>
                    <Button onClick={() => {
                      setSelectedSipTrunk(null)
                      setSipTrunkDialogOpen(true)
                    }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add SIP Trunk
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sipTrunks?.map((trunk) => (
                      <div
                        key={trunk.id}
                        className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                            <Server className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{trunk.name}</p>
                              {trunk.is_default && (
                                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                                  <Star className="h-3 w-3 mr-1" />
                                  Default
                                </Badge>
                              )}
                              <Badge variant={trunk.is_active ? "default" : "secondary"}>
                                {trunk.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <span className="font-mono">
                                {trunk.sip_server}:{trunk.sip_port}
                              </span>
                              <span className="flex items-center gap-1">
                                <Wifi className="h-3 w-3" />
                                {trunk.sip_transport.toUpperCase()}
                              </span>
                              {trunk.registration_status && (
                                <span className={`flex items-center gap-1 ${
                                  trunk.registration_status === "registered" 
                                    ? "text-green-600" 
                                    : "text-yellow-600"
                                }`}>
                                  <Check className="h-3 w-3" />
                                  {trunk.registration_status}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Sync Status Badge */}
                          {trunk.external_credential_id ? (
                            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                              <CloudUpload className="h-3 w-3 mr-1" />
                              Synced to Vapi
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              <CloudOff className="h-3 w-3 mr-1" />
                              Not Synced
                            </Badge>
                          )}
                          
                          {/* Sync Button */}
                          {trunk.external_credential_id ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => syncSipTrunk.mutate(trunk.id)}
                              disabled={syncSipTrunk.isPending}
                            >
                              {syncSipTrunk.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-1" />
                                  Re-sync
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => syncSipTrunk.mutate(trunk.id)}
                              disabled={syncSipTrunk.isPending}
                            >
                              {syncSipTrunk.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CloudUpload className="h-4 w-4 mr-1" />
                                  Sync to Vapi
                                </>
                              )}
                            </Button>
                          )}
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditSipTrunk(trunk.id)}
                          >
                            <Settings className="h-4 w-4 mr-1" />
                            Configure
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditSipTrunk(trunk.id)}>
                                <Settings className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              {trunk.external_credential_id && (
                                <DropdownMenuItem
                                  onClick={() => unsyncSipTrunk.mutate(trunk.id)}
                                  disabled={unsyncSipTrunk.isPending}
                                >
                                  <CloudOff className="h-4 w-4 mr-2" />
                                  Unsync from Vapi
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => handleDeleteClick("sip-trunk", trunk.id, trunk.name)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* SIP Trunk Dialog */}
      <SipTrunkDialog
        open={sipTrunkDialogOpen}
        onOpenChange={setSipTrunkDialogOpen}
        sipTrunkId={selectedSipTrunk}
      />

      {/* Phone Number Dialog */}
      <PhoneNumberDialog
        open={phoneNumberDialogOpen}
        onOpenChange={setPhoneNumberDialogOpen}
        phoneNumberId={selectedPhoneNumber}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteType} onOpenChange={() => {
        setDeleteType(null)
        setItemToDelete(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteType === "sip-trunk" ? "SIP Trunk" : "Phone Number"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{itemToDelete?.name}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteSipTrunk.isPending || deletePhoneNumber.isPending}
            >
              {(deleteSipTrunk.isPending || deletePhoneNumber.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

