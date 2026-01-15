"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Loader2, CheckCircle2, ArrowRight, ArrowLeft, AlertCircle, Upload, X, Globe, Package, Building2 } from "lucide-react"
import { HexColorPicker } from "react-colorful"
import { toast } from "sonner"
import { createPartnerRequestSchema } from "@/types/database.types"
import { z } from "zod"

// Plan type from public API
interface PublicPlan {
  id: string
  slug: string
  name: string
  description: string | null
  monthlyPriceCents: number
  monthlyPrice: number
  maxWorkspaces: number
}

interface PartnerRequestFormProps {
  primaryColor?: string
  platformDomain?: string
}

export function PartnerRequestForm({
  primaryColor = "#7c3aed",
  platformDomain = "genius365.app",
}: PartnerRequestFormProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [checkingSubdomain, setCheckingSubdomain] = useState(false)
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null)
  const [subdomainMessage, setSubdomainMessage] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)

  // Plans state
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)

  // Form data
  const [formData, setFormData] = useState({
    // Step 1: Company & Contact
    company_name: "",
    contact_name: "",
    contact_email: "",
    phone: "",

    // Step 2: Business Details & Plan Selection
    business_description: "",
    expected_users: "",
    use_case: "",
    selected_white_label_variant_id: "", // New: selected plan ID

    // Step 3: Branding (simplified - no custom domain)
    desired_subdomain: "", // Auto-generated from company name
    logo_url: "",
    primary_color: primaryColor,
    secondary_color: "#64748b",
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Fetch available plans on mount
  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch("/api/public/white-label-plans")
        if (res.ok) {
          const data = await res.json()
          const fetchedPlans = data.data?.plans || []
          setPlans(fetchedPlans)
          // Auto-select first plan if available
          if (fetchedPlans.length > 0 && !formData.selected_white_label_variant_id) {
            setFormData((prev) => ({
              ...prev,
              selected_white_label_variant_id: fetchedPlans[0].id,
            }))
          }
        }
      } catch (error) {
        console.error("Failed to fetch plans:", error)
      } finally {
        setLoadingPlans(false)
      }
    }
    fetchPlans()
  }, [])

  // Auto-generate slug from company name
  const generateSlug = (companyName: string) => {
    return companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-")
      .substring(0, 50)
  }

  // Auto-generate subdomain when company name changes
  useEffect(() => {
    if (formData.company_name && !formData.desired_subdomain) {
      const slug = generateSlug(formData.company_name)
      if (slug.length >= 3) {
        setFormData((prev) => ({ ...prev, desired_subdomain: slug }))
      }
    }
  }, [formData.company_name])

  // Debounced subdomain check
  const checkSubdomainAvailability = async (subdomain: string) => {
    if (subdomain.length < 3) {
      setSubdomainAvailable(null)
      setSubdomainMessage(null)
      return
    }

    setCheckingSubdomain(true)
    try {
      const res = await fetch(
        `/api/partner-requests/check-subdomain?subdomain=${encodeURIComponent(subdomain)}`
      )
      const data = await res.json()
      setSubdomainAvailable(data.available)
      setSubdomainMessage(data.message || null)

      if (!data.available && data.message) {
        setErrors({ ...errors, desired_subdomain: data.message })
      } else {
        const newErrors = { ...errors }
        delete newErrors.desired_subdomain
        setErrors(newErrors)
      }
    } catch (error) {
      console.error("Subdomain check error:", error)
      setSubdomainAvailable(null)
    } finally {
      setCheckingSubdomain(false)
    }
  }

  // Check subdomain when it changes (with debounce via useEffect)
  useEffect(() => {
    if (formData.desired_subdomain.length >= 3) {
      const timer = setTimeout(() => {
        checkSubdomainAvailability(formData.desired_subdomain)
      }, 500)
      return () => clearTimeout(timer)
    } else {
      setSubdomainAvailable(null)
      setSubdomainMessage(null)
      return
    }
  }, [formData.desired_subdomain])

  const handleSubdomainChange = (value: string) => {
    // Only allow valid subdomain characters
    const sanitized = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+/, "") // No leading hyphens
      .replace(/-+/g, "-") // No consecutive hyphens
      .substring(0, 50)
    setFormData({ ...formData, desired_subdomain: sanitized })
  }

  // Logo upload handler
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Only PNG, JPG, SVG, and WebP are allowed")
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size too large. Maximum size is 5MB")
      return
    }

    setUploadingLogo(true)
    try {
      const formDataUpload = new FormData()
      formDataUpload.append("file", file)

      const res = await fetch("/api/upload/logo", {
        method: "POST",
        body: formDataUpload,
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || "Failed to upload logo")
      }

      // apiResponse wraps data in { data: ... }
      const uploadData = result.data || result
      setFormData({ ...formData, logo_url: uploadData.url })
      setUploadedFileName(uploadData.filename)
      toast.success("Logo uploaded successfully!")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload logo")
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleRemoveLogo = async () => {
    if (!uploadedFileName) {
      setFormData({ ...formData, logo_url: "" })
      return
    }

    try {
      await fetch(`/api/upload/logo?filename=${uploadedFileName}`, {
        method: "DELETE",
      })

      setFormData({ ...formData, logo_url: "" })
      setUploadedFileName(null)
      toast.success("Logo removed")
    } catch (error) {
      console.error("Failed to remove logo:", error)
      // Still remove from form even if delete fails
      setFormData({ ...formData, logo_url: "" })
      setUploadedFileName(null)
    }
  }

  const validateStep = (stepNumber: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (stepNumber === 1) {
      if (!formData.company_name) newErrors.company_name = "Company name is required"
      if (!formData.contact_name) newErrors.contact_name = "Contact name is required"
      if (!formData.contact_email) newErrors.contact_email = "Email is required"
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact_email)) {
        newErrors.contact_email = "Invalid email format"
      }
    }

    if (stepNumber === 2) {
      if (!formData.business_description || formData.business_description.length < 10) {
        newErrors.business_description = "Please provide at least 10 characters"
      }
      if (!formData.use_case || formData.use_case.length < 10) {
        newErrors.use_case = "Please describe your use case (min 10 characters)"
      }
      if (plans.length > 0 && !formData.selected_white_label_variant_id) {
        newErrors.selected_white_label_variant_id = "Please select a plan"
      }
    }

    if (stepNumber === 3) {
      // Validate subdomain
      if (!formData.desired_subdomain || formData.desired_subdomain.length < 3) {
        newErrors.desired_subdomain = "Subdomain must be at least 3 characters"
      } else if (subdomainAvailable === false) {
        newErrors.desired_subdomain = subdomainMessage || "This subdomain is not available"
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(step + 1)
    }
  }

  const handleBack = () => {
    setStep(step - 1)
  }

  const handleSubmit = async () => {
    if (!validateStep(3)) return

    setLoading(true)
    try {
      // Prepare submission data
      const submissionData = {
        company_name: formData.company_name,
        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        phone: formData.phone || undefined,
        business_description: formData.business_description,
        expected_users: formData.expected_users ? parseInt(formData.expected_users) : undefined,
        use_case: formData.use_case,
        desired_subdomain: formData.desired_subdomain || generateSlug(formData.company_name),
        branding_data: {
          logo_url: formData.logo_url || undefined,
          primary_color: formData.primary_color,
          secondary_color: formData.secondary_color,
          company_name: formData.company_name,
        },
        selected_plan: "partner",
        // Include selected plan variant ID
        selected_white_label_variant_id: formData.selected_white_label_variant_id || undefined,
      }

      // Validate with Zod
      const validated = createPartnerRequestSchema.parse(submissionData)

      // Submit to API
      const res = await fetch("/api/partner-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit request")
      }

      setSuccess(true)
      toast.success("Request submitted successfully!")
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {}
        error.issues.forEach((err: z.ZodIssue) => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message
          }
        })
        setErrors(fieldErrors)
        toast.error("Please check the form for errors")
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to submit request")
      }
    } finally {
      setLoading(false)
    }
  }

  // Get selected plan details for display
  const selectedPlan = plans.find((p) => p.id === formData.selected_white_label_variant_id)

  if (success) {
    const fullUrl = `${formData.desired_subdomain}.${platformDomain}`
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-12 pb-12 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Request Submitted Successfully!</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Thank you for your interest in our white-label solution. Our team will review your
            request and get back to you within 24-48 hours.
          </p>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We've sent a confirmation email to <strong>{formData.contact_email}</strong>
            </p>
            {selectedPlan && (
              <div className="bg-primary/5 rounded-lg p-4 inline-block">
                <p className="text-sm text-muted-foreground mb-1">Selected Plan:</p>
                <Badge variant="outline" className="font-medium text-base px-3 py-1">
                  <Package className="h-4 w-4 mr-2" />
                  {selectedPlan.name} - ${selectedPlan.monthlyPrice}/mo
                </Badge>
              </div>
            )}
            <div className="bg-muted rounded-lg p-4 inline-block">
              <p className="text-sm text-muted-foreground mb-1">After approval, your platform will be at:</p>
              <Badge variant="outline" className="font-mono text-base px-3 py-1">
                <Globe className="h-4 w-4 mr-2" />
                {fullUrl}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Once approved, you'll receive a link to complete payment and activate your account.
            </p>
            <Button onClick={() => router.push("/")} style={{ backgroundColor: primaryColor }}>
              Back to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Request White-Label Partnership</CardTitle>
        <CardDescription>
          Step {step} of 3 -{" "}
          {step === 1 ? "Company & Contact" : step === 2 ? "Business Details & Plan" : "Domain & Branding"}
        </CardDescription>

        {/* Progress Bar */}
        <div className="flex gap-2 mt-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className="h-2 flex-1 rounded-full"
              style={{
                backgroundColor: s <= step ? primaryColor : "#e5e7eb",
              }}
            />
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Step 1: Company & Contact */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name *</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="Acme Corporation"
              />
              {errors.company_name && <p className="text-sm text-red-600">{errors.company_name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_name">Contact Name *</Label>
              <Input
                id="contact_name"
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                placeholder="John Doe"
              />
              {errors.contact_name && <p className="text-sm text-red-600">{errors.contact_name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact_email">Email Address *</Label>
              <Input
                id="contact_email"
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                placeholder="john@acme.com"
              />
              {errors.contact_email && (
                <p className="text-sm text-red-600">{errors.contact_email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number (Optional)</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>
        )}

        {/* Step 2: Business Details & Plan Selection */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="business_description">Business Description *</Label>
              <Textarea
                id="business_description"
                value={formData.business_description}
                onChange={(e) => setFormData({ ...formData, business_description: e.target.value })}
                placeholder="Tell us about your business..."
                rows={4}
              />
              {errors.business_description && (
                <p className="text-sm text-red-600">{errors.business_description}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="expected_users">Expected Number of Users (Optional)</Label>
              <Input
                id="expected_users"
                type="number"
                value={formData.expected_users}
                onChange={(e) => setFormData({ ...formData, expected_users: e.target.value })}
                placeholder="50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="use_case">Use Case *</Label>
              <Textarea
                id="use_case"
                value={formData.use_case}
                onChange={(e) => setFormData({ ...formData, use_case: e.target.value })}
                placeholder="How do you plan to use our platform?"
                rows={4}
              />
              {errors.use_case && <p className="text-sm text-red-600">{errors.use_case}</p>}
            </div>

            {/* Plan Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Select Your Plan *
              </Label>
              <p className="text-sm text-muted-foreground">
                Choose the plan that best fits your needs. You can upgrade later.
              </p>

              {loadingPlans ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : plans.length === 0 ? (
                <div className="bg-muted rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Plans are being configured. Contact us for pricing details.
                  </p>
                </div>
              ) : (
                <RadioGroup
                  value={formData.selected_white_label_variant_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, selected_white_label_variant_id: value })
                  }
                  className="space-y-3"
                >
                  {plans.map((plan) => (
                    <label
                      key={plan.id}
                      className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        formData.selected_white_label_variant_id === plan.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <RadioGroupItem value={plan.id} id={plan.id} className="mt-1" />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{plan.name}</span>
                          <span className="text-lg font-bold">
                            {plan.monthlyPrice === 0 ? (
                              "Free"
                            ) : (
                              <>
                                ${plan.monthlyPrice}
                                <span className="text-sm font-normal text-muted-foreground">/mo</span>
                              </>
                            )}
                          </span>
                        </div>
                        {plan.description && (
                          <p className="text-sm text-muted-foreground">{plan.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground pt-1">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-4 w-4" />
                            {plan.maxWorkspaces === -1 ? "Unlimited" : plan.maxWorkspaces} workspaces
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              )}

              {errors.selected_white_label_variant_id && (
                <p className="text-sm text-red-600">{errors.selected_white_label_variant_id}</p>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Branding (simplified - no custom domain) */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Platform URL Preview */}
            <div className="bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="h-5 w-5 text-primary" />
                <Label className="text-base font-semibold">Your Platform URL</Label>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Input
                  value={formData.desired_subdomain}
                  onChange={(e) => handleSubdomainChange(e.target.value)}
                  placeholder="your-company"
                  className="font-mono max-w-[200px]"
                />
                <span className="text-lg font-mono text-muted-foreground">.{platformDomain}</span>
                {checkingSubdomain && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {subdomainAvailable === true && !checkingSubdomain && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
                {subdomainAvailable === false && !checkingSubdomain && (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                )}
              </div>

              {errors.desired_subdomain && (
                <p className="text-sm text-red-600 mb-2">{errors.desired_subdomain}</p>
              )}
              {subdomainAvailable === true && !checkingSubdomain && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  This subdomain is available!
                </p>
              )}

              <p className="text-xs text-muted-foreground mt-3">
                This will be your platform's address. You can add a custom domain (like
                app.yourcompany.com) from your dashboard after approval.
              </p>
            </div>

            {/* Logo Upload Section */}
            <div className="space-y-2">
              <Label htmlFor="logo_upload">Company Logo (Optional)</Label>

              {formData.logo_url ? (
                // Show uploaded logo preview
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-center bg-muted rounded-lg p-4 min-h-[120px]">
                    <img
                      src={formData.logo_url}
                      alt="Company logo"
                      className="max-h-24 max-w-full object-contain"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveLogo}
                      className="flex-1"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Remove Logo
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {uploadedFileName || "Logo uploaded"}
                  </p>
                </div>
              ) : (
                // Show upload button
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <div className="space-y-2">
                    <div className="flex justify-center">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                      <Label
                        htmlFor="logo_upload"
                        className="cursor-pointer text-primary hover:underline font-medium"
                      >
                        Click to upload logo
                      </Label>
                      <Input
                        id="logo_upload"
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                        onChange={handleLogoUpload}
                        disabled={uploadingLogo}
                        className="hidden"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        PNG, JPG, SVG, or WebP (max 5MB)
                      </p>
                    </div>
                    {uploadingLogo && (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </div>
                    )}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Upload your company logo for branding. You can also update this later.
              </p>
            </div>

            {/* Color Pickers */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Primary Color</Label>
                <HexColorPicker
                  color={formData.primary_color}
                  onChange={(color) => setFormData({ ...formData, primary_color: color })}
                />
                <Input
                  value={formData.primary_color}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                  placeholder="#7c3aed"
                />
              </div>

              <div className="space-y-2">
                <Label>Secondary Color</Label>
                <HexColorPicker
                  color={formData.secondary_color}
                  onChange={(color) => setFormData({ ...formData, secondary_color: color })}
                />
                <Input
                  value={formData.secondary_color}
                  onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                  placeholder="#64748b"
                />
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-6">
          {step > 1 && (
            <Button variant="outline" onClick={handleBack} disabled={loading}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}

          <div className="ml-auto">
            {step < 3 ? (
              <Button onClick={handleNext} style={{ backgroundColor: primaryColor }}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={
                  loading ||
                  subdomainAvailable === false ||
                  checkingSubdomain ||
                  !formData.desired_subdomain ||
                  formData.desired_subdomain.length < 3
                }
                style={{ backgroundColor: primaryColor }}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Request"
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
