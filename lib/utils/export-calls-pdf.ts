/**
 * Export Call Logs to PDF
 * Uses jsPDF and jspdf-autotable for formatting
 */

import type { ConversationWithAgent } from "@/types/database.types"

export interface ExportCallsOptions {
  calls: ConversationWithAgent[]
  fileName?: string
}

/**
 * Dynamically import jsPDF to keep bundle lean
 */
async function loadJsPDF() {
  // jsPDF and its types may not exist at build time in type-checking,
  // so use require for Node interop when available, or dynamic import for web.
  let jsPDF: any
  let autoTable: any

  // Try to use 'require' if available (CommonJS Node - for local dev/testing)
  // Otherwise, fallback to dynamic import (for Next.js/client bundles)
  try {
    // @ts-ignore
    jsPDF = require("jspdf").default
    // @ts-ignore
    autoTable = require("jspdf-autotable").default
  } catch {
    // If require fails (browser), do dynamic import.
    const { default: jsPDF } = await import("jspdf")
    const { default: autoTable } = await import("jspdf-autotable")
  }
  return { jsPDF, autoTable }
}

/**
 * Format duration in seconds to MM:SS format
 */
function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

/**
 * Format date to readable format
 */
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "N/A"
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dateString
  }
}

/**
 * Get call type label
 */
function getCallTypeLabel(call: ConversationWithAgent): "web" | "inbound" | "outbound" {
  const meta = call.metadata as Record<string, unknown> | null
  const callType = typeof meta?.call_type === "string" ? meta.call_type : ""
  if (callType.toLowerCase().includes("web")) return "web"
  return call.direction === "inbound" ? "inbound" : "outbound"
}

/**
 * Export calls to PDF
 */
export async function exportCallsToPDF(options: ExportCallsOptions): Promise<void> {
  if (!options.calls || options.calls.length === 0) {
    throw new Error("No calls to export")
  }

  try {
    const { jsPDF, autoTable } = await loadJsPDF()

    // Create PDF document
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    })

    // Add title
    doc.setFontSize(16)
    doc.text("Call Logs Report", 14, 15)

    // Add metadata
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(
      `Generated on: ${new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      14,
      22
    )
    doc.text(`Total Calls: ${options.calls.length}`, 14, 27)

    // Prepare table data
    const tableData = options.calls.map((call) => {
      const callType = getCallTypeLabel(call)
      const sentiment = call.sentiment
        ? call.sentiment.charAt(0).toUpperCase() + call.sentiment.slice(1)
        : "N/A"
      return [
        call.caller_name || "Unknown",
        call.phone_number || "N/A",
        call.agent?.name || "Unknown",
        callType.charAt(0).toUpperCase() + callType.slice(1),
        call.status.replace(/_/g, " ").toUpperCase(),
        formatDuration(call.duration_seconds),
        `$${(call.total_cost || 0).toFixed(2)}`,
        sentiment,
        formatDate(call.started_at || call.created_at),
        call.transcript ? "Yes" : "No",
      ]
    })

    // Add table
    autoTable(doc, {
      head: [
        [
          "Caller",
          "Phone",
          "Agent",
          "Type",
          "Status",
          "Duration",
          "Cost",
          "Sentiment",
          "Date/Time",
          "Transcript",
        ],
      ],
      body: tableData,
      startY: 32,
      margin: { left: 10, right: 10 },
      styles: {
        fontSize: 9,
        cellPadding: 3,
        overflow: "linebreak",
        halign: "left",
      },
      headStyles: {
        fillColor: [59, 130, 246], // Blue
        textColor: 255,
        fontStyle: "bold",
        halign: "center",
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250], // Light blue
      },
      columnStyles: {
        0: { maxWidth: 25 }, // Caller
        1: { maxWidth: 20 }, // Phone
        2: { maxWidth: 25 }, // Agent
        3: { maxWidth: 15 }, // Type
        4: { maxWidth: 18 }, // Status
        5: { maxWidth: 15 }, // Duration
        6: { maxWidth: 12 }, // Cost
        7: { maxWidth: 15 }, // Sentiment
        8: { maxWidth: 25 }, // Date/Time
        9: { maxWidth: 12 }, // Transcript
      },
      didDrawPage: (data: any) => {
        // Footer
        const pageCount = doc.getNumberOfPages()
        doc.setFontSize(8)
        doc.setTextColor(150)
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}`,
          doc.internal.pageSize.getWidth() - 20,
          doc.internal.pageSize.getHeight() - 10
        )
      },
    })

    // Save the PDF
    const fileName = options.fileName || `call-logs-${Date.now()}.pdf`
    doc.save(fileName)
  } catch (error) {
    console.error("Failed to generate PDF:", error)
    throw new Error(
      error instanceof Error ? error.message : "Failed to generate PDF"
    )
  }
}

/**
 * Alternative: Export to CSV (simpler, no external dependencies)
 */
export function exportCallsToCSV(options: ExportCallsOptions): void {
  if (!options.calls || options.calls.length === 0) {
    throw new Error("No calls to export")
  }

  const headers = ["Caller", "Phone", "Agent", "Type", "Status", "Duration", "Cost", "Sentiment", "Date/Time", "Transcript"]
  const rows = options.calls.map((call) => {
    const callType = getCallTypeLabel(call)
    const sentiment = call.sentiment
      ? call.sentiment.charAt(0).toUpperCase() + call.sentiment.slice(1)
      : "N/A"
    return [
      call.caller_name || "Unknown",
      call.phone_number || "N/A",
      call.agent?.name || "Unknown",
      callType.charAt(0).toUpperCase() + callType.slice(1),
      call.status.replace(/_/g, " "),
      formatDuration(call.duration_seconds),
      `$${(call.total_cost || 0).toFixed(2)}`,
      sentiment,
      formatDate(call.started_at || call.created_at),
      call.transcript ? "Yes" : "No",
    ]
  })

  // Convert to CSV
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) => {
          // Escape quotes and wrap in quotes if contains comma
          const stringCell = String(cell)
          if (stringCell.includes(",") || stringCell.includes('"')) {
            return `"${stringCell.replace(/"/g, '""')}"`
          }
          return stringCell
        })
        .join(",")
    ),
  ].join("\n")

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = options.fileName || `call-logs-${Date.now()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

