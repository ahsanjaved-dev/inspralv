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
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function parseTranscriptToMessages(transcript: string): TranscriptMessage[] {
  // Try to parse lines like "Agent: Hello" or "User: Hi"
  const lines = transcript.split("\n").filter((line) => line.trim())
  return lines.map((line, index) => {
    const match = line.match(/^(Agent|User|Assistant|Bot):\s*(.*)$/i)
    if (match && match[1] && match[2] !== undefined) {
      const role = match[1].toLowerCase() === "user" ? "user" : "assistant"
      return {
        role,
        message: match[2],
        secondsFromStart: index * 5, // Estimate 5 seconds per message
      }
    }
    return {
      role: "assistant" as const,
      message: line,
      secondsFromStart: index * 5,
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
}: TranscriptPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef<(HTMLDivElement | null)[]>([])

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [activeMessageIndex, setActiveMessageIndex] = useState(-1)
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true)

  // Parse messages
  const messages: TranscriptMessage[] = transcriptMessages?.length
    ? transcriptMessages.filter((m) => m.role === "assistant" || m.role === "user")
    : transcript
      ? parseTranscriptToMessages(transcript)
      : []

  // Handle audio time update
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)

      // Find active message based on current time
      if (messages.length > 0) {
        const time = audio.currentTime
        let newActiveIndex = -1

        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i]
          if (!msg) continue
          const startTime = msg.secondsFromStart ?? msg.time ?? 0
          const nextMsg = messages[i + 1]
          const endTime = msg.endTime ?? (nextMsg?.secondsFromStart ?? nextMsg?.time ?? duration)

          if (time >= startTime && time < endTime) {
            newActiveIndex = i
            break
          }
        }

        if (newActiveIndex !== activeMessageIndex) {
          setActiveMessageIndex(newActiveIndex)

          // Auto-scroll to active message
          if (isAutoScrollEnabled && newActiveIndex >= 0 && messageRefs.current[newActiveIndex]) {
            messageRefs.current[newActiveIndex]?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            })
          }
        }
      }
    }

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }

    const handleEnded = () => {
      setIsPlaying(false)
    }

    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("loadedmetadata", handleLoadedMetadata)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [messages, activeMessageIndex, duration, isAutoScrollEnabled])

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
        <CardTitle className="text-lg flex items-center gap-2">
          <Headphones className="h-5 w-5" />
          Call Recording & Transcript
        </CardTitle>
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

            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Skip back */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => skip(-10)}
                  title="Skip back 10 seconds"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>

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

                {/* Skip forward */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => skip(10)}
                  title="Skip forward 10 seconds"
                >
                  <SkipForward className="h-4 w-4" />
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

        {/* Transcript Messages */}
        {messages.length > 0 ? (
          <ScrollArea className="h-[400px] pr-4" ref={scrollAreaRef}>
            <div className="space-y-3">
              {messages.map((msg, index) => {
                const isUser = msg.role === "user"
                const isActive = index === activeMessageIndex
                const content = msg.message || msg.content || ""
                const timestamp = msg.secondsFromStart ?? msg.time

                return (
                  <div
                    key={index}
                    ref={(el) => {
                      messageRefs.current[index] = el
                    }}
                    onClick={() => handleMessageClick(index)}
                    className={cn(
                      "flex gap-3 p-3 rounded-lg transition-all cursor-pointer",
                      isUser
                        ? "flex-row-reverse bg-primary/5"
                        : "bg-muted/50",
                      isActive && "ring-2 ring-primary bg-primary/10",
                      !isActive && "hover:bg-muted"
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      )}
                    >
                      {isUser ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>

                    {/* Content */}
                    <div className={cn("flex-1 space-y-1", isUser && "text-right")}>
                      <div className="flex items-center gap-2">
                        {!isUser && (
                          <span className="text-xs font-medium text-muted-foreground">
                            Agent
                          </span>
                        )}
                        {timestamp !== undefined && (
                          <Badge variant="outline" className="text-xs h-5">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatTime(timestamp)}
                          </Badge>
                        )}
                        {isUser && (
                          <span className="text-xs font-medium text-muted-foreground">
                            Customer
                          </span>
                        )}
                      </div>
                      <p className={cn(
                        "text-sm leading-relaxed",
                        isActive && "font-medium"
                      )}>
                        {content}
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
            <pre className="text-sm whitespace-pre-wrap font-sans p-4 bg-muted rounded-lg">
              {transcript}
            </pre>
          </ScrollArea>
        ) : null}
      </CardContent>
    </Card>
  )
}

