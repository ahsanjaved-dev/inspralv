/**
 * Accessibility Utilities
 * Phase 7.1: Accessibility Audit
 * 
 * Provides utilities for accessibility testing and monitoring
 */

// ============================================================================
// ACCESSIBILITY CONSTANTS
// ============================================================================

/**
 * WCAG 2.1 AA minimum contrast ratios
 */
export const CONTRAST_RATIOS = {
  /** Normal text (< 18pt or < 14pt bold) */
  NORMAL_TEXT: 4.5,
  /** Large text (>= 18pt or >= 14pt bold) */
  LARGE_TEXT: 3,
  /** UI components and graphical objects */
  UI_COMPONENTS: 3,
} as const

/**
 * Minimum touch target sizes (in pixels)
 */
export const TOUCH_TARGETS = {
  /** WCAG 2.1 Level AAA recommendation */
  MINIMUM: 44,
  /** Comfortable touch target */
  COMFORTABLE: 48,
} as const

/**
 * Animation preferences
 */
export const ANIMATION = {
  /** Max duration for non-essential animations (ms) */
  MAX_DURATION: 5000,
  /** Reduced motion query */
  REDUCED_MOTION_QUERY: "(prefers-reduced-motion: reduce)",
} as const

// ============================================================================
// FOCUS MANAGEMENT
// ============================================================================

/**
 * Traps focus within a container element
 * Useful for modals and dialogs
 */
export function createFocusTrap(container: HTMLElement) {
  const focusableSelectors = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",")

  const focusableElements = container.querySelectorAll<HTMLElement>(focusableSelectors)
  const firstFocusable = focusableElements[0]
  const lastFocusable = focusableElements[focusableElements.length - 1]

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== "Tab") return

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault()
        lastFocusable?.focus()
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault()
        firstFocusable?.focus()
      }
    }
  }

  container.addEventListener("keydown", handleKeyDown)

  // Focus first element
  firstFocusable?.focus()

  // Return cleanup function
  return () => {
    container.removeEventListener("keydown", handleKeyDown)
  }
}

/**
 * Restores focus to the previously focused element
 */
export function createFocusRestorer() {
  const previouslyFocused = document.activeElement as HTMLElement | null

  return () => {
    previouslyFocused?.focus()
  }
}

// ============================================================================
// SCREEN READER UTILITIES
// ============================================================================

/**
 * Announces a message to screen readers using an ARIA live region
 */
export function announceToScreenReader(
  message: string,
  priority: "polite" | "assertive" = "polite"
) {
  const announcer = document.createElement("div")
  announcer.setAttribute("role", "status")
  announcer.setAttribute("aria-live", priority)
  announcer.setAttribute("aria-atomic", "true")
  announcer.className = "sr-only"
  announcer.textContent = message

  document.body.appendChild(announcer)

  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcer)
  }, 1000)
}

/**
 * Screen-reader only CSS class styles
 * Add this to your global CSS or use with Tailwind's sr-only
 */
export const SR_ONLY_STYLES = `
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
`

// ============================================================================
// COLOR CONTRAST UTILITIES
// ============================================================================

/**
 * Calculate relative luminance of a color
 * Based on WCAG 2.1 formula
 */
export function getLuminance(r: number, g: number, b: number): number {
  const values = [r, g, b].map((c) => {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  const [rs, gs, bs] = values
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Calculate contrast ratio between two colors
 */
export function getContrastRatio(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number }
): number {
  const l1 = getLuminance(color1.r, color1.g, color1.b)
  const l2 = getLuminance(color2.r, color2.g, color2.b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Check if contrast ratio meets WCAG requirements
 */
export function meetsContrastRequirement(
  ratio: number,
  textSize: "normal" | "large" = "normal"
): boolean {
  const requiredRatio = textSize === "large" 
    ? CONTRAST_RATIOS.LARGE_TEXT 
    : CONTRAST_RATIOS.NORMAL_TEXT
  return ratio >= requiredRatio
}

// ============================================================================
// REDUCED MOTION UTILITIES
// ============================================================================

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia(ANIMATION.REDUCED_MOTION_QUERY).matches
}

/**
 * Get animation duration respecting reduced motion preference
 */
export function getAnimationDuration(duration: number): number {
  return prefersReducedMotion() ? 0 : duration
}

// ============================================================================
// KEYBOARD NAVIGATION
// ============================================================================

/**
 * Arrow key navigation for lists
 */
export function handleArrowKeyNavigation(
  e: KeyboardEvent,
  items: HTMLElement[],
  currentIndex: number,
  options: {
    loop?: boolean
    orientation?: "horizontal" | "vertical" | "both"
  } = {}
): number {
  const { loop = true, orientation = "vertical" } = options
  let newIndex = currentIndex

  const isVerticalKey = ["ArrowUp", "ArrowDown"].includes(e.key)
  const isHorizontalKey = ["ArrowLeft", "ArrowRight"].includes(e.key)

  if (orientation === "vertical" && !isVerticalKey) return currentIndex
  if (orientation === "horizontal" && !isHorizontalKey) return currentIndex

  switch (e.key) {
    case "ArrowUp":
    case "ArrowLeft":
      newIndex = currentIndex - 1
      if (newIndex < 0) {
        newIndex = loop ? items.length - 1 : 0
      }
      break
    case "ArrowDown":
    case "ArrowRight":
      newIndex = currentIndex + 1
      if (newIndex >= items.length) {
        newIndex = loop ? 0 : items.length - 1
      }
      break
    case "Home":
      newIndex = 0
      break
    case "End":
      newIndex = items.length - 1
      break
  }

  if (newIndex !== currentIndex) {
    e.preventDefault()
    items[newIndex]?.focus()
  }

  return newIndex
}

// ============================================================================
// FORM ACCESSIBILITY
// ============================================================================

/**
 * Generate unique ID for form field labeling
 */
let idCounter = 0
export function generateFieldId(prefix = "field"): string {
  return `${prefix}-${++idCounter}`
}

/**
 * Common ARIA attributes for form fields
 */
export interface FieldAriaProps {
  id: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
  "aria-required"?: boolean
}

export function getFieldAriaProps(
  id: string,
  options: {
    hasError?: boolean
    hasDescription?: boolean
    isRequired?: boolean
  } = {}
): FieldAriaProps {
  const props: FieldAriaProps = { id }

  if (options.hasError) {
    props["aria-invalid"] = true
    props["aria-describedby"] = `${id}-error`
  } else if (options.hasDescription) {
    props["aria-describedby"] = `${id}-description`
  }

  if (options.isRequired) {
    props["aria-required"] = true
  }

  return props
}

// ============================================================================
// SKIP LINK COMPONENT HELPERS
// ============================================================================

/**
 * Skip link target IDs
 */
export const SKIP_TARGETS = {
  MAIN_CONTENT: "main-content",
  NAVIGATION: "main-nav",
  SEARCH: "search",
} as const

