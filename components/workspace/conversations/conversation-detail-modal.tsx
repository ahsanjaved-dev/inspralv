"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Phone,
  Clock,
  Bot,
  User,
  DollarSign,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import type { ConversationWithAgent } from "@/types/database.types"

interface Props {
  conversation: ConversationWithAgent | null
  open: boolean
  onClose: () => void
}

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  queued: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  no_answer: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
}

const sentimentIcons: Record<string, React.ReactNode> = {
  positive: <ThumbsUp className="h-4 w-4 text-green-500" />,
  neutral: <Minus className="h-4 w-4 text-gray-500" />,
  negative: <ThumbsDown className="h-4 w-4 text-red-500" />,
}

export function ConversationDetailModal({ conversation, open, onClose }: Props) {
  if (!conversation) return null

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {conversation.direction === "inbound" ? (
                <ArrowDownLeft className="h-5 w-5 text-green-500" />
              ) : (
                <ArrowUpRight className="h-5 w-5 text-blue-500" />
              )}
              <div>
                <DialogTitle className="text-xl">
                  {conversation.caller_name || conversation.phone_number || "Unknown Caller"}
                </DialogTitle>
                <DialogDescription>
                  {conversation.phone_number && `${conversation.phone_number} • `}
                  {conversation.started_at && format(new Date(conversation.started_at), "PPp")}
                </DialogDescription>
              </div>
            </div>
            <Badge className={statusColors[conversation.status] || statusColors.queued}>
              {conversation.status.replace("_", " ")}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 py-4">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {formatDuration(conversation.duration_seconds)}
                </p>
                <p className="text-xs text-muted-foreground">Duration</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <Bot className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-medium truncate">
                  {conversation.agent?.name || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">Agent</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <DollarSign className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-medium">${(conversation.total_cost || 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Cost</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="flex justify-center mb-1">
                  {sentimentIcons[conversation.sentiment || "neutral"]}
                </div>
                <p className="text-sm font-medium capitalize">{conversation.sentiment || "N/A"}</p>
                <p className="text-xs text-muted-foreground">Sentiment</p>
              </div>
            </div>

            {/* Summary */}
            {conversation.summary && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Summary
                  </h4>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                    {conversation.summary}
                  </p>
                </div>
              </>
            )}

            {/* Transcript */}
            {conversation.transcript && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Transcript
                  </h4>
                  <ScrollArea className="h-48 bg-muted p-3 rounded-lg">
                    <pre className="text-sm whitespace-pre-wrap font-sans">
                      {conversation.transcript}
                    </pre>
                  </ScrollArea>
                </div>
              </>
            )}

            {/* Follow-up Notes */}
            {conversation.requires_follow_up && (
              <>
                <Separator />
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 rounded-lg">
                  <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                    Follow-up Required
                  </h4>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    {conversation.follow_up_notes || "No notes provided."}
                  </p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
