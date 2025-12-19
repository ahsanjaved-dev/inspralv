"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Building2, CheckCircle2, ArrowRight } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export default function WorkspaceOnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [partnerId, setPartnerId] = useState<string | null>(null)

  // Form state
  const [workspaceName, setWorkspaceName] = useState("")
  const [workspaceDescription, setWorkspaceDescription] = useState("")

  useEffect(() => {
    checkAuthAndPartner()
  }, [])

  const checkAuthAndPartner = async () => {
    try {
      const supabase = createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)

      // Get partner from API
      const res = await fetch("/api/partner")
      if (res.ok) {
        const data = await res.json()
        setPartnerId(data.data?.id)
      }
    } catch (error) {
      console.error("Auth check error:", error)
      router.push("/login")
    } finally {
      setLoading(false)
    }
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-")
  }

  const handleSubmit = async () => {
    if (!workspaceName.trim()) {
      toast.error("Please enter a workspace name")
      return
    }

    if (!partnerId || !userId) {
      toast.error("Authentication error. Please refresh and try again.")
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()
      const slug = generateSlug(workspaceName)

      // Create workspace
      const { data: workspace, error: wsError } = await supabase
        .from("workspaces")
        .insert({
          partner_id: partnerId,
          name: workspaceName,
          slug,
          description: workspaceDescription || null,
          status: "active",
          resource_limits: {},
          settings: {},
        })
        .select()
        .single()

      if (wsError) throw wsError

      // Add user as workspace owner
      const { error: memberError } = await supabase.from("workspace_members").insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: "owner",
        joined_at: new Date().toISOString(),
      })

      if (memberError) throw memberError

      toast.success("Workspace created successfully!")
      router.push(`/w/${slug}/dashboard`)
    } catch (error: any) {
      console.error("Create workspace error:", error)
      toast.error(error.message || "Failed to create workspace")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
                <Building2 className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <CardTitle>Create Your Workspace</CardTitle>
                <CardDescription>Set up your first workspace to get started</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Workspace Name</Label>
              <Input
                id="name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="My Workspace"
                disabled={submitting}
              />
              {workspaceName && (
                <p className="text-xs text-muted-foreground">
                  URL: /w/{generateSlug(workspaceName)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={workspaceDescription}
                onChange={(e) => setWorkspaceDescription(e.target.value)}
                placeholder="What is this workspace for?"
                disabled={submitting}
                rows={3}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={submitting || !workspaceName.trim()}
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Create Workspace
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
