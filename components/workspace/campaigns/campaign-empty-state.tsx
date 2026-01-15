"use client"

/**
 * Campaign Empty State Component
 * 
 * A beautiful, animated empty state with:
 * - Animated illustration
 * - Feature highlights
 * - Quick action button
 */

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  Phone,
  Plus,
  Users,
  Zap,
  Clock,
  BarChart3,
  Bot,
  PhoneCall,
  CheckCircle2,
} from "lucide-react"

interface CampaignEmptyStateProps {
  onCreateCampaign: () => void
  isCreating?: boolean
  title?: string
  description?: string
  className?: string
}

// Animated illustration
function CampaignIllustration() {
  return (
    <div className="relative w-48 h-48 mx-auto">
      {/* Background circles */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/10 to-purple-500/10"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute inset-4 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20"
        animate={{
          scale: [1.1, 1, 1.1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.5,
        }}
      />

      {/* Center icon */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{
          y: [0, -5, 0],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <div className="p-6 bg-gradient-to-br from-primary to-purple-600 rounded-2xl shadow-xl shadow-primary/20">
          <Phone className="h-12 w-12 text-white" />
        </div>
      </motion.div>

      {/* Floating elements */}
      <motion.div
        className="absolute top-4 right-4"
        animate={{
          y: [0, -8, 0],
          x: [0, 4, 0],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.2,
        }}
      >
        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-4 left-4"
        animate={{
          y: [0, 8, 0],
          x: [0, -4, 0],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.4,
        }}
      >
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shadow-sm">
          <Users className="h-5 w-5 text-blue-600" />
        </div>
      </motion.div>

      <motion.div
        className="absolute top-8 left-0"
        animate={{
          y: [0, 6, 0],
          x: [0, -6, 0],
        }}
        transition={{
          duration: 3.5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.6,
        }}
      >
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg shadow-sm">
          <Bot className="h-5 w-5 text-purple-600" />
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-8 right-0"
        animate={{
          y: [0, -6, 0],
          x: [0, 6, 0],
        }}
        transition={{
          duration: 3.5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.8,
        }}
      >
        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg shadow-sm">
          <Zap className="h-5 w-5 text-amber-600" />
        </div>
      </motion.div>
    </div>
  )
}

// Feature card
function FeatureCard({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode
  title: string
  description: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
    >
      <div className="p-2 bg-primary/10 rounded-lg shrink-0">{icon}</div>
      <div>
        <h4 className="font-medium text-sm">{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </motion.div>
  )
}

export function CampaignEmptyState({
  onCreateCampaign,
  isCreating = false,
  title = "No campaigns yet",
  description = "Create your first calling campaign to start reaching your leads with AI-powered outbound calls.",
  className,
}: CampaignEmptyStateProps) {
  const features = [
    {
      icon: <Users className="h-4 w-4 text-primary" />,
      title: "Bulk Outreach",
      description: "Import thousands of contacts and reach them efficiently",
    },
    {
      icon: <Bot className="h-4 w-4 text-primary" />,
      title: "AI-Powered Calls",
      description: "Your AI agents handle conversations intelligently",
    },
    {
      icon: <Clock className="h-4 w-4 text-primary" />,
      title: "Smart Scheduling",
      description: "Set business hours and optimal calling times",
    },
    {
      icon: <BarChart3 className="h-4 w-4 text-primary" />,
      title: "Real-time Analytics",
      description: "Track progress and outcomes live",
    },
  ]

  return (
    <Card className={cn("border-dashed bg-gradient-to-b from-background to-muted/20", className)}>
      <CardContent className="py-12 px-6">
        <div className="max-w-2xl mx-auto">
          {/* Illustration */}
          <CampaignIllustration />

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="text-center mt-8 mb-8"
          >
            <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">{description}</p>
          </motion.div>

          {/* Features grid */}
          <div className="grid sm:grid-cols-2 gap-3 mb-8">
            {features.map((feature, index) => (
              <FeatureCard key={feature.title} {...feature} delay={0.3 + index * 0.1} />
            ))}
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.7 }}
            className="flex justify-center"
          >
            <Button
              size="lg"
              onClick={onCreateCampaign}
              disabled={isCreating}
              className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg shadow-primary/20"
            >
              {isCreating ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5 mr-2" />
                  Create Your First Campaign
                </>
              )}
            </Button>
          </motion.div>
        </div>
      </CardContent>
    </Card>
  )
}

// Compact empty state for filtered views
export function CampaignEmptyStateCompact({
  message = "No campaigns match your filter",
  onClear,
}: {
  message?: string
  onClear?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-4 bg-muted/50 rounded-full mb-4">
        <Phone className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground">{message}</p>
      {onClear && (
        <Button variant="link" onClick={onClear} className="mt-2">
          Clear filters
        </Button>
      )}
    </div>
  )
}

