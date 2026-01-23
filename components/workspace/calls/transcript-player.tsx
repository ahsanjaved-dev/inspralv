"use client"

/**
 * Transcript Player Component
 * 
 * Displays call transcript with:
 * - Audio player for call recording
 * - Auto-scrolling transcript that syncs with audio playback
 * - Visual highlighting of current speaker turn
 * - Play/pause, seek, and speed controls
 */

import { useRef, useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Headphones,
  User,
  Bot,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"

// =============================================================================
// TYPES
// =============================================================================

export interface TranscriptMessage {
  role: "assistant" | "user" | "system" | "tool"
  message?: string
  content?: string
  time?: number
  endTime?: number
  secondsFromStart?: number
  duration?: number
}

interface TranscriptPlayerProps {
  /** URL to the audio recording */
  recordingUrl?: string | null
  /** Plain text transcript (fallback) */
  transcript?: string | null
  /** Structured transcript messages with timestamps */
  transcriptMessages?: TranscriptMessage[]
  /** Optional className for the container */
  className?: string
  /** Callback to navigate to the previous call */
  onPreviousCall?: () => void
  /** Callback to navigate to the next call */
  onNextCall?: () => void
  /** Whether there is a previous call to navigate to */
  hasPreviousCall?: boolean
  /** Whether there is a next call to navigate to */
  hasNextCall?: boolean
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

/**
 * Detect if message content indicates it's from the customer/user
 * Some providers embed "Customer:" prefix in the message content
 */
function detectActualRole(content: string, originalRole: string): { role: "assistant" | "user", cleanContent: string } {
  const trimmed = content.trim()
  
  // Check if content starts with "Customer:" or "User:" prefix
  const customerMatch = trimmed.match(/^(Customer|User|Human):\s*(.*)$/i)
  if (customerMatch && customerMatch[2]) {
    return {
      role: "user",
      cleanContent: customerMatch[2].trim()
    }
  }
  
  // Check if content starts with "Agent:" or "Assistant:" prefix (and strip it)
  const agentMatch = trimmed.match(/^(Agent|Assistant|Bot|AI):\s*(.*)$/i)
  if (agentMatch && agentMatch[2]) {
    return {
      role: "assistant",
      cleanContent: agentMatch[2].trim()
    }
  }
  
  // Return original role and content
  return {
    role: originalRole === "user" ? "user" : "assistant",
    cleanContent: trimmed
  }
}

function parseTranscriptToMessages(transcript: string): TranscriptMessage[] {
  // Try to parse lines like "Agent: Hello" or "User: Hi"
  const lines = transcript.split("\n").filter((line) => line.trim())
  return lines.map((line, index) => {
    const { role, cleanContent } = detectActualRole(line, "assistant")
    return {
      role,
      message: cleanContent,
      secondsFromStart: index * 5, // Estimate 5 seconds per message
    }
  })
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TranscriptPlayer({
  recordingUrl,
  transcript,
  transcriptMessages,
  className,
  onPreviousCall,
  onNextCall,
  hasPreviousCall = false,
  hasNextCall = false,
}: TranscriptPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const transcriptContainerRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef<(HTMLDivElement | null)[]>([])

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [activeMessageIndex, setActiveMessageIndex] = useState(-1)
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true)
  
  // Use ref to track auto-scroll state for immediate effect in callbacks
  const isAutoScrollEnabledRef = useRef(isAutoScrollEnabled)
  isAutoScrollEnabledRef.current = isAutoScrollEnabled
  
  // Helper to get the scroll viewport element from ScrollArea
  const getScrollViewport = useCallback(() => {
    if (scrollAreaRef.current) {
      return scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement | null
    }
    return null
  }, [])

  // Parse messages
  const messages: TranscriptMessage[] = transcriptMessages?.length
    ? transcriptMessages.filter((m) => m.role === "assistant" || m.role === "user")
    : transcript
      ? parseTranscriptToMessages(transcript)
      : []

  // Track last scroll time to prevent too frequent scrolling
  const lastScrollTimeRef = useRef<number>(0)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Handle audio time update with improved sync
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    // Use a more frequent update interval for better sync at all speeds
    let animationFrameId: number | null = null
    let lastUpdateTime = 0
    
    const updateTranscriptSync = () => {
      if (!audio) return
      
      const currentAudioTime = audio.currentTime
      setCurrentTime(currentAudioTime)

      // Find active message based on current time
      if (messages.length > 0) {
        let newActiveIndex = -1

        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i]
          if (!msg) continue
          const startTime = msg.secondsFromStart ?? msg.time ?? 0
          const nextMsg = messages[i + 1]
          const endTime = msg.endTime ?? (nextMsg?.secondsFromStart ?? nextMsg?.time ?? duration)

          if (currentAudioTime >= startTime && currentAudioTime < endTime) {
            newActiveIndex = i
            break
          }
        }

        // If we've passed all messages, show the last one
        if (newActiveIndex === -1 && messages.length > 0) {
          const lastMsg = messages[messages.length - 1]
          const lastStartTime = lastMsg?.secondsFromStart ?? lastMsg?.time ?? 0
          if (currentAudioTime >= lastStartTime) {
            newActiveIndex = messages.length - 1
          }
        }

        if (newActiveIndex !== activeMessageIndex) {
          setActiveMessageIndex(newActiveIndex)

                          // Auto-scroll to active message with debouncing based on playback rate
                          // Use ref for immediate response when toggling auto-scroll off
                          // IMPORTANT: Scroll only within the chat container, not the entire page
                          if (isAutoScrollEnabledRef.current && newActiveIndex >= 0 && messageRefs.current[newActiveIndex]) {
                            const now = Date.now()
                            // Adjust scroll frequency based on playback rate - faster playback = more responsive scrolling
                            const minScrollInterval = Math.max(100, 300 / playbackRate)
                            
                            if (now - lastScrollTimeRef.current >= minScrollInterval) {
                              lastScrollTimeRef.current = now
                              
                              // Clear any pending scroll
                              if (scrollTimeoutRef.current) {
                                clearTimeout(scrollTimeoutRef.current)
                              }
                              
                              // Scroll within the ScrollArea viewport only (not affecting page scroll)
                              const messageElement = messageRefs.current[newActiveIndex]
                              const scrollViewport = getScrollViewport()
                              const transcriptContainer = transcriptContainerRef.current
                              
                              if (messageElement && scrollViewport && transcriptContainer) {
                                // Calculate the scroll position to center the message in the viewport
                                // We need to get the message position relative to the transcript container
                                const messageOffsetTop = messageElement.offsetTop - transcriptContainer.offsetTop
                                const viewportHeight = scrollViewport.clientHeight
                                const messageHeight = messageElement.clientHeight
                                const scrollTarget = messageOffsetTop - (viewportHeight / 2) + (messageHeight / 2)
                                
                                // Use smooth scroll for normal speed, instant for fast playback
                                scrollViewport.scrollTo({
                                  top: Math.max(0, scrollTarget),
                                  behavior: playbackRate >= 1.5 ? "auto" : "smooth"
                                })
                              }
                            }
                          }
        }
      }
    }

    const handleTimeUpdate = () => {
      // Throttle updates based on playback rate
      const now = performance.now()
      const updateInterval = Math.max(16, 50 / playbackRate) // More frequent at higher speeds
      
      if (now - lastUpdateTime >= updateInterval) {
        lastUpdateTime = now
        updateTranscriptSync()
      }
    }

    // Use requestAnimationFrame for smoother updates at high playback speeds
    const rafUpdate = () => {
      if (audio && !audio.paused) {
        updateTranscriptSync()
        animationFrameId = requestAnimationFrame(rafUpdate)
      }
    }

    const handlePlay = () => {
      animationFrameId = requestAnimationFrame(rafUpdate)
    }

    const handlePause = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
    }

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
    }

    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("loadedmetadata", handleLoadedMetadata)
    audio.addEventListener("ended", handleEnded)
    audio.addEventListener("play", handlePlay)
    audio.addEventListener("pause", handlePause)

    // Start RAF loop if already playing
    if (!audio.paused) {
      animationFrameId = requestAnimationFrame(rafUpdate)
    }

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      audio.removeEventListener("ended", handleEnded)
      audio.removeEventListener("play", handlePlay)
      audio.removeEventListener("pause", handlePause)
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [messages, activeMessageIndex, duration, playbackRate])

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  // Seek to time
  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = time
    setCurrentTime(time)
  }, [])

  // Skip forward/backward
  const skip = useCallback((seconds: number) => {
    const audio = audioRef.current
    if (!audio) return

    const newTime = Math.max(0, Math.min(duration, audio.currentTime + seconds))
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }, [duration])

  // Change volume
  const changeVolume = useCallback((newVolume: number) => {
    const audio = audioRef.current
    if (!audio) return

    audio.volume = newVolume
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }, [])

  // Toggle mute
  const toggleMute = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isMuted) {
      audio.volume = volume || 0.5
      setIsMuted(false)
    } else {
      audio.volume = 0
      setIsMuted(true)
    }
  }, [isMuted, volume])

  // Change playback rate
  const changePlaybackRate = useCallback((rate: number) => {
    const audio = audioRef.current
    if (!audio) return

    audio.playbackRate = rate
    setPlaybackRate(rate)
  }, [])

  // Click on message to seek
  const handleMessageClick = useCallback((index: number) => {
    const msg = messages[index]
    if (!msg || !recordingUrl) return

    const time = msg.secondsFromStart ?? msg.time ?? 0
    seekTo(time)

    // Start playing if not already
    if (!isPlaying && audioRef.current) {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }, [messages, recordingUrl, seekTo, isPlaying])

  // No content available
  if (!recordingUrl && messages.length === 0 && !transcript) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Headphones className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No recording or transcript available for this call.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Headphones className="h-5 w-5" />
            Call Recording & Transcript
          </CardTitle>
          
          {/* Call Navigation - Always visible */}
          {(onPreviousCall || onNextCall) && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={onPreviousCall}
                disabled={!hasPreviousCall || !onPreviousCall}
                title="Previous call"
                className="h-8"
              >
                <SkipBack className="h-4 w-4 mr-1" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onNextCall}
                disabled={!hasNextCall || !onNextCall}
                title="Next call"
                className="h-8"
              >
                Next
                <SkipForward className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Audio Player */}
        {recordingUrl && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <audio ref={audioRef} src={recordingUrl} preload="metadata" />

            {/* Progress bar */}
            <div className="space-y-1">
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={0.1}
                onValueChange={([value]) => seekTo(value ?? 0)}
                className="cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Audio Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Play/Pause */}
                <Button
                  variant="default"
                  size="sm"
                  onClick={togglePlayPause}
                  className="rounded-full w-10 h-10"
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5 ml-0.5" />
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-4">
                {/* Playback rate */}
                <div className="flex items-center gap-1">
                  {[0.5, 1, 1.5, 2].map((rate) => (
                    <Button
                      key={rate}
                      variant={playbackRate === rate ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => changePlaybackRate(rate)}
                    >
                      {rate}x
                    </Button>
                  ))}
                </div>

                {/* Volume */}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={toggleMute}>
                    {isMuted ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </Button>
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    max={1}
                    step={0.1}
                    onValueChange={([v]) => changeVolume(v ?? 0)}
                    className="w-20"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Auto-scroll toggle */}
        {messages.length > 0 && recordingUrl && (
          <div className="flex items-center justify-between px-1">
            <span className="text-sm text-muted-foreground">Transcript</span>
            <Button
              variant={isAutoScrollEnabled ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setIsAutoScrollEnabled(!isAutoScrollEnabled)}
              className="text-xs h-7"
            >
              Auto-scroll: {isAutoScrollEnabled ? "On" : "Off"}
            </Button>
          </div>
        )}

        {/* Chat-style Transcript Messages */}
        {messages.length > 0 ? (
          <ScrollArea className="h-[400px]" ref={scrollAreaRef}>
            <div 
              ref={transcriptContainerRef}
              className="flex flex-col gap-6 p-6 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800"
            >
              {messages.map((msg, index) => {
                const rawContent = msg.message || msg.content || ""
                // Detect actual role from content (handles "Customer:" prefix in agent messages)
                const { role: actualRole, cleanContent } = detectActualRole(rawContent, msg.role)
                const isUser = actualRole === "user"
                const isActive = index === activeMessageIndex
                const timestamp = msg.secondsFromStart ?? msg.time

                return (
                  <div
                    key={index}
                    ref={(el) => {
                      messageRefs.current[index] = el
                    }}
                    onClick={() => handleMessageClick(index)}
                    className={cn(
                      "flex flex-col cursor-pointer transition-all max-w-[80%]",
                      isUser ? "ml-auto items-end" : "mr-auto items-start"
                    )}
                  >
                    {/* Icon Above Message */}
                    <div className={cn(
                      "flex items-center gap-2 mb-2",
                      isUser ? "flex-row-reverse" : "flex-row"
                    )}>
                      {/* Avatar Icon */}
                      <div
                        className={cn(
                          "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center shadow-lg",
                          isUser
                            ? "bg-gradient-to-br from-emerald-400 to-emerald-600"
                            : "bg-gradient-to-br from-violet-500 to-purple-600"
                        )}
                      >
                        {isUser ? (
                          <User className="h-5 w-5 text-white" />
                        ) : (
                          <Bot className="h-5 w-5 text-white" />
                        )}
                      </div>
                      
                      {/* Sender Name */}
                      <span className={cn(
                        "text-xs font-semibold uppercase tracking-wide",
                        isUser 
                          ? "text-emerald-600 dark:text-emerald-400" 
                          : "text-violet-600 dark:text-violet-400"
                      )}>
                        {isUser ? "Human" : "Agent"}
                      </span>
                      
                      {/* Timestamp */}
                      {timestamp !== undefined && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(timestamp)}
                        </span>
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div
                      className={cn(
                        "relative px-4 py-3 rounded-2xl shadow-md transition-all",
                        // User messages: Green/Emerald - Right aligned
                        isUser && "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-tr-sm",
                        // Agent messages: White/Light - Left aligned  
                        !isUser && "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-sm border border-slate-200 dark:border-slate-700",
                        // Active highlight
                        isActive && "ring-2 ring-offset-2 ring-offset-slate-100 dark:ring-offset-slate-900 ring-amber-400 scale-[1.02] shadow-lg",
                        !isActive && "hover:shadow-lg hover:scale-[1.01]"
                      )}
                    >
                      <p className={cn(
                        "text-sm leading-relaxed",
                        isActive && "font-medium"
                      )}>
                        {cleanContent}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        ) : transcript ? (
          /* Plain text transcript fallback */
          <ScrollArea className="h-[400px]">
            <div className="p-6 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-slate-700 dark:text-slate-300">
                {transcript}
              </pre>
            </div>
          </ScrollArea>
        ) : null}
      </CardContent>
    </Card>
  )
}

