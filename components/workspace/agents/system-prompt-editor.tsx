"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Maximize2, Minimize2, Variable, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { STANDARD_CAMPAIGN_VARIABLES, SYSTEM_VARIABLES, type CustomVariableDefinition, type AgentCustomVariableDefinition } from "@/types/database.types"

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
  isSystem?: boolean
  insertText: string
}

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
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close suggestions when fullscreen mode changes
  useEffect(() => {
    setShowSuggestions(false)
    setDropdownPosition(null)
  }, [isFullscreen])

  // Close dropdown when user scrolls the page (normal mode only)
  // But ignore scrolls inside the dropdown itself
  useEffect(() => {
    if (!showSuggestions || isFullscreen) return

    const handleScroll = (e: Event) => {
      // Check if scroll happened inside the dropdown (has data attribute)
      const target = e.target as HTMLElement
      if (target?.closest?.('[data-suggestions-dropdown]')) {
        return // Don't close if scrolling inside dropdown
      }
      
      setShowSuggestions(false)
      setDropdownPosition(null)
    }

    // Listen on window for scroll events with capture phase
    window.addEventListener("scroll", handleScroll, true)
    
    return () => {
      window.removeEventListener("scroll", handleScroll, true)
    }
  }, [showSuggestions, isFullscreen])

  // Build all available variables
  const allVariables = useMemo((): VariableSuggestion[] => {
    const vars: VariableSuggestion[] = []
    
    // Add system variables first (auto-generated runtime variables)
    SYSTEM_VARIABLES.forEach(v => {
      vars.push({
        name: v.name,
        description: v.description,
        isCustom: false,
        isSystem: true,
        insertText: `{{${v.name}}}`,
      })
    })
    
    // Add standard campaign variables
    STANDARD_CAMPAIGN_VARIABLES.forEach(v => {
      vars.push({
        name: v.name,
        description: v.description,
        isCustom: false,
        insertText: `{{${v.name}}}`,
      })
    })
    
    // Add custom variables from workspace
    customVariables.forEach(v => {
      // Don't add if already in standard
      if (!vars.some(sv => sv.name === v.name)) {
        vars.push({
          name: v.name,
          description: v.description || `Custom variable: ${v.name}`,
          isCustom: true,
          insertText: `{{${v.name}}}`,
        })
      }
    })
    
    // Add agent-level custom variables
    agentCustomVariables.forEach(v => {
      // Don't add if already exists (standard or workspace)
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

  // Calculate dropdown position based on textarea
  const updateDropdownPosition = useCallback((textarea: HTMLTextAreaElement) => {
    const rect = textarea.getBoundingClientRect()
    // Position to the right of the textarea, or below if not enough space
    const rightSpace = window.innerWidth - rect.right
    const bottomSpace = window.innerHeight - rect.bottom
    
    if (rightSpace > 320) {
      // Position to the right
      setDropdownPosition({
        top: rect.top + 40,
        left: rect.right + 12,
      })
    } else if (bottomSpace > 300) {
      // Position below
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
      })
    } else {
      // Position at top-right corner inside
      setDropdownPosition({
        top: rect.top + 12,
        left: rect.right - 320,
      })
    }
  }, [])

  // Handle text input and detect variable typing
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart || 0
    
    onChange(newValue)
    
    // Check if user is typing a variable (after {{ or after a partial variable name)
    const textBeforeCursor = newValue.substring(0, cursorPos)
    
    // Look for {{ pattern followed by partial variable name
    const variableMatch = textBeforeCursor.match(/\{\{(\w*)$/)
    
    if (variableMatch) {
      const query = variableMatch[1] || "" // The partial variable name
      setSearchQuery(query)
      filterSuggestions(query) // Show all if just {{
      updateDropdownPosition(e.target)
    } else {
      setShowSuggestions(false)
      setSearchQuery("")
      setDropdownPosition(null)
    }
  }, [onChange, filterSuggestions, updateDropdownPosition])

  // Insert selected variable
  const insertVariable = useCallback((variable: VariableSuggestion) => {
    const textarea = isFullscreen ? fullscreenTextareaRef.current : textareaRef.current
    if (!textarea) return
    
    const cursorPos = textarea.selectionStart || 0
    const textBeforeCursor = value.substring(0, cursorPos)
    const textAfterCursor = value.substring(cursorPos)
    
    // Find the start of the variable pattern ({{ + partial name)
    const variableMatch = textBeforeCursor.match(/\{\{(\w*)$/)
    
    if (variableMatch) {
      // Replace the partial variable with the full one
      const startPos = cursorPos - variableMatch[0].length
      const newText = 
        value.substring(0, startPos) + 
        variable.insertText + 
        textAfterCursor
      
      onChange(newText)
      
      // Set cursor position after the inserted variable
      setTimeout(() => {
        const newPos = startPos + variable.insertText.length
        textarea.setSelectionRange(newPos, newPos)
        textarea.focus()
      }, 0)
    } else {
      // Just insert at cursor
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

  // Close suggestions when clicking outside
  useEffect(() => {
    if (!showSuggestions) return
    
    const handleClickOutside = () => {
      setShowSuggestions(false)
    }
    
    document.addEventListener("click", handleClickOutside)
    return () => document.removeEventListener("click", handleClickOutside)
  }, [showSuggestions])

  // Sync fullscreen textarea value
  useEffect(() => {
    if (isFullscreen && fullscreenTextareaRef.current) {
      fullscreenTextareaRef.current.value = value
    }
  }, [isFullscreen, value])

  // Single suggestions dropdown - rendered once at document level
  const renderSuggestionsDropdown = () => {
    if (!showSuggestions || suggestions.length === 0 || !dropdownPosition) return null
    
    return (
      <div 
        data-suggestions-dropdown
        className={cn(
          "fixed bg-popover border border-border/50 rounded-xl shadow-2xl",
          "w-[280px]",
          "animate-in fade-in-0 slide-in-from-top-2 duration-150",
          "flex flex-col"
        )}
        style={{
          top: dropdownPosition.top,
          left: dropdownPosition.left,
          maxHeight: "min(380px, calc(100vh - 100px))",
          zIndex: 9999, // High z-index to appear above dialogs
        }}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()} // Prevent scroll from closing dropdown
      >
        {/* Header */}
        <div className="px-3 py-2 border-b bg-muted/40 rounded-t-xl flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-foreground">Variables</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <kbd className="px-1 py-0.5 bg-background border rounded text-[9px]">↑↓</kbd>
            <kbd className="px-1 py-0.5 bg-background border rounded text-[9px]">Tab</kbd>
          </div>
        </div>
        
        {/* Search indicator */}
        {searchQuery && (
          <div className="px-3 py-1.5 bg-primary/5 border-b text-xs flex items-center gap-2 shrink-0">
            <span className="text-muted-foreground">Searching:</span>
            <code className="font-mono text-primary font-medium">{searchQuery}</code>
          </div>
        )}
        
        {/* Suggestions list - using ScrollArea for proper scrolling */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.name}
                type="button"
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all",
                  suggestion.isSystem && !suggestion.isCustom
                    ? "bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40 border border-blue-200 dark:border-blue-800"
                    : index === selectedIndex 
                      ? "bg-primary text-primary-foreground" 
                      : "hover:bg-muted/60"
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  insertVariable(suggestion)
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className={cn(
                  "shrink-0 w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs",
                  suggestion.isSystem && !suggestion.isCustom
                    ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                    : index === selectedIndex 
                      ? "bg-primary-foreground/20" 
                      : "bg-primary/10"
                )}>
                  {suggestion.isSystem ? "∑" : <Variable className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <code className={cn(
                      "text-[13px] font-mono font-bold",
                      suggestion.isSystem && !suggestion.isCustom
                        ? "text-blue-700 dark:text-blue-300"
                        : index === selectedIndex 
                          ? "text-primary-foreground" 
                          : "text-foreground"
                    )}>
                      {suggestion.name}
                    </code>
                    {suggestion.isSystem && (
                      <span className={cn(
                        "text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider",
                        index === selectedIndex 
                          ? "bg-primary-foreground/30 text-primary-foreground" 
                          : "bg-blue-500/20 text-blue-700 dark:bg-blue-500/30 dark:text-blue-300"
                      )}>
                        System
                      </span>
                    )}
                    {suggestion.isCustom && !suggestion.isSystem && (
                      <span className={cn(
                        "text-[9px] px-1 py-0.5 rounded font-medium",
                        index === selectedIndex 
                          ? "bg-primary-foreground/20 text-primary-foreground" 
                          : "bg-amber-500/10 text-amber-600"
                      )}>
                        Custom
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    "text-[11px] truncate",
                    suggestion.isSystem && !suggestion.isCustom
                      ? "text-blue-600/80 dark:text-blue-300/80"
                      : index === selectedIndex 
                        ? "text-primary-foreground/70" 
                        : "text-muted-foreground"
                  )}>
                    {suggestion.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
        
        {/* Footer */}
        <div className="px-3 py-1.5 border-t bg-muted/30 rounded-b-xl">
          <p className="text-[10px] text-muted-foreground text-center">
            <kbd className="px-1 py-0.5 bg-background border rounded text-[9px]">Esc</kbd> to close
          </p>
        </div>
      </div>
    )
  }

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

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[98vw]! w-[98vw]! h-[95vh] flex flex-col p-0 sm:max-w-[98vw]">
          <DialogHeader className="px-8 py-4 border-b shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-3 text-lg">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Variable className="h-5 w-5 text-primary" />
                </div>
                System Prompt Editor
              </DialogTitle>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground tabular-nums">
                  {value.length.toLocaleString()} characters
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFullscreen(false)}
                >
                  <Minimize2 className="h-4 w-4 mr-2" />
                  Exit Fullscreen
                </Button>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 px-8 py-6 overflow-hidden flex flex-col">
            {/* Hint */}
            <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Type <code className="px-2 py-1 bg-muted rounded text-xs font-mono">{"{{"}</code> to see available variables for dynamic content
            </p>

            {/* Fullscreen textarea */}
            <div className="flex-1 relative min-h-0">
              <textarea
                ref={fullscreenTextareaRef}
                value={value}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={cn(
                  "w-full h-full px-5 py-4 text-sm rounded-lg border-2 bg-background font-mono leading-relaxed",
                  error ? "border-destructive" : "border-input hover:border-primary/50 focus:border-primary",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20",
                  "resize-none transition-colors"
                )}
              />
            </div>

            {/* Available Variables Quick Reference */}
            <div className="mt-5 p-4 bg-muted/30 border rounded-xl shrink-0">
              <p className="text-sm font-medium mb-3 flex items-center gap-2">
                <Variable className="h-4 w-4 text-primary" />
                Available Variables (click to insert)
              </p>
              <div className="flex flex-wrap gap-2">
                {allVariables.slice(0, 15).map(v => (
                  <button
                    key={v.name}
                    type="button"
                    className="px-3 py-1.5 text-xs font-mono bg-background border rounded-md hover:bg-accent hover:border-primary/50 transition-all"
                    onClick={() => insertVariable(v)}
                    title={v.description}
                  >
                    {v.insertText}
                  </button>
                ))}
                {allVariables.length > 15 && (
                  <span className="px-3 py-1.5 text-xs text-muted-foreground">
                    +{allVariables.length - 15} more
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Single suggestions dropdown - rendered at document level */}
      {renderSuggestionsDropdown()}
    </>
  )
}
