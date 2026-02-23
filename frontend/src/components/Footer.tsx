import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Dice3, HelpCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { getCommandSuggestions, type CommandDefinition } from "@/components/HelpPanel"

interface FooterProps {
  onSendMessage: (content: string) => void
  onRoll?: () => void
  onOpenHelp?: () => void
}

const KEYBOARD_SHORTCUTS = [
  { key: 'Enter', description: '发送消息' },
  { key: 'Tab', description: '自动补全命令' },
  { key: '/', description: '输入命令' },
  { key: '?', description: '打开帮助' },
]

export function Footer({ onSendMessage, onRoll, onOpenHelp }: FooterProps) {
  const [input, setInput] = useState("")
  const [suggestions, setSuggestions] = useState<CommandDefinition[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (input.startsWith('/')) {
      const cmds = getCommandSuggestions(input)
      setSuggestions(cmds)
      setShowSuggestions(cmds.length > 0)
      setSelectedIndex(-1)
    } else {
      setShowSuggestions(false)
    }
  }, [input])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim()) {
      onSendMessage(input.trim())
      setInput("")
      setShowSuggestions(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) {
      if (e.key === '?' && !input.trim()) {
        e.preventDefault()
        onOpenHelp?.()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case 'Tab':
        e.preventDefault()
        if (selectedIndex >= 0) {
          setInput(`/${suggestions[selectedIndex].name} `)
          setShowSuggestions(false)
        } else if (suggestions.length > 0) {
          setInput(`/${suggestions[0].name} `)
          setShowSuggestions(false)
        }
        break
      case 'Escape':
        e.preventDefault()
        setShowSuggestions(false)
        break
      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault()
          setInput(`/${suggestions[selectedIndex].name} `)
          setShowSuggestions(false)
        }
        break
    }
  }

  const handleSuggestionClick = (cmd: CommandDefinition) => {
    setInput(`/${cmd.name} `)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  return (
    <TooltipProvider delayDuration={300}>
      <footer className="border-t bg-card p-4">
        <div className="flex gap-2 relative">
          <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="描述你的行动... 输入/查看命令"
                className="flex-1 pr-10"
                id="message-input"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border rounded-md shadow-lg overflow-hidden z-10">
                  {suggestions.map((cmd, index) => (
                    <button
                      key={cmd.name}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${
                        index === selectedIndex ? 'bg-muted' : ''
                      }`}
                      onClick={() => handleSuggestionClick(cmd)}
                    >
                      <span className="font-mono font-medium">/{cmd.name}</span>
                      <span className="text-muted-foreground ml-2">
                        {cmd.description}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="submit" size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>发送消息 (Enter)</TooltipContent>
            </Tooltip>
          </form>
          {onRoll && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onRoll}
                >
                  <Dice3 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>快速投骰 /roll</TooltipContent>
            </Tooltip>
          )}
          {onOpenHelp && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onOpenHelp}
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>帮助面板 (?)</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>快捷键:</span>
          {KEYBOARD_SHORTCUTS.map((shortcut) => (
            <Tooltip key={shortcut.key}>
              <TooltipTrigger asChild>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs cursor-default">
                  {shortcut.key}
                </kbd>
              </TooltipTrigger>
              <TooltipContent>{shortcut.description}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </footer>
    </TooltipProvider>
  )
}
