// frontend/src/types/characterCreation.ts

export interface Attributes {
  str: number
  con: number
  siz: number
  dex: number
  app: number
  pow: number
  int: number
  edu: number
  luck: number
}

export interface Background {
  appearance: string
  beliefs: string
  importantPerson: string
  significantPlace: string
  treasuredItem: string
  traits: string
}

export interface Equipment {
  occupationItems: string[]
  customItems: string[]
  cash: number
  assets: number
}

export type SkillPointFormula = 
  | 'edu4'
  | 'edu2_pow2'
  | 'edu2_dex2'
  | 'edu2_str2'
  | 'edu2_app2'

export interface OptionalSkillCategory {
  category: 'art_craft' | 'social' | 'language' | 'science' | 'combat' | 'other'
  count: number | 'any'  // 'any' means unlimited
  description?: string
}

export interface Occupation {
  id: string
  name: string
  nameEn?: string
  isCustom: boolean
  fixed_skills: string[]           // 固定技能
  optional_skills: OptionalSkillCategory[]  // 可选技能类别
  free_skill_slots: number         // 自由技能槽位
  occupation_items?: string[]
  credit_rating_min: number
  credit_rating_max: number
  skill_point_formula: SkillPointFormula
}

export type Gender = 'male' | 'female'

export type Era = 'modern' | '1920s'

export interface CharacterCreationState {
  name: string
  age: number
  gender: Gender
  era: Era
  occupation: Occupation | null
  attributes: Attributes
  skills: Record<string, number>
  occupationalPointsRemaining: number
  interestPointsRemaining: number
  background: Background
  equipment: Equipment
}

export type CharacterCreationAction =
  | { type: 'SET_NAME'; value: string }
  | { type: 'SET_AGE'; value: number }
  | { type: 'SET_GENDER'; value: Gender }
  | { type: 'SET_ERA'; value: Era }
  | { type: 'SET_OCCUPATION'; occupation: Occupation | null }
  | { type: 'SET_ATTRIBUTE'; attribute: keyof Attributes; value: number }
  | { type: 'ROLL_ATTRIBUTE'; attribute: keyof Attributes }
  | { type: 'ROLL_ALL_ATTRIBUTES' }
  | { type: 'CHANGE_SKILL'; skill: string; delta: number }
  | { type: 'ADD_INTEREST_SKILL'; skill: string }
  | { type: 'SET_BACKGROUND'; field: keyof Background; value: string }
  | { type: 'ADD_EQUIPMENT'; category: 'occupation' | 'custom'; item: string }
  | { type: 'REMOVE_EQUIPMENT'; category: 'occupation' | 'custom'; item: string }
  | { type: 'SET_CASH'; value: number }
  | { type: 'SET_ASSETS'; value: number }
  | { type: 'RESET_FORM' }
