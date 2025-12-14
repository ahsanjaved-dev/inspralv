"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Building2, Palette, Users, CheckCircle2, ArrowRight, Upload } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface OnboardingData {
  organization: any
  user: any
}

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<OnboardingData | null>(null)
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  // Step 1: Branding
  const [companyName, setCompanyName] = useState("")
  const [primaryColor, setPrimaryColor] = useState("#7c3aed")

  // Step 2: First Department
  const [departmentName, setDepartmentName] = useState("")
  const [departmentDescription, setDepartmentDescription] = useState("")

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      const supabase = createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      // Get user with organization
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select(
          `
          *,
          organization:organizations(*)
        `
        )
        .eq("id", user.id)
        .single()

      if (userError || !userData) {
        console.error("Failed to load user:", userError)
        router.push("/login")
        return
      }

      setData({
        user: userData,
        organization: userData.organization,
      })

      // Pre-fill company name
      setCompanyName(userData.organization?.name || "")

      // Check if onboarding is already complete
      if (userData.organization?.onboarding_completed) {
        router.push("/dashboard")
      }
    } catch (error) {
      console.error("Load error:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleStep1Submit = async () => {
    if (!companyName.trim()) {
      toast.error("Please enter your company name")
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from("organizations")
        .update({
          branding: {
            company_name: companyName,
            primary_color: primaryColor,
          },
          onboarding_step: 2,
        })
        .eq("id", data?.organization.id)

      if (error) throw error

      setStep(2)
      toast.success("Branding saved!")
    } catch (error: any) {
      toast.error(error.message || "Failed to save")
    } finally {
      setSubmitting(false)
    }
  }

  const handleStep2Submit = async () => {
    if (!departmentName.trim()) {
      toast.error("Please enter a department name")
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()

      // Create the department
      const slug = departmentName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-+/g, "-")

      const { data: department, error: deptError } = await supabase
        .from("departments")
        .insert({
          organization_id: data?.organization.id,
          name: departmentName,
          slug,
          description: departmentDescription || null,
          created_by: data?.user.id,
        })
        .select()
        .single()

      if (deptError) throw deptError

      // Add user as department owner
      await supabase.from("department_permissions").insert({
        user_id: data?.user.id,
        department_id: department.id,
        role: "owner",
        granted_by: data?.user.id,
      })

      setStep(3)
      toast.success("Department created!")
    } catch (error: any) {
      toast.error(error.message || "Failed to create department")
    } finally {
      setSubmitting(false)
    }
  }

  const handleComplete = async () => {
    setSubmitting(true)
    try {
      const supabase = createClient()

      await supabase
        .from("organizations")
        .update({
          status: "active",
          onboarding_completed: true,
          onboarding_step: 3,
        })
        .eq("id", data?.organization.id)

      toast.success("Setup complete! Welcome to Inspralv!")
      router.push("/dashboard")
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || "Failed to complete setup")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold">Set Up Your Organization</h1>
            <span className="text-sm text-muted-foreground">Step {step} of 3</span>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  s <= step ? "bg-violet-600" : "bg-slate-200 dark:bg-slate-700"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step 1: Branding */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
                  <Palette className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <CardTitle>Customize Your Branding</CardTitle>
                  <CardDescription>Make Inspralv feel like your own</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corporation"
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="primaryColor">Primary Color</Label>
                <div className="flex gap-3">
                  <input
                    type="color"
                    id="primaryColor"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-10 w-20 rounded border cursor-pointer"
                    disabled={submitting}
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1"
                    disabled={submitting}
                  />
                </div>
              </div>

              <Button className="w-full" onClick={handleStep1Submit} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: First Department */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <CardTitle>Create Your First Department</CardTitle>
                  <CardDescription>Organize your team into departments</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="deptName">Department Name</Label>
                <Input
                  id="deptName"
                  value={departmentName}
                  onChange={(e) => setDepartmentName(e.target.value)}
                  placeholder="e.g., Sales, Support, Marketing"
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deptDesc">Description (Optional)</Label>
                <Input
                  id="deptDesc"
                  value={departmentDescription}
                  onChange={(e) => setDepartmentDescription(e.target.value)}
                  placeholder="What does this department do?"
                  disabled={submitting}
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} disabled={submitting}>
                  Back
                </Button>
                <Button className="flex-1" onClick={handleStep2Submit} disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  Create Department
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Complete */}
        {step === 3 && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl">You're All Set!</CardTitle>
              <CardDescription className="text-base">
                Your organization is ready. Start creating AI agents to automate your calls.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span>
                    Organization: <strong>{companyName}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span>
                    First Department: <strong>{departmentName}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span>You're the organization owner</span>
                </div>
              </div>

              <Button
                className="w-full bg-violet-600 hover:bg-violet-700"
                size="lg"
                onClick={handleComplete}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
