"use client"

import { Card, CardContent } from "@/components/ui/card"
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
  Calendar,
  Settings,
  Zap,
} from "lucide-react"
import type { AIAgent } from "@/types/database.types"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState, useMemo } from "react"
import { TestCallModal } from "@/components/agents/test-call-modal"
import { TestOutboundCallModal } from "@/components/agents/test-outbound-call-modal"
import { useTestCallValidation } from "../../../lib/hooks/use-test-call-validations"
import { cn } from "@/lib/utils"

// Calendar tool names
const CALENDAR_TOOL_NAMES = ["book_appointment", "cancel_appointment", "reschedule_appointment"]

interface WorkspaceAgentCardProps {
  agent: AIAgent
  onDelete: (agent: AIAgent) => void
  onToggleActive: (id: string, isActive: boolean) => void
}

const providerConfig: Record<string, { color: string; gradient: string }> = {
  vapi: {
    color: "text-purple-600 dark:text-purple-400",
    gradient: "from-purple-500/20 via-purple-500/10 to-transparent",
  },
  retell: {
    color: "text-blue-600 dark:text-blue-400",
    gradient: "from-blue-500/20 via-blue-500/10 to-transparent",
  },
}

const directionConfig: Record<"inbound" | "outbound", { icon: typeof PhoneIncoming; label: string; color: string; bgColor: string }> = {
  inbound: {
    icon: PhoneIncoming,
    label: "Inbound",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  outbound: {
    icon: PhoneOutgoing,
    label: "Outbound",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
  },
}

export function WorkspaceAgentCard({ agent, onDelete, onToggleActive }: WorkspaceAgentCardProps) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const baseUrl = `/w/${workspaceSlug}`
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isOutboundModalOpen, setIsOutboundModalOpen] = useState(false)
  
  const validation = useTestCallValidation(agent)
  const outboundValidation = useOutboundCallValidation(agent)
  
  // Check if this is an outbound agent
  const isOutboundAgent = agent.agent_direction === "outbound"
  
  // Check if outbound agent has a phone number configured
  const hasPhoneNumber = !!agent.assigned_phone_number_id || !!agent.external_phone_number
  const outboundNeedsPhone = isOutboundAgent && !hasPhoneNumber
  
  // Check if agent has calendar tools
  const calendarTools = useMemo(() => {
    const tools = agent.config?.tools || []
    return tools.filter((tool: { name?: string }) => 
      tool.name && CALENDAR_TOOL_NAMES.includes(tool.name)
    )
  }, [agent.config?.tools])
  
  const hasCalendarTools = calendarTools.length > 0
  const providerStyle = providerConfig[agent.provider] || providerConfig.vapi
  const directionStyle = agent.agent_direction ? directionConfig[agent.agent_direction] : null

  return (
    <Card className={cn(
      "group relative overflow-hidden transition-all duration-300",
      "hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5",
      "border-border/50 hover:border-border",
      "bg-gradient-to-br from-card via-card to-card/80"
    )}>
      {/* Gradient accent at top */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r",
        agent.provider === "vapi" ? "from-purple-500 via-purple-400 to-purple-600" : "from-blue-500 via-blue-400 to-blue-600"
      )} />
      
      {/* Subtle background pattern */}
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl opacity-50 pointer-events-none",
        providerStyle.gradient
      )} />

      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Agent Icon with status indicator */}
            <div className="relative flex-shrink-0">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105",
                "bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20"
              )}>
                <Bot className="w-6 h-6 text-primary" />
              </div>
              {/* Active status dot */}
              <div className={cn(
                "absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-card",
                agent.is_active 
                  ? "bg-emerald-500 shadow-lg shadow-emerald-500/50" 
                  : "bg-muted-foreground/50"
              )} />
            </div>
            
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base truncate pr-2" title={agent.name}>
                {agent.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {/* Provider Badge */}
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-wide px-1.5 py-0",
                    providerStyle.color,
                    agent.provider === "vapi" ? "bg-purple-500/10" : "bg-blue-500/10"
                  )}
                >
                  {agent.provider}
                </Badge>
                
                {/* Direction Badge */}
                {directionStyle && (
                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0 gap-0.5",
                      directionStyle.color,
                      directionStyle.bgColor
                    )}
                  >
                    <directionStyle.icon className="w-2.5 h-2.5" />
                    {directionStyle.label}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem asChild>
                <Link
                  href={`${baseUrl}/agents/${agent.id}`}
                  className="flex items-center cursor-pointer"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
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
                className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/50 cursor-pointer"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[40px]">
          {agent.description || "No description provided"}
        </p>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-3 text-center border border-blue-500/10">
            <MessageSquare className="w-4 h-4 mx-auto text-blue-500 mb-1" />
            <p className="text-lg font-bold text-foreground">{agent.total_conversations || 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Calls</p>
          </div>
          <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-orange-500/10 to-orange-500/5 p-3 text-center border border-orange-500/10">
            <Clock className="w-4 h-4 mx-auto text-orange-500 mb-1" />
            <p className="text-lg font-bold text-foreground">{agent.total_minutes?.toFixed(0) || 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Mins</p>
          </div>
          <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-3 text-center border border-emerald-500/10">
            <DollarSign className="w-4 h-4 mx-auto text-emerald-500 mb-1" />
            <p className="text-lg font-bold text-foreground">${agent.total_cost?.toFixed(2) || "0.00"}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cost</p>
          </div>
        </div>

        {/* Phone Number Display */}
        {agent.external_phone_number ? (
          <div className="flex items-center gap-2 text-xs p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span className="font-mono text-emerald-700 dark:text-emerald-300 truncate">
              {agent.external_phone_number}
            </span>
          </div>
        ) : outboundNeedsPhone ? (
          <div className="flex items-center gap-2 text-xs p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span className="text-amber-700 dark:text-amber-300">
              No phone number configured
            </span>
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {/* Web Call Button */}
          <Button
            variant="default"
            size="sm"
            className={cn(
              "flex-1 gap-1.5 font-medium",
              "bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80"
            )}
            disabled={validation.isLoading || !validation.canCall}
            onClick={() => validation.canCall && setIsModalOpen(true)}
          >
            {validation.isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Web Call
          </Button>
          
          {/* Outbound Phone Call Test */}
          {isOutboundAgent && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 font-medium"
              disabled={!canMakeOutboundCall || outboundNeedsPhone}
              onClick={() => setIsOutboundModalOpen(true)}
              title={
                outboundNeedsPhone 
                  ? "Configure a phone number to enable Call Me" 
                  : !canMakeOutboundCall 
                    ? "Agent must be synced with provider first" 
                    : undefined
              }
            >
              <PhoneOutgoing className="h-3.5 w-3.5" />
              Call Me
            </Button>
          )}
          
          {/* Configure Button */}
          <Button 
            variant="ghost" 
            size="sm" 
            className="px-3 hover:bg-muted"
            asChild
          >
            <Link href={`${baseUrl}/agents/${agent.id}`}>
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        
        {/* View Appointments Button - Only shown if agent has calendar tools */}
        {hasCalendarTools && (
          <Button variant="secondary" size="sm" className="w-full mt-2 gap-1.5" asChild>
            <Link href={`${baseUrl}/agents/${agent.id}/appointments`}>
              <Calendar className="h-3.5 w-3.5" />
              View Appointments
            </Link>
          </Button>
        )}

        {/* Disabled Reason */}
        {!validation.isLoading && !validation.canCall && validation.reason && (
          <div className="mt-3 flex items-start gap-2 text-xs p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-amber-700 dark:text-amber-300">
              <span className="font-medium">{validation.reason}:</span> {validation.solution}
            </div>
          </div>
        )}
      </CardContent>

      {/* Test Call Modal (Web Call) */}
      {validation.canCall && (
        <TestCallModal agent={agent} open={isModalOpen} onOpenChange={setIsModalOpen} />
      )}
      
      {/* Test Outbound Call Modal (Phone Call) */}
      {outboundValidation.canCall && (
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
