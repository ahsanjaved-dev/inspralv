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
} from "lucide-react"
import type { AIAgent } from "@/types/database.types"
import Link from "next/link"
import { TestCallButton } from "./test-call-button"

interface AgentCardProps {
  agent: AIAgent
  onDelete: (agent: AIAgent) => void
  onToggleActive: (id: string, isActive: boolean) => void
}

const providerColors: Record<string, string> = {
  vapi: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  retell: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
}

export function AgentCard({ agent, onDelete, onToggleActive }: AgentCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">{agent.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={providerColors[agent.provider] || ""}>
                {agent.provider}
              </Badge>
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
              <Link href={`/agents/${agent.id}`} className="flex items-center cursor-pointer">
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

        <div className="flex gap-2 mt-4">
          <TestCallButton agent={agent} className="flex-1" />
          <Button variant="outline" size="sm" className="flex-1" asChild>
            <Link href={`/agents/${agent.id}`}>
              <Pencil className="mr-2 h-3 w-3" />
              Configure
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}