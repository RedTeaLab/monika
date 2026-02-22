import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface DamageNumberProps {
  value: number
  type: "damage" | "heal" | "dodge" | "block" | "critical"
  position?: { x: number; y: number }
  onComplete?: () => void
  className?: string
}

const TYPE_STYLES = {
  damage: {
    color: "text-red-500",
    bgColor: "bg-red-500/20",
    icon: "-",
    animation: "animate-bounce",
  },
  heal: {
    color: "text-green-500",
    bgColor: "bg-green-500/20",
    icon: "+",
    animation: "animate-pulse",
  },
  dodge: {
    color: "text-blue-500",
    bgColor: "bg-blue-500/20",
    icon: "DODGE",
    animation: "animate-ping",
  },
  block: {
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/20",
    icon: "BLOCK",
    animation: "animate-pulse",
  },
  critical: {
    color: "text-orange-500",
    bgColor: "bg-orange-500/20",
    icon: "CRIT!",
    animation: "animate-spin",
  },
}

export function DamageNumber({
  value,
  type,
  position,
  onComplete,
  className,
}: DamageNumberProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const style = TYPE_STYLES[type]

  useEffect(() => {
    const randomOffset = {
      x: (Math.random() - 0.5) * 40,
      y: -20 - Math.random() * 30,
    }
    setOffset(randomOffset)

    const timer = setTimeout(() => {
      setIsVisible(false)
      onComplete?.()
    }, 1500)

    return () => clearTimeout(timer)
  }, [onComplete])

  if (!isVisible) return null

  const displayValue = type === "damage" || type === "heal" 
    ? `${style.icon}${value}`
    : style.icon

  return (
    <div
      className={cn(
        "fixed pointer-events-none z-50 font-bold text-2xl transition-all duration-300",
        style.color,
        style.animation,
        isVisible ? "opacity-100 scale-100" : "opacity-0 scale-75",
        className
      )}
      style={{
        left: position ? position.x + offset.x : "50%",
        top: position ? position.y + offset.y : "50%",
        transform: position ? "none" : "translate(-50%, -50%)",
      }}
    >
      <div className={cn("px-3 py-1 rounded-lg shadow-lg", style.bgColor)}>
        {displayValue}
      </div>
    </div>
  )
}

interface DamageNumberContainerProps {
  damages: Array<{
    id: string
    value: number
    type: "damage" | "heal" | "dodge" | "block" | "critical"
    position?: { x: number; y: number }
  }>
  onRemove: (id: string) => void
  className?: string
}

export function DamageNumberContainer({
  damages,
  onRemove,
  className,
}: DamageNumberContainerProps) {
  return (
    <div className={cn("pointer-events-none", className)}>
      {damages.map((damage) => (
        <DamageNumber
          key={damage.id}
          value={damage.value}
          type={damage.type}
          position={damage.position}
          onComplete={() => onRemove(damage.id)}
        />
      ))}
    </div>
  )
}
