/**
 * Investigator (Character) type definitions
 * Based on CoC 7th Edition character sheet
 */

/**
 * Character attributes (primary characteristics)
 */
export interface InvestigatorAttributes {
  /** Strength - muscle and power */
  str: number
  /** Constitution - health and stamina */
  con: number
  /** Size - physical bulk */
  siz: number
  /** Dexterity - agility and speed */
  dex: number
  /** Appearance - physical attractiveness */
  app: number
  /** Intelligence - brainpower and memory */
  int: number
  /** Power - willpower and mental strength */
  pow: number
  /** Education - knowledge and learning */
  edu: number
}

/**
 * Investigator basic information
 */
export interface InvestigatorBasicInfo {
  /** Character name */
  name: string
  /** Age in years */
  age: number
  /** Gender: male, female, other */
  gender: "male" | "female" | "other"
  /** Occupation/profession */
  occupation: string
  /** Portrait image URL or base64 string */
  portrait?: string
  /** Birth year */
  birthYear?: number
  /** Nationality */
  nationality?: string
  /** Residence location */
  residence?: string
}

/**
 * Investigator data structure
 */
export interface InvestigatorData extends InvestigatorBasicInfo {
  /** Primary attributes */
  attributes: InvestigatorAttributes
  /** Current HP (Hit Points) */
  hp?: {
    current: number
    max: number
  }
  /** Current MP (Magic Points) */
  mp?: {
    current: number
    max: number
  }
  /** Sanity (SAN) */
  sanity?: {
    current: number
    max: number
  }
  /** Luck points */
  luck?: {
    current: number
    max: number
  }
  /** Derived attributes */
  derived?: {
    /** Move rate */
    move: number
    /** Build */
    build: number
    /** Damage bonus */
    damageBonus: string
  }
  /** Skills list */
  skills?: Array<{
    name: string
    value: number
  }>
}

/**
 * Props for InvestigatorFileCard component
 */
export interface InvestigatorFileCardProps {
  /** Investigator data to display */
  data?: Partial<InvestigatorData>
  /** Additional CSS classes */
  className?: string
  /** Whether to show all details or compact view */
  compact?: boolean
  /** Whether to enable editing mode */
  editable?: boolean
  /** Callback when data changes (if editable) */
  onDataChange?: (data: Partial<InvestigatorData>) => void
}

/**
 * Attribute display configuration
 */
export interface AttributeDisplayConfig {
  /** Attribute code */
  code: keyof InvestigatorAttributes
  /** Display label (Chinese) */
  label: string
  /** Display label (English) */
  labelEn: string
  /** Whether to display in compact view */
  showInCompact: boolean
}

/**
 * Default attribute display order
 */
export const ATTRIBUTE_DISPLAY_ORDER: AttributeDisplayConfig[] = [
  { code: "str", label: "力量", labelEn: "Strength", showInCompact: true },
  { code: "con", label: "体质", labelEn: "Constitution", showInCompact: true },
  { code: "siz", label: "体型", labelEn: "Size", showInCompact: true },
  { code: "dex", label: "敏捷", labelEn: "Dexterity", showInCompact: true },
  { code: "app", label: "外貌", labelEn: "Appearance", showInCompact: true },
  { code: "int", label: "智力", labelEn: "Intelligence", showInCompact: true },
  { code: "pow", label: "意志", labelEn: "Power", showInCompact: true },
  { code: "edu", label: "教育", labelEn: "Education", showInCompact: true },
]
