// frontend/src/types/occupation.ts

export interface Occupation {
  id: string
  name: string
  description?: string
  occupation_items?: string[]
  occupation_skills?: string[]
  suggested_attrs?: string[]
  credit_rating?: string
  suggested_skills?: string[]
}
