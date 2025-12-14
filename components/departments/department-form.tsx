"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Building2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import {
  useCreateDepartment,
  useUpdateDepartment,
  useDepartment,
} from "@/lib/hooks/use-departments"
import type { Department } from "@/types/database.types"

interface DepartmentFormProps {
  departmentId?: string
  embedded?: boolean
}

export function DepartmentForm({ departmentId, embedded = false }: DepartmentFormProps) {
  const router = useRouter()
  const isEditing = !!departmentId

  const { data: existingDepartment, isLoading: isLoadingDepartment } = useDepartment(
    departmentId || null
  )
  const createMutation = useCreateDepartment()
  const updateMutation = useUpdateDepartment()

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    slug: "",
    max_agents: 5,
    max_users: 10,
    max_minutes_per_month: 1000,
  })

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (existingDepartment) {
      const limits = existingDepartment.resource_limits as any
      setFormData({
        name: existingDepartment.name,
        description: existingDepartment.description || "",
        slug: existingDepartment.slug,
        max_agents: limits?.max_agents || 5,
        max_users: limits?.max_users || 10,
        max_minutes_per_month: limits?.max_minutes_per_month || 1000,
      })
    }
  }, [existingDepartment])

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim()
  }

  const handleNameChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      name: value,
      slug: !isEditing || prev.slug === generateSlug(prev.name) ? generateSlug(value) : prev.slug,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const payload = {
      name: formData.name,
      description: formData.description || undefined,
      slug: formData.slug,
      resource_limits: {
        max_agents: formData.max_agents,
        max_users: formData.max_users,
        max_minutes_per_month: formData.max_minutes_per_month,
      },
    }

    try {
      if (isEditing && departmentId) {
        await updateMutation.mutateAsync({ id: departmentId, data: payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      router.push("/departments")
    } catch (err: any) {
      setError(err.message || "Something went wrong")
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  if (isEditing && isLoadingDepartment) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={embedded ? "space-y-6" : "space-y-6 max-w-2xl mx-auto"}
    >
      {!embedded && (
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/departments">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {isEditing ? "Edit Department" : "Create Department"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isEditing
                ? "Update department settings"
                : "Set up a new department for your organization"}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Department Details
          </CardTitle>
          <CardDescription>Basic information about the department</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Department Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Sales, Support, Marketing"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug *</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">/</span>
              <Input
                id="slug"
                placeholder="sales-team"
                value={formData.slug}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))
                }
                pattern="^[a-z0-9-]+$"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              URL-friendly identifier (lowercase letters, numbers, and hyphens only)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Brief description of this department"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resource Limits</CardTitle>
          <CardDescription>Set usage limits for this department</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_agents">Max Agents</Label>
              <Input
                id="max_agents"
                type="number"
                min={1}
                max={100}
                value={formData.max_agents}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, max_agents: parseInt(e.target.value) || 1 }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_users">Max Users</Label>
              <Input
                id="max_users"
                type="number"
                min={1}
                max={100}
                value={formData.max_users}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, max_users: parseInt(e.target.value) || 1 }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_minutes">Max Minutes/Month</Label>
              <Input
                id="max_minutes"
                type="number"
                min={0}
                value={formData.max_minutes_per_month}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    max_minutes_per_month: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        {!embedded && (
          <Button type="button" variant="outline" asChild>
            <Link href="/departments">Cancel</Link>
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Save Changes" : "Create Department"}
        </Button>
      </div>
    </form>
  )
}
