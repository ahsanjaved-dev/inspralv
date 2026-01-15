"use client"

/**
 * Animated Progress Ring Component
 * 
 * A beautiful, animated circular progress indicator with:
 * - Smooth gradient stroke
 * - Animated value counter
 * - Pulsing effect when active
 * - Customizable colors and sizes
 */

import { useEffect, useState, useRef } from "react"
import { cn } from "@/lib/utils"
import { motion, useSpring, useTransform } from "framer-motion"

interface CampaignProgressRingProps {
  /** Progress value (0-100) */
  value: number
  /** Size of the ring in pixels */
  size?: number
  /** Stroke width */
  strokeWidth?: number
  /** Whether the campaign is actively processing */
  isActive?: boolean
  /** Show the percentage in the center */
  showPercentage?: boolean
  /** Show processed/total count */
  showCount?: boolean
  /** Total count for display */
  total?: number
  /** Processed count */
  processed?: number
  /** Color scheme */
  variant?: "default" | "success" | "warning" | "danger"
  /** Custom class name */
  className?: string
}

const VARIANTS = {
  default: {
    gradient: ["#6366f1", "#8b5cf6", "#a855f7"],
    bg: "stroke-slate-200 dark:stroke-slate-700",
  },
  success: {
    gradient: ["#10b981", "#34d399", "#6ee7b7"],
    bg: "stroke-emerald-100 dark:stroke-emerald-900/30",
  },
  warning: {
    gradient: ["#f59e0b", "#fbbf24", "#fcd34d"],
    bg: "stroke-amber-100 dark:stroke-amber-900/30",
  },
  danger: {
    gradient: ["#ef4444", "#f87171", "#fca5a5"],
    bg: "stroke-red-100 dark:stroke-red-900/30",
  },
}

// Animated number counter
function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const spring = useSpring(0, { stiffness: 100, damping: 30 })
  const display = useTransform(spring, (v) => Math.round(v))
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    spring.set(value)
  }, [spring, value])

  useEffect(() => {
    return display.on("change", (v) => setDisplayValue(v))
  }, [display])

  return <span className={className}>{displayValue}</span>
}

export function CampaignProgressRing({
  value,
  size = 140,
  strokeWidth = 12,
  isActive = false,
  showPercentage = true,
  showCount = false,
  total,
  processed,
  variant = "default",
  className,
}: CampaignProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Math.min(100, Math.max(0, value))
  const strokeDashoffset = circumference - (progress / 100) * circumference
  const colors = VARIANTS[variant]
  const gradientId = `gradient-${variant}-${size}`

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.gradient[0]} />
            <stop offset="50%" stopColor={colors.gradient[1]} />
            <stop offset="100%" stopColor={colors.gradient[2]} />
          </linearGradient>
        </defs>

        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={colors.bg}
        />

        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{
            strokeDasharray: circumference,
          }}
        />

        {/* Animated glow when active */}
        {isActive && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth + 4}
            strokeLinecap="round"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset,
              filter: "blur(4px)",
            }}
            animate={{
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showPercentage && (
          <div className="flex items-baseline">
            <AnimatedCounter
              value={progress}
              className="text-3xl font-bold tabular-nums tracking-tight"
            />
            <span className="text-lg font-medium text-muted-foreground">%</span>
          </div>
        )}
        {showCount && total !== undefined && processed !== undefined && (
          <p className="text-xs text-muted-foreground mt-1">
            {processed.toLocaleString()} / {total.toLocaleString()}
          </p>
        )}
        {isActive && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-[10px] font-medium text-green-600 uppercase tracking-wider">
              Processing
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

