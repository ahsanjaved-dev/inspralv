"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DepartmentForm } from "@/components/departments/department-form"
import { AddDepartmentMemberDialog } from "@/components/departments/add-member-dialog"
import {
  ArrowLeft,
  Loader2,
  Building2,
  Users,
  Bot,
  Settings,
  Plus,
  MoreVertical,
  Shield,
  Trash2,
  UserMinus,
} from "lucide-react"
import { toast } from "sonner"
import type { Department, DepartmentPermission, User } from "@/types/database.types"

interface PageProps {
  params: Promise<{ id: string }>
}

interface DepartmentMember extends DepartmentPermission {
  user: User
}

export default function DepartmentDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()
  const [addMemberOpen, setAddMemberOpen] = useState(false)

  const { data: department, isLoading: loadingDept } = useQuery({
    queryKey: ["department", id],
    queryFn: async () => {
      const res = await fetch(`/api/departments/${id}`)
      if (!res.ok) throw new Error("Failed to fetch department")
      const json = await res.json()
      return json.data as Department
    },
  })

  const {
    data: members,
    isLoading: loadingMembers,
    refetch: refetchMembers,
  } = useQuery({
    queryKey: ["department-members", id],
    queryFn: async () => {
      const res = await fetch(`/api/departments/${id}/members`)
      if (!res.ok) throw new Error("Failed to fetch members")
      const json = await res.json()
      return json.data as DepartmentMember[]
    },
  })

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/departments/${id}/members/${userId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || "Failed to remove member")
      }
    },
    onSuccess: () => {
      toast.success("Member removed from department")
      refetchMembers()
      queryClient.invalidateQueries({ queryKey: ["department", id] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "owner":
        return <Badge className="bg-purple-100 text-purple-800">Owner</Badge>
      case "admin":
        return <Badge className="bg-blue-100 text-blue-800">Admin</Badge>
      case "member":
        return <Badge className="bg-green-100 text-green-800">Member</Badge>
      case "viewer":
        return <Badge variant="outline">Viewer</Badge>
      default:
        return <Badge variant="outline">{role}</Badge>
    }
  }

  if (loadingDept) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!department) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Department not found</p>
        <Button asChild className="mt-4">
          <Link href="/departments">Back to Departments</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/departments">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-linear-to-br from-indigo-500/20 to-purple-500/20 rounded-xl">
              <Building2 className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{department.name}</h1>
              <p className="text-muted-foreground">/{department.slug}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Bot className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{department.total_agents}</p>
                <p className="text-sm text-muted-foreground">Agents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{department.total_users}</p>
                <p className="text-sm text-muted-foreground">Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Building2 className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {department.current_month_minutes?.toFixed(0) || 0}
                </p>
                <p className="text-sm text-muted-foreground">Minutes Used</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Shield className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  ${department.current_month_cost?.toFixed(2) || "0.00"}
                </p>
                <p className="text-sm text-muted-foreground">Monthly Cost</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="members" className="space-y-4">
        <TabsList>
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Department Members</CardTitle>
                <CardDescription>Users who have access to this department</CardDescription>
              </div>
              <Button onClick={() => setAddMemberOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Member
              </Button>
            </CardHeader>
            <CardContent>
              {loadingMembers ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : members && members.length > 0 ? (
                <div className="space-y-3">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={member.user.avatar_url || undefined} />
                          <AvatarFallback>
                            {member.user.first_name?.[0]}
                            {member.user.last_name?.[0] || member.user.email[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {member.user.first_name && member.user.last_name
                              ? `${member.user.first_name} ${member.user.last_name}`
                              : member.user.email}
                          </p>
                          <p className="text-sm text-muted-foreground">{member.user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getRoleBadge(member.role)}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem disabled>
                              <Shield className="mr-2 h-4 w-4" />
                              Change Role
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => removeMember.mutate(member.user_id)}
                              className="text-red-600"
                              disabled={member.role === "owner"}
                            >
                              <UserMinus className="mr-2 h-4 w-4" />
                              Remove from Department
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No members in this department yet</p>
                  <Button className="mt-4" onClick={() => setAddMemberOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Member
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <DepartmentForm departmentId={id} embedded />
        </TabsContent>
      </Tabs>

      <AddDepartmentMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        departmentId={id}
        departmentName={department.name}
        onSuccess={() => {
          refetchMembers()
          queryClient.invalidateQueries({ queryKey: ["department", id] })
        }}
      />
    </div>
  )
}
