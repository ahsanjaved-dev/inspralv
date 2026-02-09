"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"
import { 
  Settings, 
  Loader2, 
  Save, 
  Trash2, 
  AlertTriangle, 
  Globe, 
  Lock,
  CheckCircle,
  Eye,
  EyeOff,
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import {
  useWorkspaceSettings,
  useUpdateWorkspaceSettings,
  useDeleteWorkspace,
} from "@/lib/hooks/use-workspace-settings"
import { PasswordStrengthIndicator } from "@/components/auth/password-strength"
import { validatePassword } from "@/lib/auth/password"
import { CustomVariablesSection } from "@/components/workspace/settings/custom-variables-section"

// Common timezones - Australia/Melbourne is the default
const timezones = [
  { value: "Australia/Melbourne", label: "Melbourne (AEST) - Default" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
  { value: "Australia/Brisbane", label: "Brisbane (AEST)" },
  { value: "Australia/Perth", label: "Perth (AWST)" },
  { value: "Australia/Adelaide", label: "Adelaide (ACST)" },
  { value: "Pacific/Auckland", label: "Auckland (NZST)" },
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "America/Toronto", label: "Eastern Time (Canada)" },
  { value: "America/Vancouver", label: "Pacific Time (Canada)" },
  { value: "America/Sao_Paulo", label: "Brasilia Time" },
  { value: "America/Mexico_City", label: "Mexico City" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (CET/CEST)" },
  { value: "Europe/Madrid", label: "Madrid (CET/CEST)" },
  { value: "Europe/Rome", label: "Rome (CET/CEST)" },
  { value: "Europe/Stockholm", label: "Stockholm (CET/CEST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (HKT)" },
  { value: "Asia/Seoul", label: "Seoul (KST)" },
]

export default function WorkspaceSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  const { data: workspace, isLoading, error } = useWorkspaceSettings()
  const updateSettings = useUpdateWorkspaceSettings()
  const deleteWorkspace = useDeleteWorkspace()

  // General settings state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [timezone, setTimezone] = useState("Australia/Melbourne")
  const [hasChanges, setHasChanges] = useState(false)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Initialize form when data loads
  useEffect(() => {
    if (workspace) {
      setName(workspace.name || "")
      setDescription(workspace.description || "")
      const workspaceSettings = workspace.settings as Record<string, unknown> | null
      setTimezone((workspaceSettings?.timezone as string) || "Australia/Melbourne")
    }
  }, [workspace])

  // Track changes
  useEffect(() => {
    if (workspace) {
      const workspaceSettings = workspace.settings as Record<string, unknown> | null
      const currentTimezone = (workspaceSettings?.timezone as string) || "Australia/Melbourne"
      
      const nameChanged = name !== (workspace.name || "")
      const descChanged = description !== (workspace.description || "")
      const timezoneChanged = timezone !== currentTimezone
      setHasChanges(nameChanged || descChanged || timezoneChanged)
    }
  }, [name, description, timezone, workspace])

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        timezone,
      })
      toast.success("Settings saved successfully")
      setHasChanges(false)
    } catch (error: any) {
      toast.error(error.message || "Failed to save settings")
    }
  }

  const handleDelete = async () => {
    try {
      await deleteWorkspace.mutateAsync()
      toast.success("Workspace deleted")
      router.push("/select-workspace")
    } catch (error: any) {
      toast.error(error.message || "Failed to delete workspace")
    }
  }

  // Password validation
  const passwordValidation = validatePassword(newPassword, { 
    email: "", 
    firstName: "", 
    lastName: "" 
  })

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error("Please enter your current password")
      return
    }

    if (!newPassword) {
      toast.error("Please enter a new password")
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match")
      return
    }

    if (!passwordValidation.valid) {
      toast.error(passwordValidation.errors[0]?.message || "Password does not meet requirements")
      return
    }

    setIsChangingPassword(true)
    
    try {
      const supabase = createClient()
      
      // First verify the current password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user?.email) {
        throw new Error("Unable to verify user")
      }

      // Re-authenticate with current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })

      if (signInError) {
        throw new Error("Current password is incorrect")
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        throw updateError
      }

      toast.success("Password changed successfully")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error: any) {
      toast.error(error.message || "Failed to change password")
    } finally {
      setIsChangingPassword(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500">Failed to load settings</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your workspace settings and preferences
        </p>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            General Settings
          </CardTitle>
          <CardDescription>Basic workspace information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Workspace Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Workspace"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this workspace for?"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Preferences
          </CardTitle>
          <CardDescription>Configure workspace preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="timezone">Default Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {timezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This timezone will be used for scheduling campaigns and displaying dates
            </p>
          </div>

          <Separator className="my-4" />

          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateSettings.isPending}
            className="w-full sm:w-auto"
          >
            {updateSettings.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Custom Variables Section */}
      <CustomVariablesSection />

      {/* Account Security - Password Change */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Account Security
          </CardTitle>
          <CardDescription>Change your account password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter a new password"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            {newPassword && (
              <PasswordStrengthIndicator
                password={newPassword}
                showRequirements={true}
                className="mt-3"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your new password"
              className={confirmPassword && confirmPassword !== newPassword ? "border-destructive" : ""}
            />
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="text-sm text-destructive">Passwords do not match</p>
            )}
            {confirmPassword && confirmPassword === newPassword && newPassword && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                Passwords match
              </p>
            )}
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
            variant="secondary"
            className="w-full sm:w-auto"
          >
            {isChangingPassword ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Lock className="mr-2 h-4 w-4" />
            )}
            Change Password
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible and destructive actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border border-red-200 dark:border-red-900 rounded-lg">
            <div>
              <p className="font-medium">Delete this workspace</p>
              <p className="text-sm text-muted-foreground">
                Once deleted, this workspace and all its data will be permanently removed.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Workspace?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the workspace
                    <strong> "{workspace?.name}"</strong> and remove all associated data including
                    agents, conversations, and members.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                    {deleteWorkspace.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete Workspace
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
