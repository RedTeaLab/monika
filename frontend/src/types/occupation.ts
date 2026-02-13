// TypeScript types for occupation system

export interface Occupation {
  id: string
  name: string
  name_en: string
  description: string
  credit_rating: string
  suggested_attrs: string[]
  occupation_skills: string[]
  skill_bonus: number
}

export interface CharacterCreationState {
  step: 'occupation' | 'attributes' | 'skills' | 'review'
  selectedOccupation: Occupation | null
  attributes: Record<string, number>
  skills: Record<string, number>
  availableSkillPoints: number
  maxSkillPoints: number
}
