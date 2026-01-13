"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Loader2, User, Phone, Bot, Zap, Sparkles, X } from "lucide-react"
import { useAlgoliaSearch, type SearchParams } from "@/lib/hooks/use-algolia-search"
import { cn } from "@/lib/utils"
import type { AlgoliaSuggestion } from "@/lib/algolia/types"

interface AlgoliaSearchBoxProps {
  onSearch: (query: string) => void
  onAlgoliaSearch?: (results: any) => void
  placeholder?: string
  className?: string
  debounceMs?: number
  showAutocomplete?: boolean
  disabled?: boolean
  value?: string
  filters?: SearchParams["filters"]
}

export function AlgoliaSearchBox({
  onSearch,
  onAlgoliaSearch,
  placeholder = "Search calls...",
  className,
  debounceMs = 300,
  showAutocomplete = true,
  disabled = false,
  value: controlledValue,
  filters,
}: AlgoliaSearchBoxProps) {
  const [localValue, setLocalValue] = useState(controlledValue || "")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const {
    isConfigured,
    isLoadingConfig,
    search,
    getAutocomplete,
    autocompleteResults,
    isLoadingAutocomplete,
    isSearching,
  } = useAlgoliaSearch()

  // Sync with controlled value
  useEffect(() => {
    if (controlledValue !== undefined) {
      setLocalValue(controlledValue)
    }
  }, [controlledValue])

  // Handle input change with debounced autocomplete
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setLocalValue(newValue)
      setSelectedIndex(-1)

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      // Debounce autocomplete requests
      if (showAutocomplete && isConfigured && newValue.trim().length > 1) {
        debounceTimerRef.current = setTimeout(() => {
          getAutocomplete(newValue)
          setShowSuggestions(true)
        }, debounceMs)
      } else {
        setShowSuggestions(false)
      }
    },
    [showAutocomplete, isConfigured, getAutocomplete, debounceMs]
  )

  // Handle search submission
  const handleSearch = useCallback(
    async (query: string) => {
      setShowSuggestions(false)
      onSearch(query)

      // If Algolia is configured, also perform Algolia search
      if (isConfigured && onAlgoliaSearch && query.trim()) {
        const results = await search({
          query,
          filters,
          hitsPerPage: 20,
        })
        if (results) {
          onAlgoliaSearch(results)
        }
      }
    },
    [onSearch, isConfigured, onAlgoliaSearch, search, filters]
  )

  // Handle key events for autocomplete navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showSuggestions || autocompleteResults.length === 0) {
        if (e.key === "Enter") {
          handleSearch(localValue)
        }
        return
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((prev) =>
            prev < autocompleteResults.length - 1 ? prev + 1 : prev
          )
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
          break
        case "Enter":
          e.preventDefault()
          if (selectedIndex >= 0 && autocompleteResults[selectedIndex]) {
            const suggestion = autocompleteResults[selectedIndex]
            setLocalValue(suggestion.text)
            handleSearch(suggestion.text)
          } else {
            handleSearch(localValue)
          }
          break
        case "Escape":
          setShowSuggestions(false)
          setSelectedIndex(-1)
          break
      }
    },
    [showSuggestions, autocompleteResults, selectedIndex, localValue, handleSearch]
  )

  // Handle suggestion click
  const handleSuggestionClick = useCallback(
    (suggestion: AlgoliaSuggestion) => {
      setLocalValue(suggestion.text)
      handleSearch(suggestion.text)
    },
    [handleSearch]
  )

  // Clear input
  const handleClear = useCallback(() => {
    setLocalValue("")
    setShowSuggestions(false)
    onSearch("")
    inputRef.current?.focus()
  }, [onSearch])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Get icon for suggestion type
  const getSuggestionIcon = (type: AlgoliaSuggestion["type"]) => {
    switch (type) {
      case "caller":
        return <User className="h-4 w-4 text-muted-foreground" />
      case "phone":
        return <Phone className="h-4 w-4 text-muted-foreground" />
      case "agent":
        return <Bot className="h-4 w-4 text-muted-foreground" />
      default:
        return <Search className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={localValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (autocompleteResults.length > 0) {
              setShowSuggestions(true)
            }
          }}
          placeholder={placeholder}
          className={cn(
            "pl-9 pr-20",
            isConfigured && "pr-28"
          )}
          disabled={disabled || isLoadingConfig}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {(isSearching || isLoadingAutocomplete) && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {localValue && (
            <button
              onClick={handleClear}
              className="p-1 hover:bg-muted rounded"
              type="button"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          {isConfigured && (
            <Badge
              variant="secondary"
              className="h-5 text-xs gap-1 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
            >
              <Zap className="h-3 w-3" />
              Fast
            </Badge>
          )}
        </div>
      </div>

      {/* Autocomplete Suggestions */}
      {showAutocomplete && showSuggestions && autocompleteResults.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg overflow-hidden"
        >
          <div className="py-1">
            {autocompleteResults.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.text}-${index}`}
                onClick={() => handleSuggestionClick(suggestion)}
                className={cn(
                  "w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-muted transition-colors",
                  selectedIndex === index && "bg-muted"
                )}
              >
                {getSuggestionIcon(suggestion.type)}
                <span className="flex-1 truncate">{suggestion.text}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {suggestion.type}
                </span>
              </button>
            ))}
          </div>
          <div className="px-3 py-1.5 border-t bg-muted/50 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              <Sparkles className="h-3 w-3 inline mr-1" />
              Powered by Algolia
            </span>
            <span>Press Enter to search</span>
          </div>
        </div>
      )}
    </div>
  )
}

