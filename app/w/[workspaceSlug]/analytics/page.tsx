"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Phone,
  Clock,
  DollarSign,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Download,
  RefreshCw,
  Calendar,
  Smile,
  Meh,
  Frown,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspaceAnalytics, formatDurationShort } from "@/lib/hooks/use-workspace-analytics"
import { useToast } from "@/lib/hooks/use-toast"

interface AnalyticsPageProps {}

export default function WorkspaceAnalyticsPage(props: AnalyticsPageProps) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const baseUrl = `/w/${workspaceSlug}`
  const { success: showSuccess, error: showError } = useToast()
  const [isExporting, setIsExporting] = useState(false)

  const [dateRange, setDateRange] = useState("7")
  const [selectedAgent, setSelectedAgent] = useState("all")
  const [chartType, setChartType] = useState<"calls" | "duration" | "cost">("calls")

  // Fetch real analytics data
  const { data: analyticsData, isLoading, error, refetch } = useWorkspaceAnalytics()

  // Get filtered data based on selected agent
  const getFilteredData = () => {
    if (!analyticsData) return null
    
    if (selectedAgent === "all") {
      return analyticsData
    }

    const selectedAgentData = analyticsData.agents.find((a) => a.id === selectedAgent)
    if (!selectedAgentData) return null

    // Calculate filtered summary based on selected agent
    const agentCallsByDate: Record<string, { count: number; cost: number; duration: number }> = {}
    Object.entries(analyticsData.trends.calls_by_date || {}).forEach(([date, data]) => {
      agentCallsByDate[date] = data
    })

    const filteredSummary = {
      total_calls: selectedAgentData.total_calls,
      completed_calls: selectedAgentData.completed_calls,
      success_rate: selectedAgentData.success_rate,
      total_minutes: selectedAgentData.total_minutes,
      total_cost: selectedAgentData.total_cost,
      avg_cost_per_call: selectedAgentData.total_calls > 0 ? selectedAgentData.total_cost / selectedAgentData.total_calls : 0,
      sentiment: selectedAgentData.sentiment,
      sentiment_distribution: selectedAgentData.sentiment_distribution,
      avg_sentiment_score: Math.round(
        ((selectedAgentData.sentiment.positive * 1 + selectedAgentData.sentiment.neutral * 0.5 + selectedAgentData.sentiment.negative * 0) / 
        (selectedAgentData.sentiment.positive + selectedAgentData.sentiment.negative + selectedAgentData.sentiment.neutral || 1)) * 100
      ),
    }

    return {
      agents: analyticsData.agents,
      summary: filteredSummary,
      trends: { calls_by_date: agentCallsByDate },
    }
  }

  const filteredData = getFilteredData()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !analyticsData || !filteredData) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-title">Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Track and analyze your voice agent performance.
            </p>
          </div>
        </div>
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="p-4">
            <p className="text-destructive">Failed to load analytics data. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { summary, agents, trends } = filteredData
  const callsByDate = Object.entries(trends.calls_by_date || {}).map(([label, data]) => ({
    label,
    count: data.count,
    duration: data.duration,
    cost: data.cost,
  }))

  // Calculate sentiment percentages
  const sentimentTotal =
    summary.sentiment.positive + summary.sentiment.negative + summary.sentiment.neutral
  const sentimentPositivePercent = sentimentTotal > 0
    ? Math.round((summary.sentiment.positive / sentimentTotal) * 100)
    : 0
  const sentimentNeutralPercent = sentimentTotal > 0
    ? Math.round((summary.sentiment.neutral / sentimentTotal) * 100)
    : 0
  const sentimentNegativePercent = sentimentTotal > 0
    ? Math.round((summary.sentiment.negative / sentimentTotal) * 100)
    : 0

  // SVG gauge calculations
  const circumference = 2 * Math.PI * 40
  const positiveArc = (sentimentPositivePercent / 100) * circumference
  const neutralArc = (sentimentNeutralPercent / 100) * circumference
  const negativeArc = (sentimentNegativePercent / 100) * circumference

  // Get max for chart scaling
  const maxCount = Math.max(...callsByDate.map((d) => d.count), 1)
  const maxDuration = Math.max(...callsByDate.map((d) => d.duration / 60), 1)
  const maxCost = Math.max(...callsByDate.map((d) => d.cost), 1)

  // Export to PDF with charts
  const handleExportPDF = async () => {
    try {
      setIsExporting(true)

      // Import jsPDF and autotable dynamically
      const { jsPDF } = await import("jspdf")
      const autoTableModule = await import("jspdf-autotable")
      const autoTable = autoTableModule.default

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const selectedAgentName = selectedAgent === "all" 
        ? "All Agents" 
        : agents.find((a) => a.id === selectedAgent)?.name || "Unknown"

      // ========== Helper: Create professional bar chart using Canvas ==========
      const createBarChartImage = (
        data: { label: string; value: number }[],
        title: string,
        color: string,
        gradientEnd: string
      ): string => {
        const canvas = document.createElement("canvas")
        const width = 800
        const height = 300
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")!

        // Background
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, width, height)

        const padding = { top: 50, right: 30, bottom: 60, left: 60 }
        const chartWidth = width - padding.left - padding.right
        const chartHeight = height - padding.top - padding.bottom
        const maxValue = Math.max(...data.map((d) => d.value), 1)

        // Title
        ctx.fillStyle = "#1f2937"
        ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        ctx.fillText(title, padding.left, 30)

        // Grid lines
        ctx.strokeStyle = "#e5e7eb"
        ctx.lineWidth = 1
        const gridLines = 5
        for (let i = 0; i <= gridLines; i++) {
          const y = padding.top + (chartHeight / gridLines) * i
          ctx.beginPath()
          ctx.moveTo(padding.left, y)
          ctx.lineTo(width - padding.right, y)
          ctx.stroke()

          // Y-axis labels
          const value = Math.round(maxValue - (maxValue / gridLines) * i)
          ctx.fillStyle = "#6b7280"
          ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          ctx.textAlign = "right"
          ctx.fillText(String(value), padding.left - 10, y + 4)
        }

        // Draw bars
        const barCount = data.length
        const barGap = 8
        const barWidth = Math.min((chartWidth - barGap * (barCount + 1)) / barCount, 50)
        const totalBarsWidth = barCount * barWidth + (barCount - 1) * barGap
        const startX = padding.left + (chartWidth - totalBarsWidth) / 2

        data.forEach((item, index) => {
          const barHeight = (item.value / maxValue) * chartHeight
          const x = startX + index * (barWidth + barGap)
          const y = padding.top + chartHeight - barHeight

          // Bar gradient
          const gradient = ctx.createLinearGradient(x, y, x, y + barHeight)
          gradient.addColorStop(0, color)
          gradient.addColorStop(1, gradientEnd)

          // Shadow
          ctx.shadowColor = "rgba(0,0,0,0.1)"
          ctx.shadowBlur = 4
          ctx.shadowOffsetY = 2

          // Rounded rectangle
          const radius = Math.min(barWidth / 4, 6)
          ctx.beginPath()
          ctx.moveTo(x + radius, y)
          ctx.lineTo(x + barWidth - radius, y)
          ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius)
          ctx.lineTo(x + barWidth, y + barHeight)
          ctx.lineTo(x, y + barHeight)
          ctx.lineTo(x, y + radius)
          ctx.quadraticCurveTo(x, y, x + radius, y)
          ctx.closePath()
          ctx.fillStyle = gradient
          ctx.fill()

          // Reset shadow
          ctx.shadowColor = "transparent"
          ctx.shadowBlur = 0
          ctx.shadowOffsetY = 0

          // Value on top
          ctx.fillStyle = "#374151"
          ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          ctx.textAlign = "center"
          const displayValue = item.value % 1 === 0 ? String(item.value) : item.value.toFixed(2)
          ctx.fillText(displayValue, x + barWidth / 2, y - 8)

          // Label below
          ctx.fillStyle = "#6b7280"
          ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          ctx.save()
          ctx.translate(x + barWidth / 2, height - padding.bottom + 15)
          ctx.rotate(-0.4) // Slight angle for readability
          ctx.textAlign = "right"
          const label = item.label.length > 10 ? item.label.slice(0, 9) + "…" : item.label
          ctx.fillText(label, 0, 0)
          ctx.restore()
        })

        // X and Y axis lines
        ctx.strokeStyle = "#d1d5db"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(padding.left, padding.top)
        ctx.lineTo(padding.left, height - padding.bottom)
        ctx.lineTo(width - padding.right, height - padding.bottom)
        ctx.stroke()

        return canvas.toDataURL("image/png")
      }

      // ========== Helper: Create donut chart using Canvas ==========
      const createDonutChartImage = (
        data: { label: string; value: number; color: string }[],
        title: string
      ): string => {
        const canvas = document.createElement("canvas")
        const size = 280
        canvas.width = size
        canvas.height = size + 80 // Extra space for legend
        const ctx = canvas.getContext("2d")!

        // Background
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        const centerX = size / 2
        const centerY = size / 2
        const outerRadius = 90
        const innerRadius = 55
        const total = data.reduce((sum, d) => sum + d.value, 0)

        if (total === 0) return canvas.toDataURL("image/png")

        // Title
        ctx.fillStyle = "#1f2937"
        ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(title, centerX, 20)

        let currentAngle = -Math.PI / 2

        // Draw slices
        data.forEach((item) => {
          if (item.value === 0) return
          const sliceAngle = (item.value / total) * 2 * Math.PI

          ctx.beginPath()
          ctx.arc(centerX, centerY, outerRadius, currentAngle, currentAngle + sliceAngle)
          ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true)
          ctx.closePath()
          ctx.fillStyle = item.color
          ctx.fill()

          // Add subtle shadow between slices
          ctx.strokeStyle = "#ffffff"
          ctx.lineWidth = 2
          ctx.stroke()

          currentAngle += sliceAngle
        })

        // Center text
        ctx.fillStyle = "#1f2937"
        ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(String(total), centerX, centerY - 8)
        ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        ctx.fillStyle = "#6b7280"
        ctx.fillText("Total", centerX, centerY + 12)

        // Legend
        let legendY = size + 10
        const legendX = 20
        data.forEach((item, i) => {
          if (item.value === 0) return
          const percent = Math.round((item.value / total) * 100)

          // Color box
          ctx.fillStyle = item.color
          ctx.beginPath()
          ctx.arc(legendX + 6, legendY + 6, 6, 0, Math.PI * 2)
          ctx.fill()

          // Label
          ctx.fillStyle = "#374151"
          ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          ctx.textAlign = "left"
          ctx.textBaseline = "middle"
          ctx.fillText(`${item.label}: ${item.value} (${percent}%)`, legendX + 18, legendY + 6)

          legendY += 22
        })

        return canvas.toDataURL("image/png")
      }

      // ========== PAGE 1: Summary & Stats ==========
      
      // Title
      doc.setFontSize(22)
      doc.setTextColor(59, 130, 246)
      doc.text("Analytics Report", 14, 20)

      // Subtitle / metadata
      doc.setFontSize(10)
      doc.setTextColor(100)
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28)
      doc.text(`Agent: ${selectedAgentName}`, 14, 34)

      let yPosition = 44

      // Summary Statistics Table
      doc.setTextColor(0)
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text("Summary Statistics", 14, yPosition)
      yPosition += 6

      const statsData = [
        ["Total Calls", summary.total_calls.toLocaleString()],
        ["Completed Calls", summary.completed_calls.toLocaleString()],
        ["Success Rate", `${summary.success_rate.toFixed(1)}%`],
        ["Total Duration", formatDurationShort(summary.total_minutes * 60)],
        ["Total Cost", `$${summary.total_cost.toFixed(2)}`],
        ["Avg Cost/Call", `$${summary.avg_cost_per_call.toFixed(2)}`],
      ]

      autoTable(doc, {
        startY: yPosition,
        head: [["Metric", "Value"]],
        body: statsData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: "bold" } },
        margin: { left: 14, right: pageWidth / 2 + 10 },
        tableWidth: 70,
      })

      // Sentiment Donut Chart (right side of page 1)
      const sentimentChartData = [
        { label: "Positive", value: summary.sentiment.positive, color: "#22c55e" },
        { label: "Neutral", value: summary.sentiment.neutral, color: "#fbbf24" },
        { label: "Negative", value: summary.sentiment.negative, color: "#ef4444" },
      ]
      const donutImg = createDonutChartImage(sentimentChartData, "Sentiment Distribution")
      doc.addImage(donutImg, "PNG", pageWidth - 75, 42, 60, 72)

      yPosition = (doc as any).lastAutoTable.finalY + 15

      // ========== Agent Performance Section ==========
      if (agents.length > 0) {
        doc.setFontSize(12)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(0)
        doc.text("Agent Performance", 14, yPosition)
        yPosition += 6

        const agentTableData = agents.map((agent) => [
          agent.name,
          agent.total_calls.toLocaleString(),
          agent.completed_calls.toLocaleString(),
          `${agent.success_rate.toFixed(1)}%`,
          formatDurationShort(agent.total_minutes * 60),
          `$${agent.total_cost.toFixed(2)}`,
        ])

        autoTable(doc, {
          startY: yPosition,
          head: [["Agent", "Total", "Completed", "Success", "Duration", "Cost"]],
          body: agentTableData,
          theme: "striped",
          headStyles: { fillColor: [147, 51, 234], textColor: 255, fontSize: 8 },
          styles: { fontSize: 8, cellPadding: 2 },
          margin: { left: 14, right: 14 },
        })

        yPosition = (doc as any).lastAutoTable.finalY + 15

        // Agent Calls Bar Chart
        if (agents.length <= 10) {
          const agentChartData = agents.map((agent) => ({
            label: agent.name,
            value: agent.total_calls,
          }))
          
          if (yPosition > 200) {
            doc.addPage()
            yPosition = 20
          }
          
          const agentBarImg = createBarChartImage(agentChartData, "Calls by Agent", "#9333ea", "#c084fc")
          doc.addImage(agentBarImg, "PNG", 14, yPosition, pageWidth - 28, 60)
          yPosition += 75
        }
      }

      // ========== PAGE 2: Trends & Charts ==========
      if (callsByDate.length > 0) {
        doc.addPage()
        yPosition = 20

        doc.setFontSize(16)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(59, 130, 246)
        doc.text("Daily Trends", 14, yPosition)
        yPosition += 15

        // Prepare chart data (limit to last 14 days for readability)
        const chartData = callsByDate.slice(-14)

        // Daily Call Volume Chart
        const callsChartData = chartData.map((day) => ({
          label: day.label.slice(5), // Remove year part for shorter labels
          value: day.count,
        }))
        const callsBarImg = createBarChartImage(callsChartData, "Daily Call Volume", "#3b82f6", "#93c5fd")
        doc.addImage(callsBarImg, "PNG", 14, yPosition, pageWidth - 28, 70)
        yPosition += 85

        // Daily Cost Chart
        const costChartData = chartData.map((day) => ({
          label: day.label.slice(5),
          value: Math.round(day.cost * 100) / 100,
        }))
        const costBarImg = createBarChartImage(costChartData, "Daily Cost ($)", "#22c55e", "#86efac")
        doc.addImage(costBarImg, "PNG", 14, yPosition, pageWidth - 28, 70)
        yPosition += 85

        // Daily Duration Chart
        const durationChartData = chartData.map((day) => ({
          label: day.label.slice(5),
          value: Math.round(day.duration / 60), // Convert to minutes
        }))
        const durationBarImg = createBarChartImage(durationChartData, "Daily Duration (min)", "#fb923c", "#fed7aa")
        doc.addImage(durationBarImg, "PNG", 14, yPosition, pageWidth - 28, 70)
        yPosition += 85

        // Trends table on a new page if needed
        if (yPosition > 180) {
          doc.addPage()
          yPosition = 20
        }

        doc.setFontSize(12)
        doc.setFont("helvetica", "bold")
        doc.setTextColor(0)
        doc.text("Detailed Daily Data", 14, yPosition)
        yPosition += 6

        const trendsTableData = callsByDate.map((day) => [
          day.label,
          day.count.toLocaleString(),
          formatDurationShort(day.duration),
          `$${day.cost.toFixed(2)}`,
        ])

        autoTable(doc, {
          startY: yPosition,
          head: [["Date", "Calls", "Duration", "Cost"]],
          body: trendsTableData,
          theme: "striped",
          headStyles: { fillColor: [251, 146, 60], textColor: 255, fontSize: 9 },
          styles: { fontSize: 8, cellPadding: 2 },
          margin: { left: 14, right: 14 },
          tableWidth: 120,
        })
      }

      // Footer on all pages
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setTextColor(150)
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth - 25,
          doc.internal.pageSize.getHeight() - 10
        )
      }

      // Save PDF
      doc.save(`analytics-${selectedAgentName.replace(/\s+/g, "-")}-${Date.now()}.pdf`)

      showSuccess("Analytics exported to PDF successfully")
    } catch (error) {
      console.error("PDF export error:", error)
      showError("Failed to export PDF")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Track and analyze your voice agent performance.
          </p>
        </div>
        <Button 
          variant="outline"
          onClick={handleExportPDF}
          disabled={isExporting}
        >
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </>
          )}
        </Button>
      </div>

      {/* Filters Row */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            {/* Date Range */}
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-full md:w-44">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>

            {/* Agent Filter */}
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Refresh Button */}
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-auto"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Content */}
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Calls */}
          <Card className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">Total Calls</p>
                <p className="stat-value">{summary.total_calls.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Phone className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="stat-trend positive">
              <TrendingUp className="w-3 h-3" />
              <span>Real-time data</span>
            </div>
          </Card>

          {/* Total Duration */}
          <Card className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">Total Duration</p>
                <p className="stat-value">{formatDurationShort(summary.total_minutes * 60)}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-cyan-600" />
              </div>
            </div>
            <div className="stat-trend positive">
              <TrendingUp className="w-3 h-3" />
              <span>{summary.total_minutes.toLocaleString()} minutes</span>
            </div>
          </Card>

          {/* Avg Cost/Call */}
          <Card className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">Avg Cost/Call</p>
                <p className="stat-value">${summary.avg_cost_per_call.toFixed(2)}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-amber-600" />
              </div>
            </div>
            <div className="stat-trend positive">
              <TrendingDown className="w-3 h-3" />
              <span>Total: ${summary.total_cost.toFixed(2)}</span>
            </div>
          </Card>

          {/* Success Rate */}
          <Card className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">Success Rate</p>
                <p className="stat-value">{summary.success_rate.toFixed(1)}%</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <div className="stat-trend positive">
              <TrendingUp className="w-3 h-3" />
              <span>{summary.completed_calls} completed</span>
            </div>
          </Card>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Calls Over Time */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Calls Over Time</CardTitle>
                <div className="flex gap-1 p-1 bg-muted rounded-lg">
                  {(["calls", "duration", "cost"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setChartType(type)}
                      className={cn(
                        "px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize",
                        chartType === type
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Simple CSS-based chart visualization */}
              <div className="h-72 flex items-end justify-between gap-2 pt-8 pb-4">
                {callsByDate.length > 0 ? (
                  callsByDate.map((day, idx) => {
                    const value = chartType === "calls" ? day.count : chartType === "duration" ? day.duration / 60 : day.cost
                    const maxVal = chartType === "calls" ? maxCount : chartType === "duration" ? maxDuration : maxCost
                    const height = maxVal > 0 ? (value / maxVal) * 100 : 0
                    return (
                      <div key={`${day.label}-${idx}`} className="flex-1 flex flex-col items-center gap-2">
                        <div className="relative w-full flex-1 flex items-end justify-center">
                          <div
                            className="w-full max-w-8 bg-primary/20 rounded-t-md relative group cursor-pointer"
                            style={{ height: `${Math.max(height, 5)}%` }}
                          >
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-md transition-all"
                              style={{ height: `${Math.max(height, 5)}%` }}
                            />
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                              {chartType === "calls" && day.count}
                              {chartType === "duration" && `${Math.round(day.duration / 60)}m`}
                              {chartType === "cost" && `$${day.cost.toFixed(2)}`}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">{day.label}</span>
                      </div>
                    )
                  })
                ) : (
                  <div className="w-full flex items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Call Outcomes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Call Outcomes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 flex items-center justify-center gap-8">
                {/* Donut Chart */}
                <div className="relative w-40 h-40">
                  <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 100 100">
                    {/* Background */}
                    <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
                    {/* Completed */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="hsl(142, 76%, 36%)"
                      strokeWidth="12"
                      strokeDasharray={`${(summary.completed_calls / (summary.total_calls || 1)) * 251.2} 251.2`}
                      strokeLinecap="round"
                    />
                    {/* No Answer (assuming some calls didn't complete) */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="hsl(215, 16%, 47%)"
                      strokeWidth="12"
                      strokeDasharray={`${((summary.total_calls - summary.completed_calls) / (summary.total_calls || 1)) * 251.2} 251.2`}
                      strokeDashoffset={`-${(summary.completed_calls / (summary.total_calls || 1)) * 251.2}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{summary.total_calls}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <div>
                      <p className="text-sm font-medium">Completed</p>
                      <p className="text-xs text-muted-foreground">{summary.completed_calls} ({Math.round((summary.completed_calls / (summary.total_calls || 1)) * 100)}%)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-slate-400" />
                    <div>
                      <p className="text-sm font-medium">Other</p>
                      <p className="text-xs text-muted-foreground">{summary.total_calls - summary.completed_calls} ({Math.round(((summary.total_calls - summary.completed_calls) / (summary.total_calls || 1)) * 100)}%)</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Duration Distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Call Duration Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 flex items-center justify-center text-muted-foreground">
                <p>Distribution data will be calculated from actual call logs</p>
              </div>
            </CardContent>
          </Card>

          {/* Sentiment Analysis */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sentiment Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 flex items-center justify-center gap-8">
                {/* Sentiment Gauge */}
                <div className="relative w-40 h-40">
                  <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 100 100">
                    {/* Background circle */}
                    <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
                    {/* Positive segment */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="hsl(142, 76%, 36%)"
                      strokeWidth="12"
                      strokeDasharray={`${positiveArc} ${circumference}`}
                      strokeLinecap="round"
                    />
                    {/* Neutral segment */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="hsl(38, 92%, 50%)"
                      strokeWidth="12"
                      strokeDasharray={`${neutralArc} ${circumference}`}
                      strokeDashoffset={`-${positiveArc}`}
                      strokeLinecap="round"
                    />
                    {/* Negative segment */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="hsl(0, 84%, 60%)"
                      strokeWidth="12"
                      strokeDasharray={`${negativeArc} ${circumference}`}
                      strokeDashoffset={`-${positiveArc + neutralArc}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{summary.avg_sentiment_score}%</p>
                      <p className="text-xs text-muted-foreground">Avg Score</p>
                    </div>
                  </div>
                </div>

                {/* Legend with Tooltips */}
                <TooltipProvider>
                  <div className="space-y-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-3 cursor-help">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <div>
                            <p className="text-sm font-medium">Positive</p>
                            <p className="text-xs text-muted-foreground">{sentimentPositivePercent}% ({summary.sentiment.positive})</p>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Positive sentiment indicates satisfied customers</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-3 cursor-help">
                          <div className="w-3 h-3 rounded-full bg-amber-500" />
                          <div>
                            <p className="text-sm font-medium">Neutral</p>
                            <p className="text-xs text-muted-foreground">{sentimentNeutralPercent}% ({summary.sentiment.neutral})</p>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Neutral sentiment indicates neither positive nor negative response</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-3 cursor-help">
                          <div className="w-3 h-3 rounded-full bg-red-500" />
                          <div>
                            <p className="text-sm font-medium">Negative</p>
                            <p className="text-xs text-muted-foreground">{sentimentNegativePercent}% ({summary.sentiment.negative})</p>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Negative sentiment indicates dissatisfied customers</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Agent Performance Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Agent Performance Summary</CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No agents configured yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Total Calls</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Sentiments</TableHead>
                  <TableHead>Total Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => {
                  const totalSentiment = agent.sentiment.positive + agent.sentiment.negative + agent.sentiment.neutral
                  
                  return (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {agent.provider}
                        </Badge>
                      </TableCell>
                      <TableCell>{agent.total_calls}</TableCell>
                      <TableCell>
                        <span className={agent.success_rate >= 80 ? "text-green-600" : "text-amber-600"}>
                          {agent.success_rate.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        {totalSentiment > 0 ? (
                          <TooltipProvider>
                            <span className="flex items-center gap-2">
                              {agent.sentiment.positive > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 text-green-600 cursor-help">
                                      <Smile className="w-4 h-4" />
                                      {agent.sentiment.positive}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Positive sentiment calls</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {agent.sentiment.neutral > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 text-amber-600 cursor-help">
                                      <Meh className="w-4 h-4" />
                                      {agent.sentiment.neutral}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Neutral sentiment calls</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {agent.sentiment.negative > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 text-red-600 cursor-help">
                                      <Frown className="w-4 h-4" />
                                      {agent.sentiment.negative}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Negative sentiment calls</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </span>
                          </TooltipProvider>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>${agent.total_cost.toFixed(2)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
