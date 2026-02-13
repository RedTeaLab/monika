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

export interface Occupation {
  id: string
  name: string
  occupation_items?: string[]
  occupation_skills?: string[]
  // Additional occupation properties can be added as needed
}

export type Gender = 'male' | 'female' | 'other'

export interface CharacterCreationState {
  name: string
  age: number
  gender: Gender
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
