"use client"

import { useState, useRef, useCallback, useEffect, useMemo, memo } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Maximize2, Minimize2, Variable, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { STANDARD_CAMPAIGN_VARIABLES, type CustomVariableDefinition, type AgentCustomVariableDefinition } from "@/types/database.types"

// ============================================================================
// TYPES
// ============================================================================

interface SystemPromptEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: string
  label?: string
  required?: boolean
  /** Custom variables from workspace settings */
  customVariables?: CustomVariableDefinition[]
  /** Agent-specific custom variables */
  agentCustomVariables?: AgentCustomVariableDefinition[]
  /** Min height for the textarea */
  minHeight?: string
  /** Show template buttons */
  showTemplates?: boolean
  /** Template handler */
  onApplyTemplate?: (template: "support" | "sales" | "booking") => void
}

interface VariableSuggestion {
  name: string
  description: string
  isCustom: boolean
  isAgentLevel?: boolean
  insertText: string
}

// ============================================================================
// MEMOIZED SUB-COMPONENTS (prevent re-renders on every keystroke)
// ============================================================================

/** Quick reference variable pills — only re-renders when variables change */
const VariablesQuickReference = memo(function VariablesQuickReference({
  variables,
  onInsertRef,
}: {
  variables: VariableSuggestion[]
  onInsertRef: React.RefObject<(v: VariableSuggestion) => void>
}) {
  return (
    <div className="mt-3 sm:mt-5 p-3 sm:p-4 bg-muted/30 border rounded-xl shrink-0">
      <p className="text-xs sm:text-sm font-medium mb-2 sm:mb-3 flex items-center gap-2">
        <Variable className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
        Available Variables (click to insert)
      </p>
      <div className="flex flex-wrap gap-1.5 sm:gap-2 max-h-[100px] sm:max-h-none overflow-y-auto">
        {variables.slice(0, 15).map(v => (
          <button
            key={v.name}
            type="button"
            className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-mono bg-background border rounded-md hover:bg-accent hover:border-primary/50 transition-all"
            onClick={() => onInsertRef.current?.(v)}
            title={v.description}
          >
            {v.insertText}
          </button>
        ))}
        {variables.length > 15 && (
          <span className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-muted-foreground">
            +{variables.length - 15} more
          </span>
        )}
      </div>
    </div>
  )
})

// ============================================================================
// COMPONENT
// ============================================================================

export function SystemPromptEditor({
  value,
  onChange,
  placeholder = "You are a helpful customer support agent...",
  error,
  label = "System Prompt",
  required = false,
  customVariables = [],
  agentCustomVariables = [],
  minHeight = "320px",
  showTemplates = true,
  onApplyTemplate,
}: SystemPromptEditorProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<VariableSuggestion[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close suggestions when fullscreen mode changes
  useEffect(() => {
    setShowSuggestions(false)
    setDropdownPosition(null)
  }, [isFullscreen])

  // Close dropdown when user scrolls (but not inside the dropdown itself)
  useEffect(() => {
    if (!showSuggestions) return

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement
      if (target?.closest?.('[data-suggestions-dropdown]')) {
        return
      }
      setShowSuggestions(false)
      setDropdownPosition(null)
    }

    window.addEventListener("scroll", handleScroll, true)
    return () => {
      window.removeEventListener("scroll", handleScroll, true)
    }
  }, [showSuggestions])

  // Build all available variables
  const allVariables = useMemo((): VariableSuggestion[] => {
    const vars: VariableSuggestion[] = []
    
    STANDARD_CAMPAIGN_VARIABLES.forEach(v => {
      vars.push({
        name: v.name,
        description: v.description,
        isCustom: false,
        insertText: `{{${v.name}}}`,
      })
    })
    
    customVariables.forEach(v => {
      if (!vars.some(sv => sv.name === v.name)) {
        vars.push({
          name: v.name,
          description: v.description || `Custom variable: ${v.name}`,
          isCustom: true,
          insertText: `{{${v.name}}}`,
        })
      }
    })
    
    agentCustomVariables.forEach(v => {
      if (!vars.some(sv => sv.name === v.name)) {
        vars.push({
          name: v.name,
          description: v.description || `Agent variable: ${v.name}`,
          isCustom: true,
          isAgentLevel: true,
          insertText: `{{${v.name}}}`,
        })
      }
    })
    
    return vars
  }, [customVariables, agentCustomVariables])

  // Filter suggestions based on search query
  const filterSuggestions = useCallback((query: string) => {
    if (!query) {
      setSuggestions(allVariables)
      setShowSuggestions(true)
      return
    }
    
    const normalizedQuery = query.toLowerCase().replace(/[{}\s]/g, "")
    const filtered = allVariables.filter(v => 
      v.name.toLowerCase().includes(normalizedQuery) ||
      v.description.toLowerCase().includes(normalizedQuery)
    )
    
    setSuggestions(filtered)
    setSelectedIndex(0)
    setShowSuggestions(filtered.length > 0)
  }, [allVariables])

  // Calculate dropdown position for NORMAL mode only (fixed positioning relative to viewport)
  const updateDropdownPosition = useCallback((textarea: HTMLTextAreaElement) => {
    const rect = textarea.getBoundingClientRect()
    const EDGE_PADDING = 8
    const DROPDOWN_MAX_HEIGHT = 380
    const DROPDOWN_WIDTH = Math.min(300, Math.max(220, Math.floor(window.innerWidth * 0.22)))

    let top = rect.top + 8
    let left = rect.right - DROPDOWN_WIDTH - 8

    left = Math.max(EDGE_PADDING, left)
    if (left + DROPDOWN_WIDTH > window.innerWidth - EDGE_PADDING) {
      left = window.innerWidth - DROPDOWN_WIDTH - EDGE_PADDING
    }

    if (top + DROPDOWN_MAX_HEIGHT > window.innerHeight - EDGE_PADDING) {
      top = window.innerHeight - DROPDOWN_MAX_HEIGHT - EDGE_PADDING
    }
    top = Math.max(EDGE_PADDING, top)

    setDropdownPosition({ top, left, width: DROPDOWN_WIDTH })
  }, [])

  // Handle text input and detect variable typing
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart || 0
    
    onChange(newValue)
    
    const textBeforeCursor = newValue.substring(0, cursorPos)
    const variableMatch = textBeforeCursor.match(/\{\{(\w*)$/)
    
    if (variableMatch) {
      const query = variableMatch[1] || ""
      setSearchQuery(query)
      filterSuggestions(query)
      // Only calculate viewport-fixed position in normal mode
      // In fullscreen mode, dropdown is CSS-positioned inside the dialog
      if (!isFullscreen) {
        updateDropdownPosition(e.target)
      }
    } else {
      setShowSuggestions(false)
      setSearchQuery("")
      setDropdownPosition(null)
    }
  }, [onChange, filterSuggestions, updateDropdownPosition, isFullscreen])

  // Insert selected variable
  const insertVariable = useCallback((variable: VariableSuggestion) => {
    const textarea = isFullscreen ? fullscreenTextareaRef.current : textareaRef.current
    if (!textarea) return
    
    const cursorPos = textarea.selectionStart || 0
    const textBeforeCursor = value.substring(0, cursorPos)
    const textAfterCursor = value.substring(cursorPos)
    
    const variableMatch = textBeforeCursor.match(/\{\{(\w*)$/)
    
    if (variableMatch) {
      const startPos = cursorPos - variableMatch[0].length
      const newText = 
        value.substring(0, startPos) + 
        variable.insertText + 
        textAfterCursor
      
      onChange(newText)
      
      setTimeout(() => {
        const newPos = startPos + variable.insertText.length
        textarea.setSelectionRange(newPos, newPos)
        textarea.focus()
      }, 0)
    } else {
      const newText = 
        textBeforeCursor + 
        variable.insertText + 
        textAfterCursor
      
      onChange(newText)
      
      setTimeout(() => {
        const newPos = cursorPos + variable.insertText.length
        textarea.setSelectionRange(newPos, newPos)
        textarea.focus()
      }, 0)
    }
    
    setShowSuggestions(false)
    setSearchQuery("")
  }, [value, onChange, isFullscreen])

  // Stable ref for insertVariable (used by memoized children to avoid re-render cascade)
  const insertVariableRef = useRef(insertVariable)
  insertVariableRef.current = insertVariable

  // Handle keyboard navigation in suggestions
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions || suggestions.length === 0) return
    
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % suggestions.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === "Tab" || e.key === "Enter") {
      if (showSuggestions && suggestions[selectedIndex]) {
        e.preventDefault()
        insertVariable(suggestions[selectedIndex])
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false)
    }
  }, [showSuggestions, suggestions, selectedIndex, insertVariable])

  // Close suggestions when clicking outside (normal mode) or resizing
  useEffect(() => {
    if (!showSuggestions) return
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target?.closest?.("[data-suggestions-dropdown]")) {
        return
      }
      setShowSuggestions(false)
      setDropdownPosition(null)
    }

    const handleResize = () => {
      setShowSuggestions(false)
      setDropdownPosition(null)
    }
    
    document.addEventListener("mousedown", handleClickOutside)
    window.addEventListener("resize", handleResize)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      window.removeEventListener("resize", handleResize)
    }
  }, [showSuggestions])

  // ============================================================================
  // SHARED DROPDOWN CONTENT (used by both normal and fullscreen modes)
  // ============================================================================

  const renderDropdownContent = () => {
    if (!showSuggestions || suggestions.length === 0) return null

    return (
      <>
        {/* Header */}
        <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs">
            <Sparkles className="h-3 w-3 text-primary shrink-0" />
            <span className="font-medium text-foreground">Variables</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <kbd className="px-1 py-0.5 bg-background border rounded text-[9px]">↑↓</kbd>
            <kbd className="px-1 py-0.5 bg-background border rounded text-[9px]">Tab</kbd>
          </div>
        </div>
        
        {/* Search indicator */}
        {searchQuery && (
          <div className="px-3 py-1.5 bg-primary/5 border-b text-xs flex items-center gap-2 overflow-hidden">
            <span className="text-muted-foreground shrink-0">Searching:</span>
            <code className="font-mono text-primary font-medium truncate">{searchQuery}</code>
          </div>
        )}
        
        {/* Scrollable suggestions list */}
        <div 
          className="overflow-y-auto overscroll-contain"
          style={{ maxHeight: 280 }}
        >
          <div className="p-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.name}
                type="button"
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors overflow-hidden",
                  index === selectedIndex 
                    ? "bg-primary text-primary-foreground" 
                    : "hover:bg-muted/60"
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  insertVariable(suggestion)
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className={cn(
                  "shrink-0 w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px]",
                  index === selectedIndex 
                    ? "bg-primary-foreground/20" 
                    : "bg-primary/10"
                )}>
                  <Variable className="h-3 w-3" />
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1 min-w-0">
                    <code className={cn(
                      "text-xs font-mono font-bold truncate",
                      index === selectedIndex 
                        ? "text-primary-foreground" 
                        : "text-foreground"
                    )}>
                      {suggestion.name}
                    </code>
                    {suggestion.isCustom && (
                      <span className={cn(
                        "text-[8px] px-1 py-0.5 rounded font-medium shrink-0",
                        index === selectedIndex 
                          ? "bg-primary-foreground/20 text-primary-foreground" 
                          : "bg-amber-500/10 text-amber-600"
                      )}>
                        Custom
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    "text-[10px] truncate",
                    index === selectedIndex 
                      ? "text-primary-foreground/70" 
                      : "text-muted-foreground"
                  )}>
                    {suggestion.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-2 py-1 border-t bg-muted/30">
          <p className="text-[10px] text-muted-foreground text-center">
            <kbd className="px-1 py-0.5 bg-background border rounded text-[9px]">Esc</kbd> to close
          </p>
        </div>
      </>
    )
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      <div className="space-y-2">
        {/* Header with label and fullscreen button */}
        <div className="flex items-center justify-between">
          <Label>
            {label} {required && <span className="text-destructive">*</span>}
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {value.length} characters
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setIsFullscreen(true)}
              title="Open fullscreen editor"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Hint for variable syntax */}
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          Type <code className="px-1 py-0.5 bg-muted rounded text-[10px]">{"{{"}</code> to see available variables
        </p>

        {/* Main textarea */}
        <div className="relative" ref={containerRef}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(
              "w-full px-3 py-2 text-sm rounded-md border bg-background resize-y font-mono",
              error ? "border-destructive" : "border-input",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            )}
            style={{ minHeight }}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Template buttons */}
        {showTemplates && onApplyTemplate && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onApplyTemplate("support")}
            >
              Support Template
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onApplyTemplate("sales")}
            >
              Sales Template
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onApplyTemplate("booking")}
            >
              Booking Template
            </Button>
          </div>
        )}
      </div>

      {/* ================================================================
          FULLSCREEN DIALOG
          ================================================================ */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[98vw]! w-[98vw]! h-[95vh] flex flex-col p-0 sm:max-w-[98vw]">
          <DialogHeader className="px-4 sm:px-8 py-3 sm:py-4 border-b shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
              <DialogTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg">
                <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10">
                  <Variable className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>
                System Prompt Editor
              </DialogTitle>
              <div className="flex items-center gap-3 sm:gap-4">
                <span className="text-xs sm:text-sm text-muted-foreground tabular-nums">
                  {value.length.toLocaleString()} characters
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFullscreen(false)}
                  className="h-8 text-xs sm:text-sm"
                >
                  <Minimize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  <span className="hidden sm:inline">Exit Fullscreen</span>
                  <span className="sm:hidden">Exit</span>
                </Button>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 px-4 sm:px-8 py-3 sm:py-6 overflow-hidden flex flex-col">
            {/* Hint */}
            <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
              Type <code className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted rounded text-[10px] sm:text-xs font-mono">{"{{"}</code> to see available variables
            </p>

            {/* Fullscreen textarea + INLINE dropdown (inside Dialog DOM tree) */}
            <div className="flex-1 relative min-h-0">
              <textarea
                ref={fullscreenTextareaRef}
                value={value}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={cn(
                  "w-full h-full px-3 sm:px-5 py-3 sm:py-4 text-xs sm:text-sm rounded-lg border-2 bg-background font-mono leading-relaxed",
                  error ? "border-destructive" : "border-input hover:border-primary/50 focus:border-primary",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20",
                  "resize-none transition-colors"
                )}
              />

              {/* ── Fullscreen dropdown: INSIDE the Dialog DOM (no portal) ── */}
              {isFullscreen && showSuggestions && suggestions.length > 0 && (
                <div 
                  ref={dropdownRef}
                  data-suggestions-dropdown
                  className="absolute top-2 right-2 bg-popover border border-border/50 rounded-xl shadow-2xl overflow-hidden"
                  style={{
                    width: Math.min(300, Math.max(220, Math.floor(window.innerWidth * 0.22))),
                    zIndex: 50,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {renderDropdownContent()}
                </div>
              )}
            </div>

            {/* Available Variables Quick Reference — memoized to avoid re-render on each keystroke */}
            <VariablesQuickReference
              variables={allVariables}
              onInsertRef={insertVariableRef}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ================================================================
          NORMAL MODE DROPDOWN (portaled to body, outside Dialog)
          ================================================================ */}
      {!isFullscreen && showSuggestions && suggestions.length > 0 && dropdownPosition && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          data-suggestions-dropdown
          className="fixed bg-popover border border-border/50 rounded-xl shadow-2xl overflow-hidden"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            zIndex: 99999,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {renderDropdownContent()}
        </div>,
        document.body
      )}
    </>
  )
}
