"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Bot,
  MoreVertical,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  MessageSquare,
  Clock,
  DollarSign,
  Phone,
  AlertCircle,
  Loader2,
  PhoneIncoming,
  PhoneOutgoing,
} from "lucide-react"
import type { AIAgent } from "@/types/database.types"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { TestCallModal } from "@/components/agents/test-call-modal"
import { TestOutboundCallModal } from "@/components/agents/test-outbound-call-modal"
import { useTestCallValidation } from "../../../lib/hooks/use-test-call-validations"

interface WorkspaceAgentCardProps {
  agent: AIAgent
  onDelete: (agent: AIAgent) => void
  onToggleActive: (id: string, isActive: boolean) => void
}

const providerColors: Record<string, string> = {
  vapi: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  retell: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
}

const directionConfig: Record<"inbound" | "outbound", { icon: typeof PhoneIncoming; label: string; color: string }> = {
  inbound: {
    icon: PhoneIncoming,
    label: "Inbound",
    color: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  },
  outbound: {
    icon: PhoneOutgoing,
    label: "Outbound",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  },
}

export function WorkspaceAgentCard({ agent, onDelete, onToggleActive }: WorkspaceAgentCardProps) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const baseUrl = `/w/${workspaceSlug}`
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isOutboundModalOpen, setIsOutboundModalOpen] = useState(false)
  
  const validation = useTestCallValidation(agent)
  
  // Check if agent can make outbound calls
  const canMakeOutboundCall = agent.provider === "vapi" && !!agent.external_agent_id
  const isOutboundAgent = agent.agent_direction === "outbound"

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">{agent.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className={providerColors[agent.provider] || ""}>
                {agent.provider}
              </Badge>
              {/* Direction Badge */}
              {agent.agent_direction && directionConfig[agent.agent_direction] && (
                <Badge variant="outline" className={directionConfig[agent.agent_direction].color}>
                  {(() => {
                    const DirectionIcon = directionConfig[agent.agent_direction].icon
                    return <DirectionIcon className="w-3 h-3 mr-1" />
                  })()}
                  {directionConfig[agent.agent_direction].label}
                </Badge>
              )}
              {agent.is_active ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100">
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link
                href={`${baseUrl}/agents/${agent.id}`}
                className="flex items-center cursor-pointer"
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive(agent.id, !agent.is_active)}>
              {agent.is_active ? (
                <>
                  <PowerOff className="mr-2 h-4 w-4" />
                  Deactivate
                </>
              ) : (
                <>
                  <Power className="mr-2 h-4 w-4" />
                  Activate
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(agent)}
              className="text-red-600 focus:text-red-600 cursor-pointer"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
          {agent.description || "No description provided"}
        </p>

        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div className="p-2 bg-muted/50 rounded">
            <MessageSquare className="w-4 h-4 mx-auto text-blue-500" />
            <p className="text-sm font-semibold mt-1">{agent.total_conversations || 0}</p>
            <p className="text-xs text-muted-foreground">Calls</p>
          </div>
          <div className="p-2 bg-muted/50 rounded">
            <Clock className="w-4 h-4 mx-auto text-orange-500" />
            <p className="text-sm font-semibold mt-1">{agent.total_minutes?.toFixed(0) || 0}</p>
            <p className="text-xs text-muted-foreground">Minutes</p>
          </div>
          <div className="p-2 bg-muted/50 rounded">
            <DollarSign className="w-4 h-4 mx-auto text-green-500" />
            <p className="text-sm font-semibold mt-1">${agent.total_cost?.toFixed(2) || "0.00"}</p>
            <p className="text-xs text-muted-foreground">Cost</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4 text-xs text-muted-foreground">
          {agent.voice_provider && (
            <span className="px-2 py-1 bg-muted rounded">Voice: {agent.voice_provider}</span>
          )}
          {agent.model_provider && (
            <span className="px-2 py-1 bg-muted rounded">Model: {agent.model_provider}</span>
          )}
          {agent.transcriber_provider && (
            <span className="px-2 py-1 bg-muted rounded">STT: {agent.transcriber_provider}</span>
          )}
        </div>

        {/* Phone Number Display */}
        {agent.external_phone_number && (
          <div className="mt-3 flex items-center gap-2 text-xs p-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <Phone className="w-3.5 h-3.5 text-green-600" />
            <span className="font-mono text-green-700 dark:text-green-300 truncate">
              {agent.external_phone_number}
            </span>
          </div>
        )}

        {/* Buttons Row */}
        <div className="flex flex-wrap gap-2 mt-4">
          {/* Web Call Test (Browser) */}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 min-w-[90px]"
            disabled={validation.isLoading || !validation.canCall}
            onClick={() => validation.canCall && setIsModalOpen(true)}
          >
            {validation.isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Phone className="h-3 w-3" />
            )}
            <span className="ml-1.5 truncate">Web Call</span>
          </Button>
          {/* Outbound Phone Call Test */}
          {isOutboundAgent && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 min-w-[80px]"
              disabled={!canMakeOutboundCall}
              onClick={() => setIsOutboundModalOpen(true)}
            >
              <PhoneOutgoing className="h-3 w-3" />
              <span className="ml-1.5 truncate">Call Me</span>
            </Button>
          )}
          <Button variant="outline" size="sm" className="flex-1 min-w-[90px]" asChild>
            <Link href={`${baseUrl}/agents/${agent.id}`}>
              <Pencil className="h-3 w-3" />
              <span className="ml-1.5 truncate">Configure</span>
            </Link>
          </Button>
        </div>

        {/* Disabled Reason - shown below buttons */}
        {!validation.isLoading && !validation.canCall && validation.reason && (
          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 dark:bg-muted/30 rounded-md p-2 border border-border/50">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500 dark:text-amber-400" />
            <div>
              <span className="font-medium text-foreground/80">{validation.reason}:</span>{" "}
              {validation.solution}
            </div>
          </div>
        )}
      </CardContent>

      {/* Test Call Modal (Web Call) */}
      {validation.canCall && (
        <TestCallModal agent={agent} open={isModalOpen} onOpenChange={setIsModalOpen} />
      )}
      
      {/* Test Outbound Call Modal (Phone Call) */}
      {canMakeOutboundCall && (
        <TestOutboundCallModal 
          agent={agent} 
          workspaceSlug={workspaceSlug}
          open={isOutboundModalOpen} 
          onOpenChange={setIsOutboundModalOpen} 
        />
      )}
    </Card>
  )
}
