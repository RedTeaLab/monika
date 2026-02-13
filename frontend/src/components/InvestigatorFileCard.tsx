/**
 * InvestigatorFileCard - CoC 7th Edition Character File Card Component
 *
 * A styled file card component displaying investigator (PC) information
 * with a classified document aesthetic. Features:
 * - Complete character data display (attributes, skills, stats)
 * - Editable mode with inline editing
 * - Interactive elements (expand/collapse, hover effects)
 * - Smooth animations and transitions
 * - Responsive layout for all screen sizes
 * - Loading skeleton state
 */

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import type {
  InvestigatorFileCardProps,
  InvestigatorData,
  InvestigatorAttributes,
} from '@/types/investigator'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Edit2, Check, X, Camera, User } from 'lucide-react'

/**
 * Get gender display text
 */
function getGenderText(gender?: string): string {
  switch (gender) {
    case 'male':
      return '男'
    case 'female':
      return '女'
    case 'other':
      return '其他'
    default:
      return '未知'
  }
}

/**
 * Generate placeholder initials from name
 */
function getInitials(name?: string): string {
  if (!name) return 'UNK'
  const cleaned = name.trim()
  if (cleaned.length <= 2) return cleaned.toUpperCase()
  return cleaned.substring(0, 2).toUpperCase()
}

/**
 * Calculate Move rate from attributes
 */
function calculateMove(attributes: InvestigatorAttributes): number {
  const { str, dex, siz } = attributes
  if (dex >= siz && str >= siz) return 9
  if (dex + siz > str) return 8
  return 7
}

/**
 * Calculate Build from attributes
 */
function calculateBuild(attributes: InvestigatorAttributes): number {
  const { str, siz } = attributes
  const total = str + siz
  if (total <= 64) return -2
  if (total <= 84) return -1
  if (total <= 124) return 0
  if (total <= 164) return 1
  return 2
}

/**
 * Calculate Damage Bonus from attributes
 */
function calculateDamageBonus(attributes: InvestigatorAttributes): string {
  const { str, siz } = attributes
  const total = str + siz
  if (total <= 64) return '-1D4'
  if (total <= 84) return '-1D4'
  if (total <= 124) return '0'
  if (total <= 164) return '+1D4'
  return '+1D6'
}

/**
 * Attribute input field component for editable mode
 */
interface AttributeInputProps {
  label: string
  value: number
  onChange: (value: number) => void
  className?: string
}

function AttributeInput({ label, value, onChange, className }: AttributeInputProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <label className="text-[10px] text-amber-700/70 uppercase tracking-wider">
        {label}
      </label>
      <Input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
        className="h-8 bg-amber-50/70 border-amber-700/40 text-amber-900 text-sm font-mono"
      />
    </div>
  )
}

/**
 * Skill item component
 */
interface SkillItemProps {
  name: string
  value: number
  editable?: boolean
  onChange?: (value: number) => void
}

function SkillItem({ name, value, editable, onChange }: SkillItemProps) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-amber-700/10">
      <span className="text-xs text-amber-800/80 truncate flex-1">{name}</span>
      {editable ? (
        <Input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange?.(parseInt(e.target.value) || 0)}
          className="h-6 w-16 bg-amber-50/70 border-amber-700/40 text-amber-900 text-xs font-mono"
        />
      ) : (
        <Badge variant="outline" className="border-amber-700/30 text-amber-900/80 bg-amber-50/30 text-xs font-mono">
          {value}%
        </Badge>
      )}
    </div>
  )
}

/**
 * Main InvestigatorFileCard component
 */
export function InvestigatorFileCard(props: InvestigatorFileCardProps) {
  const { data, className, compact = false, editable = false, onDataChange } = props

  // UI state
  const [isExpanded, setIsExpanded] = React.useState(!compact)
  const [isEditing, setIsEditing] = React.useState(false)
  const [editData, setEditData] = React.useState<Partial<InvestigatorData> | null>(null)
  const [hoveredAttribute, setHoveredAttribute] = React.useState<string | null>(null)
  const [imageError, setImageError] = React.useState(false)

  // Sync edit data when external data changes
  React.useEffect(() => {
    if (data && !isEditing) {
      setEditData(data)
    }
  }, [data, isEditing])

  // Derived attributes calculation
  const derivedMove = React.useMemo(() => {
    if (!data?.attributes) return null
    return calculateMove(data.attributes)
  }, [data?.attributes])

  const derivedBuild = React.useMemo(() => {
    if (!data?.attributes) return null
    return calculateBuild(data.attributes)
  }, [data?.attributes])

  const derivedDamageBonus = React.useMemo(() => {
    if (!data?.attributes) return null
    return calculateDamageBonus(data.attributes)
  }, [data?.attributes])

  // Handle attribute change in edit mode
  const handleAttributeChange = (key: keyof InvestigatorAttributes, value: number) => {
    setEditData((prev): Partial<InvestigatorData> | null => {
      if (!prev) return prev
      const currentAttrs = prev.attributes || {} as Partial<InvestigatorAttributes>
      return {
        ...prev,
        attributes: {
          ...currentAttrs,
          [key]: value,
        } as InvestigatorAttributes,
      }
    })
  }

  // Handle save edit
  const handleSaveEdit = () => {
    if (editData) {
      onDataChange?.(editData)
    }
    setIsEditing(false)
  }

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditData(data || null)
    setIsEditing(false)
  }

  // Handle image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      setEditData((prev) => {
        if (prev) {
          return { ...prev, portrait: result }
        }
        return { portrait: result } as Partial<InvestigatorData>
      })
    }
    reader.readAsDataURL(file)
  }

  // Get health percentage for progress bar
  const getHealthPercentage = (): number => {
    if (!data?.hp) return 100
    return (data.hp.current / data.hp.max) * 100
  }

  // Get sanity percentage for progress bar
  const getSanityPercentage = (): number => {
    if (!data?.sanity) return 100
    return (data.sanity.current / data.sanity.max) * 100
  }

  // Attribute descriptions for hover tooltip
  const attributeDescriptions: Record<string, string> = {
    str: '肌肉力量，影响近战伤害和体力检定',
    con: '体质健康，影响生命值和抗性检定',
    siz: '体型大小，影响生命值和战斗修正',
    dex: '敏捷反应，影响行动顺序和闪避',
    app: '外貌魅力，影响社交互动和说服',
    int: '智力记忆，影响技能点数和知识检定',
    pow: '意志力量，影响魔法值和理智值',
    edu: '教育程度，影响职业技能和知识',
  }

  // Get display value with null checks
  const getAttrValue = (attr: keyof InvestigatorAttributes, fallback: string = '---'): string => {
    const val = data?.attributes?.[attr]
    return val !== undefined ? String(val) : fallback
  }

  return (
    <div className={cn('max-w-2xl mx-auto font-mono', className)}>
      <Card
        className={cn(
          'border-2 shadow-lg overflow-hidden relative transition-all duration-300',
          'hover:shadow-2xl',
          'bg-gradient-to-br from-amber-50 via-stone-100 to-amber-50/80',
          'border-amber-900/30',
          'before:absolute before:inset-0 before:pointer-events-none',
          'before:[background-image:repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.02)_2px,rgba(0,0,0,0.02)_4px)]',
          'after:absolute after:inset-0 after:pointer-events-none',
          'after:[background:radial-gradient(ellipse_at_center,transparent_0%,rgba(139,90,43,0.05)_100%)]'
        )}
        style={{ fontFamily: "'Courier Prime', 'Courier New', monospace" }}
      >
        {/* Binding holes effect */}
        <div className="absolute left-2 top-8 bottom-8 w-1 flex flex-col justify-between gap-8 pointer-events-none">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-amber-900/20 shadow-[0_0_4px_rgba(139,90,43,0.3)]" />
          ))}
        </div>

        {/* Expand/Collapse Button */}
        {compact && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="absolute top-2 right-2 z-10 h-8 w-8 p-0 bg-amber-50/50 hover:bg-amber-100/50 border border-amber-700/20"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4 text-amber-900/70" /> : <ChevronDown className="h-4 w-4 text-amber-900/70" />}
          </Button>
        )}

        {/* Edit Button (if editable prop is true) */}
        {editable && !isEditing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="absolute top-2 right-10 z-10 h-8 w-8 p-0 bg-amber-50/50 hover:bg-amber-100/50 border border-amber-700/20"
          >
            <Edit2 className="h-3.5 w-3.5 text-amber-900/70" />
          </Button>
        )}

        {/* Content */}
        <div className="relative p-4 sm:p-6 md:p-8 pl-6 sm:pl-8">
          <div className="flex flex-col md:flex-row gap-4 sm:gap-6">
            {/* Left: Portrait section */}
            <div className="flex-shrink-0">
              <div
                className={cn(
                  'rounded-lg border-2 overflow-hidden transition-all duration-300',
                  'border-amber-800/40 bg-stone-200/80',
                  'shadow-inner',
                  'relative group',
                  'after:absolute after:inset-0 after:pointer-events-none',
                  'after:[background:radial-gradient(ellipse_at_top_right,transparent_60%,rgba(139,69,19,0.1)_100%)]',
                  isEditing && 'hover:border-amber-700/60 cursor-pointer'
                )}
              >
                {/* Photo placeholder area */}
                <div className="w-28 h-28 sm:w-32 sm:h-32 md:w-40 md:h-40 relative">
                  {(isEditing ? editData?.portrait : data?.portrait) && !imageError ? (
                    <img
                      src={isEditing ? editData?.portrait : data?.portrait}
                      alt={data?.name || '调查员头像'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-stone-200 to-stone-300">
                      <Avatar className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 border-2 border-dashed border-amber-700/50 text-amber-700/70 bg-transparent text-lg sm:text-xl">
                        {getInitials(isEditing ? editData?.name : data?.name)}
                      </Avatar>
                    </div>
                  )}

                  {/* Photo corners/tape effect */}
                  <div className="absolute top-1 left-1 w-4 sm:w-6 h-4 sm:h-6 border-t-2 border-l-2 border-amber-700/20" />
                  <div className="absolute top-1 right-1 w-4 sm:w-6 h-4 sm:h-6 border-t-2 border-r-2 border-amber-700/20" />
                  <div className="absolute bottom-1 left-1 w-4 sm:w-6 h-4 sm:h-6 border-b-2 border-l-2 border-amber-700/20" />
                  <div className="absolute bottom-1 right-1 w-4 sm:w-6 h-4 sm:h-6 border-b-2 border-r-2 border-amber-700/20" />

                  {/* Camera button for editing */}
                  {isEditing && (
                    <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      <Camera className="h-8 w-8 text-white" />
                    </label>
                  )}
                </div>

                {/* Photo label */}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-amber-900/10 px-2 py-0.5 text-[9px] sm:text-[10px] text-amber-900/60 uppercase tracking-wider">
                  SUBJECT
                </div>
              </div>
            </div>

            {/* Right: Information section */}
            <div className="flex-1 space-y-3 sm:space-y-4">
              {/* Basic Info */}
              <div className="space-y-2">
                {/* Name */}
                <div>
                  {isEditing ? (
                    <Input
                      value={editData?.name || ''}
                      onChange={(e) => setEditData((prev) => prev ? { ...prev, name: e.target.value } : null)}
                      className="font-mono text-sm bg-amber-50/50 border-amber-700/30 text-amber-900 h-8"
                      placeholder="调查员姓名"
                    />
                  ) : (
                    <p
                      className={cn('text-amber-900 font-bold leading-tight transition-all duration-200', 'text-base sm:text-lg md:text-xl')}
                      style={{ textShadow: '1px 1px 0 rgba(139,90,43,0.1)' }}
                    >
                      {data?.name || '未知调查员'}
                    </p>
                  )}
                </div>

                {/* Age & Gender */}
                {(isEditing ? (editData?.age || editData?.gender) : (data?.age || data?.gender)) && (
                  <p className="text-amber-800/70 text-xs tracking-wide">
                    {isEditing ? (
                      <>
                        <Input
                          type="number"
                          min={15}
                          max={90}
                          value={editData?.age || ''}
                          onChange={(e) => setEditData((prev) => prev ? { ...prev, age: parseInt(e.target.value) || undefined } : null)}
                          className="inline w-16 h-6 bg-amber-50/50 border-amber-700/30 text-amber-900 text-xs mr-2"
                          placeholder="年龄"
                        />
                        <select
                          value={editData?.gender || ''}
                          onChange={(e) => setEditData((prev) => prev ? { ...prev, gender: e.target.value as any } : null)}
                          className="bg-amber-50/50 border border-amber-700/30 text-amber-900 text-xs rounded px-2 py-1"
                        >
                          <option value="">性别</option>
                          <option value="male">男</option>
                          <option value="female">女</option>
                          <option value="other">其他</option>
                        </select>
                      </>
                    ) : (
                      <>
                        {data?.age && `${data.age} 岁`}
                        {data?.age && data?.gender && ' · '}
                        {data?.gender && getGenderText(data.gender)}
                      </>
                    )}
                  </p>
                )}

                {/* Occupation */}
                {(isEditing ? editData?.occupation : data?.occupation) && (
                  <p className="text-amber-800/70 text-xs tracking-wide">
                    职业:{' '}
                    {isEditing ? (
                      <Input
                        value={editData?.occupation || ''}
                        onChange={(e) => setEditData((prev) => prev ? { ...prev, occupation: e.target.value } : null)}
                        className="inline w-32 h-6 bg-amber-50/50 border-amber-700/30 text-amber-900 text-xs ml-1"
                        placeholder="职业"
                      />
                    ) : (
                      data?.occupation
                    )}
                  </p>
                )}
              </div>

              <Separator className="border-dashed border-amber-700/30 my-2 sm:my-3" />

              {/* Attributes Section */}
              <div className="space-y-2">
                <div className="text-[10px] text-amber-700/50 uppercase tracking-[0.2em]">
                  Characteristics
                </div>

                {/* Attributes grid - 2 columns */}
                <div className="grid grid-cols-2 gap-x-3 sm:gap-x-4 gap-y-1 text-sm">
                  {[
                    { code: 'str', label: '力量 STR' },
                    { code: 'con', label: '体质 CON' },
                    { code: 'siz', label: '体型 SIZ' },
                    { code: 'dex', label: '敏捷 DEX' },
                    { code: 'app', label: '外貌 APP' },
                    { code: 'int', label: '智力 INT' },
                    { code: 'pow', label: '意志 POW' },
                    { code: 'edu', label: '教育 EDU' },
                  ].map((attr) => (
                    <div
                      key={attr.code}
                      className={cn('flex items-baseline gap-1 relative group/attr', 'transition-all duration-200')}
                      onMouseEnter={() => setHoveredAttribute(attr.code)}
                      onMouseLeave={() => setHoveredAttribute(null)}
                    >
                      <span className="text-amber-700/70 text-xs font-mono shrink-0">{attr.label}:</span>
                      {isEditing ? (
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={editData?.attributes?.[attr.code as keyof InvestigatorAttributes] ?? 0}
                          onChange={(e) => handleAttributeChange(attr.code as keyof InvestigatorAttributes, parseInt(e.target.value) || 0)}
                          className="h-6 w-14 bg-amber-50/70 border-amber-700/40 text-amber-900 text-xs font-mono p-1"
                        />
                      ) : (
                        <span className={cn('font-mono font-bold transition-all duration-200', hoveredAttribute === attr.code && 'scale-110')}>
                          {getAttrValue(attr.code as keyof InvestigatorAttributes)}
                        </span>
                      )}

                      {/* Hover tooltip */}
                      {hoveredAttribute === attr.code && !isEditing && attributeDescriptions[attr.code] && (
                        <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-amber-900/90 text-white text-[9px] rounded whitespace-nowrap z-20">
                          {attributeDescriptions[attr.code]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <>
                  {/* Derived Stats */}
                  {(derivedMove !== null || derivedBuild !== null || derivedDamageBonus !== null) && (
                    <>
                      <Separator className="border-dashed border-amber-700/30 my-2 sm:my-3" />
                      <div className="space-y-2">
                        <div className="text-[10px] text-amber-700/50 uppercase tracking-[0.2em]">
                          Derived
                        </div>
                        <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 text-xs">
                          {derivedMove !== null && (
                            <div className="flex items-baseline gap-1">
                              <span className="text-amber-700/70">MOVE:</span>
                              <span className="font-mono font-bold text-amber-900">{derivedMove}</span>
                            </div>
                          )}
                          {derivedBuild !== null && (
                            <div className="flex items-baseline gap-1">
                              <span className="text-amber-700/70">BUILD:</span>
                              <span className="font-mono font-bold text-amber-900">{derivedBuild}</span>
                            </div>
                          )}
                          {derivedDamageBonus !== null && (
                            <div className="flex items-baseline gap-1">
                              <span className="text-amber-700/70">DB:</span>
                              <span className="font-mono font-bold text-amber-900">{derivedDamageBonus}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Status badges (HP, MP, SAN) */}
                  {(data?.hp || data?.mp || data?.sanity || data?.luck) && (
                    <>
                      <Separator className="border-dashed border-amber-700/30 my-2 sm:my-3" />
                      <div className="space-y-3">
                        {/* HP Bar */}
                        {data?.hp && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-amber-800/80 font-medium">HP</span>
                              <span className={cn(
                                'font-mono font-bold',
                                getHealthPercentage() <= 25 ? 'text-red-700 animate-pulse' :
                                getHealthPercentage() <= 50 ? 'text-orange-700' :
                                'text-amber-900'
                              )}>
                                {data.hp.current}/{data.hp.max}
                              </span>
                            </div>
                            <Progress
                              value={getHealthPercentage()}
                              className={cn(
                                'h-2 transition-all duration-500',
                                getHealthPercentage() <= 25 && '[&>div]:bg-red-600',
                                getHealthPercentage() <= 50 && getHealthPercentage() > 25 && '[&>div]:bg-orange-500',
                                getHealthPercentage() > 50 && '[&>div]:bg-green-600'
                              )}
                            />
                          </div>
                        )}

                        {/* SAN Bar */}
                        {data?.sanity && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-amber-800/80 font-medium">SAN</span>
                              <span className={cn(
                                'font-mono font-bold',
                                getSanityPercentage() <= 20 ? 'text-purple-700 animate-pulse' :
                                getSanityPercentage() <= 50 ? 'text-purple-600' :
                                'text-amber-900'
                              )}>
                                {data.sanity.current}/{data.sanity.max}
                              </span>
                            </div>
                            <Progress
                              value={getSanityPercentage()}
                              className={cn(
                                'h-2 transition-all duration-500',
                                getSanityPercentage() <= 20 && '[&>div]:bg-purple-700',
                                getSanityPercentage() <= 50 && '[&>div]:bg-purple-500',
                                getSanityPercentage() > 50 && '[&>div]:bg-blue-600'
                              )}
                            />
                          </div>
                        )}

                        {/* MP Badge */}
                        {data?.mp && (
                          <Badge variant="outline" className="border-blue-900/30 text-blue-900/80 bg-blue-50/30 text-xs">
                            MP: {data.mp.current}/{data.mp.max}
                          </Badge>
                        )}

                        {/* Luck Badge */}
                        {data?.luck && (
                          <Badge variant="outline" className="border-green-900/30 text-green-900/80 bg-green-50/30 text-xs">
                            Luck: {data.luck.current}/{data.luck.max}
                          </Badge>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Bottom section - Stamps and footer */}
          <div className="pt-2 space-y-3">
            {/* Classification stamps */}
            <div className="flex flex-wrap justify-center gap-2">
              <Badge variant="outline" className={cn('border-amber-800/40 text-amber-900/70 bg-transparent', 'text-[9px] sm:text-[10px] px-2 py-0.5 uppercase tracking-wider', 'border-2')}>
                CONFIDENTIAL
              </Badge>
              <Badge variant="outline" className={cn('border-red-900/40 text-red-900/70 bg-transparent', 'text-[9px] sm:text-[10px] px-2 py-0.5 uppercase tracking-wider', 'border-2')}>
                CLASSIFIED
              </Badge>
            </div>

            {/* Edit action buttons */}
            {isEditing && (
              <div className="flex justify-center gap-2">
                <Button size="sm" onClick={handleSaveEdit} className="h-7 bg-green-700 hover:bg-green-800 text-white">
                  <Check className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancelEdit} className="h-7 border-red-700/50 text-red-900 hover:bg-red-50">
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            )}

            {/* Footer with file info */}
            <div className="flex justify-between items-center pt-2 border-t border-dashed border-amber-700/20">
              <p className="text-[9px] text-amber-700/40 uppercase tracking-wider">
                {data?.birthYear ? `${data.birthYear} · ${data?.nationality || 'USA'}` : '1970 · USA'}
              </p>
              <p className="text-[9px] text-amber-700/40 uppercase tracking-wider">
                CASE FILE NO. {(data?.name || '').substring(0, 3).toUpperCase()}-{(data?.age || 25) % 100}
              </p>
            </div>
          </div>

          {/* Aging/distress effects overlay */}
          <div className={cn('absolute inset-0 pointer-events-none', 'opacity-30', '[background:radial-gradient(ellipse_at_bottom_right,transparent_40%,rgba(139,90,43,0.15)_100%)]')} />
        </div>
      </Card>
    </div>
  )
}

/**
 * Loading skeleton for InvestigatorFileCard
 */
export function InvestigatorFileCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('max-w-2xl mx-auto font-mono', className)}>
      <Card
        className={cn(
          'border-2 shadow-lg overflow-hidden',
          'bg-gradient-to-br from-amber-50 via-stone-100 to-amber-50/80',
          'border-amber-900/30',
          'p-4 sm:p-6 md:p-8',
          'animate-pulse'
        )}
      >
        <div className="flex flex-col md:flex-row gap-4 sm:gap-6">
          {/* Portrait placeholder */}
          <div className="w-28 h-28 sm:w-32 sm:h-32 md:w-40 md:h-40 bg-stone-300/50 rounded-lg border-2 border-amber-800/40" />

          {/* Info placeholder */}
          <div className="flex-1 space-y-3 sm:space-y-4">
            <div className="h-5 sm:h-6 bg-stone-300/50 rounded w-3/4" />
            <div className="h-3 sm:h-4 bg-stone-300/50 rounded w-1/2" />
            <div className="h-3 sm:h-4 bg-stone-300/50 rounded w-1/3" />
            <div className="h-px bg-amber-700/20" />
            <div className="grid grid-cols-2 gap-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-3 sm:h-4 bg-stone-300/50 rounded" />
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

/**
 * Empty state for InvestigatorFileCard
 */
export function InvestigatorFileCardEmpty({ onCreate, className }: { onCreate?: () => void; className?: string }) {
  return (
    <div className={cn('max-w-2xl mx-auto font-mono', className)}>
      <Card
        className={cn(
          'border-2 border-dashed shadow-lg overflow-hidden',
          'bg-gradient-to-br from-amber-50/50 via-stone-100/50 to-amber-50/30',
          'border-amber-700/30',
          'p-8 sm:p-12',
          'flex flex-col items-center justify-center gap-4',
          'hover:border-amber-700/50 transition-colors cursor-pointer'
        )}
        onClick={onCreate}
      >
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-100/50 border-2 border-dashed border-amber-700/30 flex items-center justify-center">
          <User className="h-8 w-8 sm:h-10 sm:w-10 text-amber-700/40" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-amber-900/70 font-bold text-sm sm:text-base">No Investigator</p>
          <p className="text-amber-700/50 text-xs sm:text-sm">
            Click to create a new investigator
          </p>
        </div>
      </Card>
    </div>
  )
}
