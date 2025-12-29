"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Shield, Loader2, Eye, EyeOff } from "lucide-react"

export default function SuperAdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) throw authError

      const { data: superAdmin, error: superAdminError } = await supabase
        .from("super_admin")
        .select("id")
        .eq("id", authData.user.id)
        .single()

      if (superAdminError || !superAdmin) {
        await supabase.auth.signOut()
        throw new Error("Access denied. You are not authorized as a super admin.")
      }

      router.push("/super-admin")
      router.refresh()
    } catch (error: any) {
      setError(error.message || "Failed to login")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="superadmin-theme min-h-screen flex bg-white">
      {/* Left Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-8">
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-6 shadow-lg shadow-primary/25">
              <Shield className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Super Admin</h1>
            <p className="text-muted-foreground">Platform administration access</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Error Message */}
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Email */}
            <div>
              <Label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@genius365.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full px-4 py-3 h-auto border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all bg-background text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Password */}
            <div>
              <Label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 h-auto pr-12 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all bg-background text-foreground placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <Eye className="w-5 h-5" />
                  ) : (
                    <EyeOff className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full py-3 h-auto bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          {/* Footer Note */}
          <p className="text-center mt-8 text-muted-foreground text-sm">
            This area is restricted to platform administrators only.
          </p>
        </div>
      </div>

      {/* Right Side - Gradient Panel (desktop only) */}
      <div className="hidden lg:flex lg:flex-1 items-center justify-center p-16 rounded-l-[3rem] bg-gradient-to-br from-violet-200 via-blue-200 to-purple-200">
        <div className="max-w-lg text-center">
          <h2 className="text-4xl font-bold text-gray-800 mb-6 leading-tight">
            Welcome to <span className="text-primary">Genius365</span> Platform Admin
          </h2>
          <p className="text-xl text-gray-700">
            Manage partners, workspaces, and platform settings from one place.
          </p>
        </div>
      </div>
    </div>
  )
}
