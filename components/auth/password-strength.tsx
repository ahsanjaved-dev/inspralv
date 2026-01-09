"use client"

/**
 * Password Strength Indicator Component
 * Visual feedback for password security - Theme compatible
 */

import { useMemo } from "react"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  calculatePasswordStrength,
  getPasswordRequirements,
  PASSWORD_STRENGTH_INFO,
  type PasswordStrength,
} from "@/lib/auth/password"

interface PasswordStrengthIndicatorProps {
  password: string
  className?: string
  showRequirements?: boolean
}

export function PasswordStrengthIndicator({
  password,
  className,
  showRequirements = true,
}: PasswordStrengthIndicatorProps) {
  const strength = useMemo(() => calculatePasswordStrength(password), [password])
  const requirements = useMemo(() => getPasswordRequirements(password), [password])
  const strengthInfo = PASSWORD_STRENGTH_INFO[strength]

  if (!password) {
    return null
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Strength Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Password strength</span>
          <span className="font-medium" style={{ color: strengthInfo.color }}>
            {strengthInfo.label}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${strengthInfo.percentage}%`,
              backgroundColor: strengthInfo.color,
            }}
          />
        </div>
      </div>

      {/* Requirements Checklist */}
      {showRequirements && (
        <ul className="space-y-1.5 text-sm">
          {requirements.map((req) => (
            <li
              key={req.id}
              className={cn(
                "flex items-center gap-2 transition-colors",
                req.met ? "text-green-600 dark:text-green-500" : "text-muted-foreground"
              )}
            >
              {req.met ? (
                <Check className="h-4 w-4 text-green-600 dark:text-green-500" />
              ) : (
                <X className="h-4 w-4 text-muted-foreground" />
              )}
              {req.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ============================================================================
// COMPACT VERSION
// ============================================================================

interface PasswordStrengthBarProps {
  strength: PasswordStrength
  className?: string
}

export function PasswordStrengthBar({ strength, className }: PasswordStrengthBarProps) {
  const strengthInfo = PASSWORD_STRENGTH_INFO[strength]

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${strengthInfo.percentage}%`,
            backgroundColor: strengthInfo.color,
          }}
        />
      </div>
      <span
        className="text-xs font-medium min-w-[60px] text-right"
        style={{ color: strengthInfo.color }}
      >
        {strengthInfo.label}
      </span>
    </div>
  )
}
