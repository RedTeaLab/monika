// frontend/src/types/skill.ts
// 技能类型定义 - 与后端API响应格式对应

export interface SkillSpecialization {
  id: number
  name: string
  name_en: string
  base_value: number
}

export interface Skill {
  id: number
  name: string
  name_en: string
  base_value: number
  category: string
  available_modern: boolean
  available_1920s: boolean
  has_specializations: boolean
  parent_skill_id: number | null
  specializations: SkillSpecialization[]
  description: string | null
  difficulty_levels: string | null
  push_examples: string | null
  push_failure_examples: string | null
  opposing_skills: string | null
  created_at: string
  updated_at: string
}

export interface SkillCategory {
  id: number
  key: string
  name: string
  name_en: string
  description: string | null
  sort_order: number
}

export interface SkillListResponse {
  skills: Skill[]
  total: number
}

// 技能分类常量
export const SKILL_CATEGORIES = {
  combat: { name: '战斗', nameEn: 'Combat' },
  social: { name: '社交', nameEn: 'Social' },
  knowledge: { name: '知识', nameEn: 'Knowledge' },
  technical: { name: '技术', nameEn: 'Technical' },
  perception: { name: '感知', nameEn: 'Perception' },
  action: { name: '动作', nameEn: 'Action' },
  medical: { name: '医疗', nameEn: 'Medical' },
  survival: { name: '生存', nameEn: 'Survival' },
  art: { name: '艺术', nameEn: 'Art' },
} as const

// 年代类型
export type Era = 'modern' | '1920s'
