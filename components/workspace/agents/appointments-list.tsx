"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Calendar,
  Clock,
  User,
  Mail,
  Phone,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  CalendarX,
  CalendarClock,
  Filter,
  RefreshCw,
  CheckCircle,
} from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow, format } from "date-fns"
import { cn } from "@/lib/utils"

// =============================================================================
// TYPES
// =============================================================================

interface AppointmentsListProps {
  workspaceSlug: string
  agentId: string
}

interface Appointment {
  id: string
  attendee_name: string | null
  attendee_email: string
  attendee_phone: string | null
  appointment_type: "book" | "reschedule" | "cancel"
  status: "scheduled" | "cancelled" | "rescheduled" | "completed" | "no_show"
  scheduled_start: string
  scheduled_end: string
  timezone: string
  duration_minutes: number
  notes: string | null
  created_at: string
}

interface PaginationData {
  page: number
  limit: number
  total: number
  totalPages: number
}

// =============================================================================
// STATUS CONFIG
// =============================================================================

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  scheduled: { label: "Scheduled", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  rescheduled: { label: "Rescheduled", variant: "secondary" },
  completed: { label: "Completed", variant: "outline" },
  no_show: { label: "No Show", variant: "destructive" },
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AppointmentsList({ workspaceSlug, agentId }: AppointmentsListProps) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false)
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  
  // Reschedule form state
  const [rescheduleDate, setRescheduleDate] = useState("")
  const [rescheduleTime, setRescheduleTime] = useState("")

  // Fetch appointments
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["agent-appointments", agentId, page, status, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "10",
      })
      if (status !== "all") params.set("status", status)
      if (search) params.set("email", search)

      const res = await fetch(
        `/api/w/${workspaceSlug}/agents/${agentId}/calendar/appointments?${params}`
      )
      if (!res.ok) throw new Error("Failed to fetch appointments")
      return res.json()
    },
  })

  const appointments = (data?.data || []) as Appointment[]
  const pagination = data?.pagination as PaginationData | undefined

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const res = await fetch(
        `/api/w/${workspaceSlug}/agents/${agentId}/calendar/appointments/${appointmentId}?reason=Cancelled by admin`,
        { method: "DELETE" }
      )
      if (!res.ok) throw new Error("Failed to cancel appointment")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Appointment cancelled")
      queryClient.invalidateQueries({ queryKey: ["agent-appointments", agentId] })
      setCancelDialogOpen(false)
      setSelectedAppointment(null)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  // Mark complete mutation
  const completeMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const res = await fetch(
        `/api/w/${workspaceSlug}/agents/${agentId}/calendar/appointments/${appointmentId}`,
        { 
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" })
        }
      )
      if (!res.ok) throw new Error("Failed to mark appointment as complete")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Appointment marked as complete")
      queryClient.invalidateQueries({ queryKey: ["agent-appointments", agentId] })
      setCompleteDialogOpen(false)
      setSelectedAppointment(null)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  // Reschedule mutation
  const rescheduleMutation = useMutation({
    mutationFn: async ({ appointmentId, newDate, newTime }: { appointmentId: string; newDate: string; newTime: string }) => {
      const res = await fetch(
        `/api/w/${workspaceSlug}/agents/${agentId}/calendar/appointments/${appointmentId}`,
        { 
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_date: newDate, new_time: newTime })
        }
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to reschedule appointment")
      }
      return data
    },
    onSuccess: () => {
      toast.success("Appointment rescheduled successfully")
      queryClient.invalidateQueries({ queryKey: ["agent-appointments", agentId] })
      setRescheduleDialogOpen(false)
      setSelectedAppointment(null)
      setRescheduleDate("")
      setRescheduleTime("")
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  const formatAppointmentTime = (apt: Appointment) => {
    const start = new Date(apt.scheduled_start)
    return format(start, "PPP 'at' p")
  }

  const getTimeFromNow = (apt: Appointment) => {
    const start = new Date(apt.scheduled_start)
    const now = new Date()
    if (start < now) {
      return { isPast: true, text: formatDistanceToNow(start, { addSuffix: true }) }
    }
    return { isPast: false, text: `in ${formatDistanceToNow(start)}` }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Appointments
              </CardTitle>
              <CardDescription>
                View and manage booked appointments for this agent
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["agent-appointments", agentId] })
              }
              disabled={isFetching}
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="Search by email..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="max-w-xs"
              />
              <Button variant="secondary" onClick={handleSearch}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="rescheduled">Rescheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {appointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No appointments found</p>
              <p className="text-muted-foreground">
                {search || status !== "all"
                  ? "Try adjusting your filters"
                  : "Appointments booked by callers will appear here"}
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Attendee</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments.map((apt) => {
                      const timeInfo = getTimeFromNow(apt)
                      return (
                        <TableRow key={apt.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {apt.attendee_name || "Unknown"}
                              </span>
                              <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {apt.attendee_email}
                              </span>
                              {apt.attendee_phone && (
                                <span className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {apt.attendee_phone}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatAppointmentTime(apt)}
                              </span>
                              <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {apt.duration_minutes} min ({apt.timezone})
                              </span>
                              <span
                                className={cn(
                                  "text-xs",
                                  timeInfo.isPast ? "text-muted-foreground" : "text-blue-600"
                                )}
                              >
                                {timeInfo.text}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_CONFIG[apt.status]?.variant || "secondary"}>
                              {STATUS_CONFIG[apt.status]?.label || apt.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => setSelectedAppointment(apt)}
                                >
                                  View Details
                                </DropdownMenuItem>
                                {apt.status === "scheduled" && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedAppointment(apt)
                                        // Pre-fill with current date/time
                                        const currentDate = new Date(apt.scheduled_start)
                                        setRescheduleDate(format(currentDate, "yyyy-MM-dd"))
                                        setRescheduleTime(format(currentDate, "HH:mm"))
                                        setRescheduleDialogOpen(true)
                                      }}
                                    >
                                      <CalendarClock className="h-4 w-4 mr-2" />
                                      Reschedule
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedAppointment(apt)
                                        setCompleteDialogOpen(true)
                                      }}
                                    >
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      Mark Complete
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => {
                                        setSelectedAppointment(apt)
                                        setCancelDialogOpen(true)
                                      }}
                                    >
                                      <CalendarX className="h-4 w-4 mr-2" />
                                      Cancel
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pagination.limit + 1} to{" "}
                    {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}{" "}
                    appointments
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                      disabled={page === pagination.totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Appointment</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this appointment? The attendee will be notified via
              email.
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-2 py-4">
              <p>
                <strong>Attendee:</strong> {selectedAppointment.attendee_name || "Unknown"}
              </p>
              <p>
                <strong>Email:</strong> {selectedAppointment.attendee_email}
              </p>
              <p>
                <strong>Scheduled:</strong> {formatAppointmentTime(selectedAppointment)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep Appointment
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                selectedAppointment && cancelMutation.mutate(selectedAppointment.id)
              }
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                "Cancel Appointment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appointment Details Dialog */}
      <Dialog
        open={!!selectedAppointment && !cancelDialogOpen && !rescheduleDialogOpen && !completeDialogOpen}
        onOpenChange={(open) => !open && setSelectedAppointment(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{selectedAppointment.attendee_name || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedAppointment.attendee_email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">
                    {selectedAppointment.attendee_phone || "Not provided"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={STATUS_CONFIG[selectedAppointment.status]?.variant}>
                    {STATUS_CONFIG[selectedAppointment.status]?.label || selectedAppointment.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date & Time</p>
                  <p className="font-medium">{formatAppointmentTime(selectedAppointment)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-medium">{selectedAppointment.duration_minutes} minutes</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Timezone</p>
                  <p className="font-medium">{selectedAppointment.timezone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {format(new Date(selectedAppointment.created_at), "PPP")}
                  </p>
                </div>
              </div>
              {selectedAppointment.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="font-medium">{selectedAppointment.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAppointment(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Complete Confirmation Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Appointment as Complete</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this appointment as completed?
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-2 py-4">
              <p>
                <strong>Attendee:</strong> {selectedAppointment.attendee_name || "Unknown"}
              </p>
              <p>
                <strong>Email:</strong> {selectedAppointment.attendee_email}
              </p>
              <p>
                <strong>Scheduled:</strong> {formatAppointmentTime(selectedAppointment)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                selectedAppointment && completeMutation.mutate(selectedAppointment.id)
              }
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark Complete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleDialogOpen} onOpenChange={(open) => {
        setRescheduleDialogOpen(open)
        if (!open) {
          setRescheduleDate("")
          setRescheduleTime("")
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
            <DialogDescription>
              Select a new date and time for this appointment. The attendee will be notified via email.
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted p-3 space-y-1">
                <p className="text-sm">
                  <strong>Attendee:</strong> {selectedAppointment.attendee_name || "Unknown"}
                </p>
                <p className="text-sm">
                  <strong>Email:</strong> {selectedAppointment.attendee_email}
                </p>
                <p className="text-sm">
                  <strong>Current Time:</strong> {formatAppointmentTime(selectedAppointment)}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reschedule-date">New Date</Label>
                  <Input
                    id="reschedule-date"
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    min={format(new Date(), "yyyy-MM-dd")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reschedule-time">New Time</Label>
                  <Input
                    id="reschedule-time"
                    type="time"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                  />
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Timezone: {selectedAppointment.timezone}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                selectedAppointment && rescheduleMutation.mutate({
                  appointmentId: selectedAppointment.id,
                  newDate: rescheduleDate,
                  newTime: rescheduleTime
                })
              }
              disabled={rescheduleMutation.isPending || !rescheduleDate || !rescheduleTime}
            >
              {rescheduleMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rescheduling...
                </>
              ) : (
                <>
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Reschedule
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

