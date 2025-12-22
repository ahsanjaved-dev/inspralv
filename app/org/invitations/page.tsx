"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  usePartnerInvitations,
  useInvitePartnerMember,
  useCancelPartnerInvitation,
  useResendPartnerInvitation,
} from "@/lib/hooks/use-partner-team"
import { useAuthContext } from "@/lib/hooks/use-auth"
import {
  Mail,
  Loader2,
  RefreshCw,
  X,
  Clock,
  Send,
  Crown,
  Shield,
  UserCheck,
  UserPlus,
  Copy,
  Check,
} from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

const roleColors: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  member: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
}

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

export default function OrgInvitationsPage() {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"owner" | "admin" | "member">("member")
  const [message, setMessage] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: authContext } = useAuthContext()
  const { data: invitations, isLoading, refetch } = usePartnerInvitations()
  const inviteMember = useInvitePartnerMember()
  const cancelInvitation = useCancelPartnerInvitation()
  const resendInvitation = useResendPartnerInvitation()

  const currentUserRole = authContext?.partnerMembership?.role || "member"
  const isOwner = currentUserRole === "owner"

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email) {
      toast.error("Please enter an email address")
      return
    }

    try {
      const result = await inviteMember.mutateAsync({ email, role, message })
      toast.success(`Invitation sent to ${email}`)
      setEmail("")
      setMessage("")
      setRole("member")
      
      // Show invite link in development
      if (result.data?.invite_link) {
        console.log("Invite link:", result.data.invite_link)
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send invitation")
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancelInvitation.mutateAsync(id)
      toast.success("Invitation cancelled")
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel invitation")
    }
  }

  const handleResend = async (id: string) => {
    try {
      await resendInvitation.mutateAsync(id)
      toast.success("Invitation resent")
    } catch (error: any) {
      toast.error(error.message || "Failed to resend invitation")
    }
  }

  const copyInviteLink = (id: string) => {
    // In a real app, we'd fetch the actual link
    const link = `${window.location.origin}/accept-partner-invitation?token=...`
    navigator.clipboard.writeText(link)
    setCopiedId(id)
    toast.success("Invite link copied!")
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Invite Team Members</h1>
          <p className="text-muted-foreground mt-1">
            Send invitations to add new members to your organization
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Invite Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Send Invitation
          </CardTitle>
          <CardDescription>
            Invite someone to join your organization. They'll receive an email with instructions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={role} onValueChange={(v: "owner" | "admin" | "member") => setRole(v)}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isOwner && (
                      <SelectItem value="owner">
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-purple-600" />
                          Owner
                        </div>
                      </SelectItem>
                    )}
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-600" />
                        Admin
                      </div>
                    </SelectItem>
                    <SelectItem value="member">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-green-600" />
                        Member
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Personal Message (optional)</Label>
              <Textarea
                id="message"
                placeholder="Add a personal note to your invitation..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
              />
            </div>
            <Button type="submit" disabled={inviteMember.isPending}>
              {inviteMember.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Invitation
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Pending Invitations
          </CardTitle>
          <CardDescription>
            Invitations that haven't been accepted yet
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invitations && invitations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invited By</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => {
                  const isExpiringSoon = new Date(invitation.expires_at).getTime() - Date.now() < 24 * 60 * 60 * 1000
                  const inviterName = invitation.inviter?.first_name
                    ? `${invitation.inviter.first_name} ${invitation.inviter.last_name || ""}`.trim()
                    : invitation.inviter?.email || "Unknown"

                  return (
                    <TableRow key={invitation.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="font-medium">{invitation.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={roleColors[invitation.role]}>
                          {roleLabels[invitation.role] || invitation.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {inviterName}
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-1 ${isExpiringSoon ? "text-amber-600" : "text-muted-foreground"}`}>
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(invitation.expires_at), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => copyInviteLink(invitation.id)}
                            title="Copy invite link"
                          >
                            {copiedId === invitation.id ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleResend(invitation.id)}
                            disabled={resendInvitation.isPending}
                            title="Resend invitation"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleCancel(invitation.id)}
                            disabled={cancelInvitation.isPending}
                            title="Cancel invitation"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No pending invitations</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

