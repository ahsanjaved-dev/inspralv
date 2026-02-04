"use client"

/**
 * @deprecated This component is deprecated and should not be used.
 * 
 * Workspaces are now created automatically based on subscription plans:
 * - Free/Pro plans: One workspace created on subscription activation
 * - Agency plans: Default workspace + client workspaces based on plan limits
 * 
 * The API endpoint POST /api/workspaces now rejects direct workspace creation.
 * This component is kept for backwards compatibility but will show an error if used.
 * 
 * @see /api/webhooks/stripe for subscription-based workspace creation
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Building2, Sparkles } from "lucide-react"
import { toast } from "sonner"

interface Props {
  primaryColor?: string
}

/**
 * @deprecated Use subscription-based workspace creation instead.
 */
export function CreateWorkspaceForm({ primaryColor = "#7c3aed" }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [workspaceName, setWorkspaceName] = useState("")
  const [workspaceDescription, setWorkspaceDescription] = useState("")

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!workspaceName.trim()) {
      toast.error("Please enter a workspace name")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workspaceName,
          slug: generateSlug(workspaceName),
          description: workspaceDescription || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to create workspace")
      }

      toast.success(data.data?.message || "Workspace created successfully!")
      router.push(data.data?.redirect || "/select-workspace")
      router.refresh()
    } catch (error: any) {
      console.error("Create workspace error:", error)
      toast.error(error.message || "Failed to create workspace")
    } finally {
      setSubmitting(false)
    }
  }

  const slug = generateSlug(workspaceName)

  return (
    <div className="bg-card rounded-3xl border border-border/50 shadow-2xl shadow-black/5 overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-0">
        <div className="flex items-center gap-4">
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg"
            style={{ backgroundColor: primaryColor }}
          >
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Create New Workspace</h1>
            <p className="text-sm text-muted-foreground">Set up a workspace for your team</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">
            Workspace Name
          </Label>
          <Input
            id="name"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="My Awesome Workspace"
            disabled={submitting}
            className="h-11"
            autoFocus
          />
          {workspaceName && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="text-muted-foreground/70">URL:</span>
              <code className="px-1.5 py-0.5 bg-muted rounded text-foreground">/w/{slug || "..."}</code>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="text-sm font-medium">
            Description
            <span className="text-muted-foreground font-normal ml-1">(optional)</span>
          </Label>
          <Textarea
            id="description"
            value={workspaceDescription}
            onChange={(e) => setWorkspaceDescription(e.target.value)}
            placeholder="What is this workspace for?"
            disabled={submitting}
            rows={3}
            className="resize-none"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-11 text-base shadow-lg"
          style={{ backgroundColor: primaryColor }}
          disabled={submitting || !workspaceName.trim()}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Create Workspace
            </>
          )}
        </Button>
      </form>
    </div>
  )
}

