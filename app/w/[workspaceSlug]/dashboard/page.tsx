"use client"

import { useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Bot,
  MessageSquare,
  Clock,
  DollarSign,
  Loader2,
  Plus,
  ArrowRight,
  TrendingUp,
  Users,
} from "lucide-react"
import Link from "next/link"
import { useWorkspaceStats } from "@/lib/hooks/use-workspace-stats"

export default function WorkspaceDashboardPage() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const baseUrl = `/w/${workspaceSlug}`

  const { data: stats, isLoading, error } = useWorkspaceStats()

  const statCards = [
    {
      title: "Total Agents",
      value: stats?.total_agents ?? 0,
      subtitle: stats?.total_agents === 0 ? "No agents yet" : "Active agents",
      icon: Bot,
      href: `${baseUrl}/agents`,
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
    },
    {
      title: "Conversations",
      value: stats?.conversations_this_month ?? 0,
      subtitle: "This month",
      icon: MessageSquare,
      href: `${baseUrl}/conversations`,
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-900/30",
    },
    {
      title: "Minutes Used",
      value: stats?.minutes_this_month?.toFixed(0) ?? 0,
      subtitle: "This month",
      icon: Clock,
      href: `${baseUrl}/analytics`,
      color: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
    },
    {
      title: "Total Cost",
      value: `$${(stats?.cost_this_month ?? 0).toFixed(2)}`,
      subtitle: "This month",
      icon: DollarSign,
      href: `${baseUrl}/settings`,
      color: "text-purple-600",
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your workspace</p>
        </div>
        <Button asChild>
          <Link href={`${baseUrl}/agents/new`}>
            <Plus className="mr-2 h-4 w-4" />
            Create Agent
          </Link>
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400">
              Failed to load dashboard stats. Please try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <Icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Loading...</span>
                  </div>
                ) : (
                  <>
                    <div className="text-2xl font-bold">{card.value}</div>
                    <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                  </>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Quick Actions
            </CardTitle>
            <CardDescription>Get started with common tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full justify-start">
              <Link href={`${baseUrl}/agents/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Create New Agent
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`${baseUrl}/agents`}>
                <Bot className="mr-2 h-4 w-4" />
                View All Agents
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`${baseUrl}/conversations`}>
                <MessageSquare className="mr-2 h-4 w-4" />
                View Conversations
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Team Management
            </CardTitle>
            <CardDescription>Manage your workspace team</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`${baseUrl}/members`}>
                <Users className="mr-2 h-4 w-4" />
                View Members
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`${baseUrl}/settings`}>
                <Plus className="mr-2 h-4 w-4" />
                Workspace Settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Empty State for Agents */}
      {!isLoading && stats?.total_agents === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 bg-primary/10 rounded-full mb-4">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No agents yet</h3>
            <p className="text-muted-foreground text-center max-w-sm mt-2">
              Create your first AI voice agent to start handling calls and automating conversations.
            </p>
            <Button asChild className="mt-6">
              <Link href={`${baseUrl}/agents/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Agent
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
