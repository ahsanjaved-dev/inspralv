"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { ConversationDetailModal } from "@/components/workspace/conversations/conversation-detail-modal"
import { useWorkspaceCalls, useWorkspaceCallsStats } from "@/lib/hooks/use-workspace-calls"
import { useWorkspaceAgents } from "@/lib/hooks/use-workspace-agents"
import {
  Phone,
  Search,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Bot,
  Download,
  DollarSign,
  Activity,
  FileText,
  // PlayCircle,
  Monitor,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import type { ConversationWithAgent } from "@/types/database.types"

// ============================================================================
// STATUS COLORS
// ============================================================================

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  initiated: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  no_answer: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  busy: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  canceled: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function CallsPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [directionFilter, setDirectionFilter] = useState<string>("all")
  const [agentFilter, setAgentFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCall, setSelectedCall] = useState<ConversationWithAgent | null>(null)

  const getCallTypeLabel = (call: ConversationWithAgent): "web" | "inbound" | "outbound" => {
    const meta = call.metadata as Record<string, unknown> | null
    const callType = typeof meta?.call_type === "string" ? meta.call_type : ""
    if (callType.toLowerCase().includes("web")) return "web"
    return call.direction === "inbound" ? "inbound" : "outbound"
  }

  // Fetch calls
  const { data, isLoading, error } = useWorkspaceCalls({
    page,
    pageSize: 20,
    status: statusFilter !== "all" ? statusFilter : undefined,
    direction:
      directionFilter !== "all" && directionFilter !== "web" ? directionFilter : undefined,
    callType: directionFilter === "web" ? "web" : undefined,
    agentId: agentFilter !== "all" ? agentFilter : undefined,
    search: searchQuery || undefined,
  })

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useWorkspaceCallsStats()

  // Fetch agents for filter
  const { data: agentsData } = useWorkspaceAgents({})
  const agents = agentsData?.data || []

  const calls = data?.data || []
  const totalPages = data?.totalPages || 1

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Format duration for display (e.g., "2m 30s")
  const formatDurationDisplay = (seconds: number) => {
    if (seconds === 0) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Call Logs</h1>
          <p className="text-muted-foreground mt-1">
            View and analyze all calls handled by your voice agents.
          </p>
        </div>
        <Button variant="outline" disabled>
          <Download className="mr-2 h-4 w-4" />
          Export Calls
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Total Calls</p>
              <p className="stat-value">
                {statsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  stats?.total ?? 0
                )}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Phone className="w-5 h-5 text-primary" />
            </div>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Completed</p>
              <p className="stat-value">
                {statsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  stats?.completed ?? 0
                )}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Failed</p>
              <p className="stat-value">
                {statsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  stats?.failed ?? 0
                )}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </Card>

        <Card className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Avg Duration</p>
              <p className="stat-value">
                {statsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  formatDurationDisplay(stats?.avgDurationSeconds ?? 0)
                )}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by phone number, caller name, or transcript..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                className="pl-9"
              />
            </div>

            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="no_answer">No Answer</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={directionFilter}
              onValueChange={(value) => {
                setDirectionFilter(value)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Directions</SelectItem>
                <SelectItem value="inbound">Inbound</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
              <SelectItem value="web">Web Calls</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={agentFilter}
              onValueChange={(value) => {
                setAgentFilter(value)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Calls Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Call History
          </CardTitle>
          <CardDescription>
            {data?.total || 0} total calls
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : calls.length === 0 ? (
            <div className="text-center py-12">
              <Phone className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-lg font-medium">No calls found</h3>
              <p className="text-muted-foreground mt-1">
                {searchQuery || statusFilter !== "all" || directionFilter !== "all" || agentFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "Calls will appear here when your agents handle calls"}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Caller</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="w-20">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((call) => (
                    <TableRow
                      key={call.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedCall(call)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">
                              {call.caller_name || "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {call.phone_number || "No number"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-muted-foreground" />
                          <span>{call.agent?.name || "Unknown"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const type = getCallTypeLabel(call)
                          if (type === "web") {
                            return (
                              <div className="flex items-center gap-1 text-purple-600">
                                <Monitor className="h-4 w-4" />
                                <span>Web Call</span>
                              </div>
                            )
                          }
                          if (type === "inbound") {
                            return (
                              <div className="flex items-center gap-1 text-green-600">
                                <ArrowDownLeft className="h-4 w-4" />
                                <span>Inbound</span>
                              </div>
                            )
                          }
                          return (
                            <div className="flex items-center gap-1 text-blue-600">
                              <ArrowUpRight className="h-4 w-4" />
                              <span>Outbound</span>
                            </div>
                          )
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[call.status] || statusColors.completed}>
                          {call.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{formatDuration(call.duration_seconds)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <DollarSign className="h-4 w-4" />
                          <span>${(call.total_cost || 0).toFixed(2)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {call.started_at
                          ? formatDistanceToNow(new Date(call.started_at), {
                              addSuffix: true,
                            })
                          : call.created_at
                          ? formatDistanceToNow(new Date(call.created_at), {
                              addSuffix: true,
                            })
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {call.transcript && (
                            <span title="Has transcript">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
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
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
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

      {/* Call Detail Modal */}
      <ConversationDetailModal
        conversation={selectedCall}
        open={!!selectedCall}
        onClose={() => setSelectedCall(null)}
      />
    </div>
  )
}
