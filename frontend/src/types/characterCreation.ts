// frontend/src/types/characterCreation.ts
import type { Attributes } from '@/utils/characterCalculations'

export interface Occupation {
  id: string
  name: string
  // Additional occupation properties can be added as needed
}

export interface Background {
  appearance: string
  beliefs: string
  importantPerson: string
  significantPlace: string
  treasuredItem: string
  traits: string
}

export interface CharacterCreationState {
  name: string
  age: number
  gender?: string
  occupation?: Occupation
  attributes: Attributes
  background: Background
}
