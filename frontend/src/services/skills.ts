// frontend/src/services/skills.ts
// 技能API服务 - 从后端获取技能数据

import type { Skill, SkillCategory, SkillListResponse, Era } from '@/types/skill'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'

/**
 * 获取技能列表
 * @param era - 过滤年代 ('modern' | '1920s')
 * @param category - 过滤分类
 * @param search - 搜索关键词
 * @param includeSpecializations - 是否包含专攻技能
 */
export async function fetchSkills(
  era?: Era,
  category?: string,
  search?: string,
  includeSpecializations = false
): Promise<SkillListResponse> {
  const params = new URLSearchParams()

  if (era) params.append('era', era)
  if (category) params.append('category', category)
  if (search) params.append('search', search)
  if (includeSpecializations) params.append('include_specializations', 'true')

  const url = `${API_BASE}/skills${params.toString() ? `?${params.toString()}` : ''}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch skills: ${response.statusText}`)
  }

  return response.json()
}

/**
 * 获取单个技能（通过ID）
 */
export async function fetchSkillById(id: number): Promise<Skill> {
  const response = await fetch(`${API_BASE}/skills/${id}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch skill: ${response.statusText}`)
  }
  return response.json()
}

/**
 * 获取单个技能（通过名称，支持中英文）
 */
export async function fetchSkillByName(name: string): Promise<Skill> {
  const response = await fetch(`${API_BASE}/skills/name/${encodeURIComponent(name)}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch skill: ${response.statusText}`)
  }
  return response.json()
}

/**
 * 获取技能分类列表
 */
export async function fetchSkillCategories(): Promise<SkillCategory[]> {
  const response = await fetch(`${API_BASE}/skills/categories`)
  if (!response.ok) {
    throw new Error(`Failed to fetch skill categories: ${response.statusText}`)
  }
  return response.json()
}

/**
 * 获取AI参考格式的技能信息（供LLM使用）
 */
export async function fetchSkillForAI(name: string): Promise<{
  id: number
  name: string
  name_en: string
  base_value: number
  category: string
  description: string | null
  difficulty_levels: string | null
  push_examples: string | null
  push_failure_examples: string | null
  opposing_skills: string | null
  specializations: string[]
}> {
  const response = await fetch(`${API_BASE}/skills/ai-reference/${encodeURIComponent(name)}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch skill for AI: ${response.statusText}`)
  }
  return response.json()
}

/**
 * 工具函数：获取技能基础值（从API获取的技能列表中查找）
 */
export function getSkillBaseFromList(skills: Skill[], skillName: string): number {
  // 处理带特化的技能名（如 "格斗 (斗殴)" -> 找 "格斗"）
  const baseName = skillName.includes(' (') ? skillName.split(' (')[0] : skillName

  const skill = skills.find(s => s.name === baseName || s.name_en === baseName)
  return skill?.base_value ?? 0
}

/**
 * 工具函数：检查技能是否在指定年代可用
 */
export function isSkillAvailableInEra(skill: Skill, era: Era): boolean {
  return era === 'modern' ? skill.available_modern : skill.available_1920s
}
