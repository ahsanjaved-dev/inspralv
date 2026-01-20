"use client"

/**
 * Skip Link Component
 * Allows keyboard users to skip repetitive navigation and jump to main content
 * 
 * This is a critical accessibility feature for keyboard navigation.
 * 
 * Usage:
 * 1. Add <SkipLinks /> at the top of your layout
 * 2. Add id="main-content" to your main content area
 * 3. Optionally add id="main-nav" to your navigation
 */

import { SKIP_TARGETS } from "@/lib/a11y"

interface SkipLinkProps {
  href: string
  children: React.ReactNode
}

function SkipLink({ href, children }: SkipLinkProps) {
  return (
    <a
      href={href}
      className="
        fixed left-4 top-4 z-[9999]
        -translate-y-16 opacity-0
        focus:translate-y-0 focus:opacity-100
        transition-transform duration-200
        bg-primary text-primary-foreground
        px-4 py-2 rounded-md
        font-medium text-sm
        focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
        shadow-lg
      "
    >
      {children}
    </a>
  )
}

/**
 * Skip Links Container
 * Add this to the top of your layout (before header/nav)
 */
export function SkipLinks() {
  return (
    <div className="skip-links">
      <SkipLink href={`#${SKIP_TARGETS.MAIN_CONTENT}`}>
        Skip to main content
      </SkipLink>
      <SkipLink href={`#${SKIP_TARGETS.NAVIGATION}`}>
        Skip to navigation
      </SkipLink>
    </div>
  )
}

/**
 * Main Content Wrapper
 * Wraps main content area with proper landmark and skip target
 */
export function MainContent({ 
  children,
  className = "",
}: { 
  children: React.ReactNode
  className?: string 
}) {
  return (
    <main
      id={SKIP_TARGETS.MAIN_CONTENT}
      role="main"
      tabIndex={-1}
      className={`outline-none ${className}`}
    >
      {children}
    </main>
  )
}

export { SkipLink }

