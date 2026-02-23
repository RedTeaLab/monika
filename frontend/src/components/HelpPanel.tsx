import * as React from "react"
import { Search, Command } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

export interface CommandDefinition {
  name: string
  description: string
  usage: string
  aliases?: string[]
  example?: string
  category: 'basic' | 'dice' | 'combat' | 'chase' | 'san' | 'rule'
}

export const COMMANDS: CommandDefinition[] = [
  {
    name: 'help',
    description: '显示帮助信息',
    usage: '/help [command]',
    aliases: ['h', '?'],
    example: '/help /roll',
    category: 'basic',
  },
  {
    name: 'status',
    description: '显示当前状态',
    usage: '/status',
    category: 'basic',
  },
  {
    name: 'roll',
    description: '进行技能或属性检定',
    usage: '/roll <skill> [bonus|penalty]',
    aliases: ['r'],
    example: '/roll STR',
    category: 'dice',
  },
  {
    name: 'push',
    description: '重新投掷失败的检定',
    usage: '/push',
    category: 'dice',
  },
  {
    name: 'luck',
    description: '消耗幸运点改善检定',
    usage: '/luck [amount]',
    aliases: ['l'],
    example: '/luck 5',
    category: 'dice',
  },
  {
    name: 'combat',
    description: '战斗相关操作',
    usage: '/combat <start|action|end>',
    aliases: ['cbt'],
    example: '/combat start',
    category: 'combat',
  },
  {
    name: 'attack',
    description: '攻击目标',
    usage: '/attack <target>',
    aliases: ['atk'],
    example: '/attack monster',
    category: 'combat',
  },
  {
    name: 'dodge',
    description: '闪避攻击',
    usage: '/dodge',
    aliases: ['dge'],
    category: 'combat',
  },
  {
    name: 'chase',
    description: '追逐战相关操作',
    usage: '/chase <start|action|end>',
    example: '/chase start',
    category: 'chase',
  },
  {
    name: 'san',
    description: '进行SAN值检定',
    usage: '/san check <value>',
    example: '/san check 1d6',
    category: 'san',
  },
  {
    name: 'leads',
    description: '显示可用行动',
    usage: '/leads',
    category: 'basic',
  },
  {
    name: 'rule',
    description: '查询规则',
    usage: '/rule <query>',
    aliases: ['rules'],
    example: '/rule pushing',
    category: 'rule',
  },
]

const CATEGORY_LABELS: Record<CommandDefinition['category'], string> = {
  basic: '基础命令',
  dice: '检定命令',
  combat: '战斗命令',
  chase: '追逐命令',
  san: 'SAN值命令',
  rule: '规则查询',
}

interface HelpPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  const [searchQuery, setSearchQuery] = React.useState('')

  const filteredCommands = React.useMemo(() => {
    if (!searchQuery.trim()) return COMMANDS
    const query = searchQuery.toLowerCase()
    return COMMANDS.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query) ||
        cmd.usage.toLowerCase().includes(query) ||
        cmd.aliases?.some((a) => a.toLowerCase().includes(query))
    )
  }, [searchQuery])

  const groupedCommands = React.useMemo(() => {
    const groups: Record<string, CommandDefinition[]> = {}
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = []
      }
      groups[cmd.category].push(cmd)
    })
    return groups
  }, [filteredCommands])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <Card className="w-full max-w-lg h-full rounded-none border-x-0 border-t-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Command className="h-5 w-5" />
            命令帮助
          </CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索命令..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-140px)]">
            <div className="px-6 pb-6 space-y-6">
              {Object.entries(groupedCommands).map(([category, cmds]) => (
                <div key={category}>
                  <h3 className="font-medium text-sm text-muted-foreground mb-2">
                    {CATEGORY_LABELS[category as CommandDefinition['category']]}
                  </h3>
                  <div className="space-y-2">
                    {cmds.map((cmd) => (
                      <div
                        key={cmd.name}
                        className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-mono font-medium">
                            {cmd.usage}
                          </code>
                          {cmd.aliases && (
                            <div className="flex gap-1">
                              {cmd.aliases.map((alias) => (
                                <Badge key={alias} variant="secondary" className="text-xs">
                                  {alias}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{cmd.description}</p>
                        {cmd.example && (
                          <p className="text-xs text-muted-foreground mt-1">
                            例: <code className="font-mono">{cmd.example}</code>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {filteredCommands.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>没有找到匹配的命令</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

export function getCommands() {
  return COMMANDS
}

export function getCommandSuggestions(input: string): CommandDefinition[] {
  if (!input.startsWith('/')) return []
  const query = input.slice(1).toLowerCase()
  if (!query) return COMMANDS.slice(0, 5)
  return COMMANDS.filter(
    (cmd) =>
      cmd.name.toLowerCase().startsWith(query) ||
      cmd.aliases?.some((a) => a.toLowerCase().startsWith(query))
  ).slice(0, 5)
}

export function getCommandByName(name: string): CommandDefinition | undefined {
  const cmdName = name.replace(/^\//, '').toLowerCase()
  return COMMANDS.find(
    (cmd) =>
      cmd.name.toLowerCase() === cmdName ||
      cmd.aliases?.some((a) => a.toLowerCase() === cmdName)
  )
}
