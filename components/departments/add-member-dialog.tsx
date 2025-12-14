"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2, Users, Check } from "lucide-react"
import { toast } from "sonner"
import type { User } from "@/types/database.types"

interface AddDepartmentMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  departmentId: string
  departmentName: string
  onSuccess?: () => void
}

export function AddDepartmentMemberDialog({
  open,
  onOpenChange,
  departmentId,
  departmentName,
  onSuccess,
}: AddDepartmentMemberDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member")
  const [loading, setLoading] = useState(false)

  // Fetch organization users who are NOT in this department
  const { data: availableUsers, isLoading } = useQuery({
    queryKey: ["available-department-users", departmentId],
    queryFn: async () => {
      const res = await fetch(`/api/departments/${departmentId}/available-users`)
      if (!res.ok) throw new Error("Failed to fetch users")
      const json = await res.json()
      return json.data as User[]
    },
    enabled: open,
  })

  const handleSubmit = async () => {
    if (!selectedUserId) {
      toast.error("Please select a user")
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/departments/${departmentId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedUserId, role }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || "Failed to add member")
      }

      toast.success("Member added to department")
      onSuccess?.()
      handleClose()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setSelectedUserId("")
    setRole("member")
    onOpenChange(false)
  }

  const selectedUser = availableUsers?.find((u) => u.id === selectedUserId)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Member to {departmentName}</DialogTitle>
          <DialogDescription>
            Select an organization user to add to this department.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : availableUsers && availableUsers.length > 0 ? (
            <>
              <div className="space-y-2">
                <Label>Select User</Label>
                <div className="grid gap-2 max-h-[200px] overflow-y-auto">
                  {availableUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedUserId(user.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                        selectedUserId === user.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted"
                      }`}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>
                          {user.first_name?.[0]}
                          {user.last_name?.[0] || user.email[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {user.first_name && user.last_name
                            ? `${user.first_name} ${user.last_name}`
                            : user.email}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                      </div>
                      {selectedUserId === user.id && <Check className="h-5 w-5 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Department Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin - Full department access</SelectItem>
                    <SelectItem value="member">Member - Can use agents & view data</SelectItem>
                    <SelectItem value="viewer">Viewer - Read-only access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>All organization users are already in this department</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !selectedUserId || !availableUsers?.length}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Add Member"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
