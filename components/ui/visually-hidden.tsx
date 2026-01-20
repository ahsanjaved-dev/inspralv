/**
 * Visually Hidden Component
 * Hides content visually while keeping it accessible to screen readers
 * 
 * Use cases:
 * - Icon-only buttons that need accessible labels
 * - Form field descriptions that are visually obvious but need screen reader context
 * - Skip links and other navigation aids
 */

import * as React from "react"
import { cn } from "@/lib/utils"

export interface VisuallyHiddenProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * If true, the element becomes visible when focused
   * Useful for skip links
   */
  focusable?: boolean
}

/**
 * Visually Hidden
 * Content is hidden from sighted users but accessible to screen readers
 */
export function VisuallyHidden({
  children,
  className,
  focusable = false,
  ...props
}: VisuallyHiddenProps) {
  return (
    <span
      className={cn(
        // Base visually hidden styles
        "absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0",
        "[clip:rect(0,0,0,0)]",
        // If focusable, show on focus
        focusable && "focus:static focus:h-auto focus:w-auto focus:overflow-visible focus:whitespace-normal focus:[clip:auto]",
        className
      )}
      style={{
        // Fallback for older browsers
        margin: "-1px",
      }}
      {...props}
    >
      {children}
    </span>
  )
}

/**
 * Screen Reader Only
 * Alias for VisuallyHidden for semantic clarity
 */
export const SrOnly = VisuallyHidden

/**
 * Live Region
 * Announces dynamic content changes to screen readers
 */
export interface LiveRegionProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * How interrupting the announcement should be
   * - polite: Wait until user is idle (default)
   * - assertive: Interrupt immediately (use sparingly)
   */
  priority?: "polite" | "assertive"
  /**
   * Whether to announce entire region or just changes
   */
  atomic?: boolean
}

export function LiveRegion({
  children,
  priority = "polite",
  atomic = true,
  className,
  ...props
}: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic={atomic}
      className={cn("sr-only", className)}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Announce
 * Component that announces a message when it mounts or when message changes
 */
export function Announce({ 
  message,
  priority = "polite",
}: { 
  message: string
  priority?: "polite" | "assertive"
}) {
  const [announced, setAnnounced] = React.useState("")

  React.useEffect(() => {
    // Delay announcement to ensure DOM is ready
    const timer = setTimeout(() => {
      setAnnounced(message)
    }, 100)
    
    return () => clearTimeout(timer)
  }, [message])

  return (
    <LiveRegion priority={priority}>
      {announced}
    </LiveRegion>
  )
}

