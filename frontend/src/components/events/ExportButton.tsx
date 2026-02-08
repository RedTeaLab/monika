/**
 * ExportButton component for exporting event logs
 * Provides dropdown menu for format selection (JSON/CSV)
 */

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Download, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { EventEntry } from "@/types/event"
import { exportEvents } from "@/utils/export"

interface ExportButtonProps {
  events: EventEntry[]
  sessionId: string
  disabled?: boolean
  className?: string
}

type ExportFormat = "json" | "csv"

export function ExportButton({
  events,
  sessionId,
  disabled = false,
  className,
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Format labels with descriptions
  const formats: Array<{
    value: ExportFormat
    label: string
    description: string
  }> = [
    {
      value: "json",
      label: "JSON",
      description: "完整数据，包含所有字段",
    },
    {
      value: "csv",
      label: "CSV",
      description: "表格格式，支持 Excel",
    },
  ]

  // Handle export
  const handleExport = (format: ExportFormat) => {
    exportEvents(events, sessionId, format)
    setIsOpen(false)
  }

  const isDisabled = disabled || events.length === 0

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isDisabled}
        className={cn("gap-2", className)}
      >
        <Download className="h-4 w-4" />
        导出
        <ChevronDown className="h-3 w-3" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50">
          <div className="py-1">
            {formats.map((format) => (
              <button
                key={format.value}
                onClick={() => handleExport(format.value)}
                className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{format.label}</span>
                  <Download className="h-3 w-3 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format.description}
                </p>
              </button>
            ))}
          </div>
          {events.length === 0 && (
            <div className="px-4 py-2 text-xs text-muted-foreground border-t border-gray-200 dark:border-gray-700">
              无事件可导出
            </div>
          )}
        </div>
      )}
    </div>
  )
}
