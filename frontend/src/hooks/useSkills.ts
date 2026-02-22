// frontend/src/hooks/useSkills.ts
// 技能数据管理 Hook - 从API加载技能数据

import { useState, useEffect, useCallback } from 'react'
import { fetchSkills } from '@/services/skills'
import type { Skill, Era } from '@/types/skill'

interface UseSkillsOptions {
  era?: Era
  autoLoad?: boolean
}

interface UseSkillsReturn {
  skills: Skill[]
  loading: boolean
  error: string | null
  reload: () => void
  getSkillBase: (skillName: string) => number
  getSkillByName: (name: string) => Skill | undefined
}

/**
 * 技能数据管理 Hook
 * 从后端API加载技能数据，提供基础工具函数
 */
export function useSkills(options: UseSkillsOptions = {}): UseSkillsReturn {
  const { era, autoLoad = true } = options

  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(autoLoad)
  const [error, setError] = useState<string | null>(null)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetchSkills(era)
      setSkills(response.skills)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
      // 如果API失败，使用空数组
      setSkills([])
    } finally {
      setLoading(false)
    }
  }, [era])

  useEffect(() => {
    if (autoLoad) {
      loadSkills()
    }
  }, [autoLoad, loadSkills])

  /**
   * 获取技能基础值
   * 处理带特化的技能名（如 "格斗 (斗殴)" -> 找 "格斗"）
   */
  const getSkillBase = useCallback((skillName: string): number => {
    // 处理带特化的技能名
    const baseName = skillName.includes(' (') ? skillName.split(' (')[0] : skillName

    const skill = skills.find(s => s.name === baseName || s.name_en === baseName)
    return skill?.base_value ?? 0
  }, [skills])

  /**
   * 通过名称获取技能
   */
  const getSkillByName = useCallback((name: string): Skill | undefined => {
    return skills.find(s => s.name === name || s.name_en === name)
  }, [skills])

  return {
    skills,
    loading,
    error,
    reload: loadSkills,
    getSkillBase,
    getSkillByName,
  }
}

// 导出基础技能列表（用于API不可用时的回退）
// 这些是常用的基础技能默认值
export const DEFAULT_SKILL_BASES: Record<string, number> = {
  '格斗': 25,
  '射击': 20,
  '闪避': 0, // 闪避基础值为 DEX/2
  '投掷': 20,
  '魅力': 15,
  '快速交谈': 10,
  '恐吓': 15,
  '说服': 10,
  '心理学': 10,
  '会计': 5,
  '图书馆使用': 20,
  '侦查': 25,
  '聆听': 20,
  '急救': 30,
  '潜行': 20,
  '攀爬': 20,
  '游泳': 20,
  '信用评级': 0,
  '母语': 0, // 母语基础值为 EDU
}

/**
 * 获取技能基础值的回退函数
 * 当API不可用时使用本地默认值
 */
export function getSkillBaseFallback(skillName: string): number {
  const baseName = skillName.includes(' (') ? skillName.split(' (')[0] : skillName
  return DEFAULT_SKILL_BASES[baseName] ?? 0
}
