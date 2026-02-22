// frontend/src/services/__tests__/skills.test.ts
// Comprehensive tests for skills API service

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchSkills,
  fetchSkillById,
  fetchSkillByName,
  fetchSkillCategories,
  fetchSkillForAI,
  getSkillBaseFromList,
  isSkillAvailableInEra,
} from '../skills'
import type { Skill, SkillCategory, Era } from '@/types/skill'

// Mock the global fetch function
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('skills service', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchSkills', () => {
    const mockSkillsResponse = {
      skills: [
        {
          id: 1,
          name: '格斗',
          name_en: 'Fighting',
          base_value: 25,
          category: 'combat',
          available_modern: true,
          available_1920s: true,
          has_specializations: true,
          parent_skill_id: null,
          specializations: [],
          description: null,
          difficulty_levels: null,
          push_examples: null,
          push_failure_examples: null,
          opposing_skills: null,
          created_at: '2025-01-01T00:00:00',
          updated_at: '2025-01-01T00:00:00',
        },
        {
          id: 2,
          name: '图书馆使用',
          name_en: 'Library Use',
          base_value: 20,
          category: 'knowledge',
          available_modern: true,
          available_1920s: true,
          has_specializations: false,
          parent_skill_id: null,
          specializations: [],
          description: null,
          difficulty_levels: null,
          push_examples: null,
          push_failure_examples: null,
          opposing_skills: null,
          created_at: '2025-01-01T00:00:00',
          updated_at: '2025-01-01T00:00:00',
        },
      ],
      total: 2,
    }

    it('should fetch skills without parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSkillsResponse,
      })

      const result = await fetchSkills()

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/api/skills')
      expect(result).toEqual(mockSkillsResponse)
      expect(result.skills).toHaveLength(2)
    })

    it('should fetch skills with era parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSkillsResponse,
      })

      await fetchSkills('modern')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/skills?era=modern'
      )
    })

    it('should fetch skills with category parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSkillsResponse,
      })

      await fetchSkills(undefined, 'combat')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/skills?category=combat'
      )
    })

    it('should fetch skills with search parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSkillsResponse,
      })

      await fetchSkills(undefined, undefined, '格斗')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/skills?search=%E6%A0%BC%E6%96%97'
      )
    })

    it('should fetch skills with includeSpecializations parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSkillsResponse,
      })

      await fetchSkills(undefined, undefined, undefined, true)

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/skills?include_specializations=true'
      )
    })

    it('should fetch skills with all parameters combined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSkillsResponse,
      })

      await fetchSkills('1920s', 'combat', '格斗', true)

      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('era=1920s')
      expect(calledUrl).toContain('category=combat')
      expect(calledUrl).toContain('search=')
      expect(calledUrl).toContain('include_specializations=true')
    })

    it('should throw error when fetch fails with non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      })

      await expect(fetchSkills()).rejects.toThrow(
        'Failed to fetch skills: Internal Server Error'
      )
    })

    it('should throw error when network fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(fetchSkills()).rejects.toThrow('Network error')
    })
  })

  describe('fetchSkillById', () => {
    const mockSkill: Skill = {
      id: 1,
      name: '格斗',
      name_en: 'Fighting',
      base_value: 25,
      category: 'combat',
      available_modern: true,
      available_1920s: true,
      has_specializations: true,
      parent_skill_id: null,
      specializations: [],
      description: null,
      difficulty_levels: null,
      push_examples: null,
      push_failure_examples: null,
      opposing_skills: null,
      created_at: '2025-01-01T00:00:00',
      updated_at: '2025-01-01T00:00:00',
    }

    it('should fetch skill by id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSkill,
      })

      const result = await fetchSkillById(1)

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/skills/1'
      )
      expect(result).toEqual(mockSkill)
      expect(result.id).toBe(1)
    })

    it('should throw error when skill not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      await expect(fetchSkillById(999)).rejects.toThrow(
        'Failed to fetch skill: Not Found'
      )
    })

    it('should handle different skill ids', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockSkill, id: 42 }),
      })

      const result = await fetchSkillById(42)

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/skills/42'
      )
      expect(result.id).toBe(42)
    })
  })

  describe('fetchSkillByName', () => {
    const mockSkill: Skill = {
      id: 1,
      name: '格斗',
      name_en: 'Fighting',
      base_value: 25,
      category: 'combat',
      available_modern: true,
      available_1920s: true,
      has_specializations: true,
      parent_skill_id: null,
      specializations: [],
      description: null,
      difficulty_levels: null,
      push_examples: null,
      push_failure_examples: null,
      opposing_skills: null,
      created_at: '2025-01-01T00:00:00',
      updated_at: '2025-01-01T00:00:00',
    }

    it('should fetch skill by Chinese name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSkill,
      })

      const result = await fetchSkillByName('格斗')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/skills/name/%E6%A0%BC%E6%96%97'
      )
      expect(result).toEqual(mockSkill)
    })

    it('should fetch skill by English name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSkill,
      })

      const result = await fetchSkillByName('Fighting')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/skills/name/Fighting'
      )
      expect(result).toEqual(mockSkill)
    })

    it('should properly encode special characters in name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSkill,
      })

      await fetchSkillByName('格斗 (斗殴)')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:8000/api/skills/name/')
      )
      // The URL should be encoded
      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl).toContain('%')
    })

    it('should throw error when skill not found by name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      })

      await expect(fetchSkillByName('NonExistent')).rejects.toThrow(
        'Failed to fetch skill: Not Found'
      )
    })
  })

  describe('fetchSkillCategories', () => {
    const mockCategories: SkillCategory[] = [
      {
        id: 1,
        key: 'combat',
        name: '战斗',
        name_en: 'Combat',
        description: 'Combat skills',
        sort_order: 1,
      },
      {
        id: 2,
        key: 'knowledge',
        name: '知识',
        name_en: 'Knowledge',
        description: 'Knowledge skills',
        sort_order: 2,
      },
    ]

    it('should fetch skill categories', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCategories,
      })

      const result = await fetchSkillCategories()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/skills/categories'
      )
      expect(result).toEqual(mockCategories)
      expect(result).toHaveLength(2)
    })

    it('should throw error when categories fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Service Unavailable',
      })

      await expect(fetchSkillCategories()).rejects.toThrow(
        'Failed to fetch skill categories: Service Unavailable'
      )
    })

    it('should return empty array when no categories', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      const result = await fetchSkillCategories()

      expect(result).toEqual([])
    })
  })

  describe('fetchSkillForAI', () => {
    const mockAIResponse = {
      id: 1,
      name: '格斗',
      name_en: 'Fighting',
      base_value: 25,
      category: 'combat',
      description: 'Combat skill description',
      difficulty_levels: 'Regular: 25, Hard: 12, Extreme: 5',
      push_examples: 'Pushing: fight harder',
      push_failure_examples: 'Failure: weapon breaks',
      opposing_skills: 'Dodge',
      specializations: ['Brawl', 'Sword', 'Wrestling'],
    }

    it('should fetch AI reference format for skill', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAIResponse,
      })

      const result = await fetchSkillForAI('格斗')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/skills/ai-reference/%E6%A0%BC%E6%96%97'
      )
      expect(result).toEqual(mockAIResponse)
      expect(result.specializations).toHaveLength(3)
    })

    it('should handle skills with null optional fields', async () => {
      const responseWithNulls = {
        ...mockAIResponse,
        description: null,
        push_examples: null,
        specializations: [],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => responseWithNulls,
      })

      const result = await fetchSkillForAI('Library Use')

      expect(result.description).toBeNull()
      expect(result.push_examples).toBeNull()
      expect(result.specializations).toEqual([])
    })

    it('should throw error when AI reference fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      })

      await expect(fetchSkillForAI('InvalidSkill')).rejects.toThrow(
        'Failed to fetch skill for AI: Bad Request'
      )
    })
  })

  describe('getSkillBaseFromList utility', () => {
    const skills: Skill[] = [
      {
        id: 1,
        name: '格斗',
        name_en: 'Fighting',
        base_value: 25,
        category: 'combat',
        available_modern: true,
        available_1920s: true,
        has_specializations: true,
        parent_skill_id: null,
        specializations: [],
        description: null,
        difficulty_levels: null,
        push_examples: null,
        push_failure_examples: null,
        opposing_skills: null,
        created_at: '2025-01-01T00:00:00',
        updated_at: '2025-01-01T00:00:00',
      },
      {
        id: 2,
        name: '图书馆使用',
        name_en: 'Library Use',
        base_value: 20,
        category: 'knowledge',
        available_modern: true,
        available_1920s: true,
        has_specializations: false,
        parent_skill_id: null,
        specializations: [],
        description: null,
        difficulty_levels: null,
        push_examples: null,
        push_failure_examples: null,
        opposing_skills: null,
        created_at: '2025-01-01T00:00:00',
        updated_at: '2025-01-01T00:00:00',
      },
    ]

    it('should return base value for skill found by Chinese name', () => {
      expect(getSkillBaseFromList(skills, '格斗')).toBe(25)
    })

    it('should return base value for skill found by English name', () => {
      expect(getSkillBaseFromList(skills, 'Fighting')).toBe(25)
    })

    it('should handle skill with specialization (e.g., "格斗 (斗殴)")', () => {
      expect(getSkillBaseFromList(skills, '格斗 (斗殴)')).toBe(25)
    })

    it('should return 0 for non-existent skill', () => {
      expect(getSkillBaseFromList(skills, '不存在的技能')).toBe(0)
    })

    it('should return 0 for empty skills list', () => {
      expect(getSkillBaseFromList([], '格斗')).toBe(0)
    })

    it('should handle English skill with specialization', () => {
      expect(getSkillBaseFromList(skills, 'Fighting (Brawl)')).toBe(25)
    })
  })

  describe('isSkillAvailableInEra utility', () => {
    const modernSkill: Skill = {
      id: 1,
      name: '计算机使用',
      name_en: 'Computer Use',
      base_value: 5,
      category: 'technical',
      available_modern: true,
      available_1920s: false,
      has_specializations: false,
      parent_skill_id: null,
      specializations: [],
      description: null,
      difficulty_levels: null,
      push_examples: null,
      push_failure_examples: null,
      opposing_skills: null,
      created_at: '2025-01-01T00:00:00',
      updated_at: '2025-01-01T00:00:00',
    }

    const bothEraSkill: Skill = {
      id: 2,
      name: '格斗',
      name_en: 'Fighting',
      base_value: 25,
      category: 'combat',
      available_modern: true,
      available_1920s: true,
      has_specializations: true,
      parent_skill_id: null,
      specializations: [],
      description: null,
      difficulty_levels: null,
      push_examples: null,
      push_failure_examples: null,
      opposing_skills: null,
      created_at: '2025-01-01T00:00:00',
      updated_at: '2025-01-01T00:00:00',
    }

    it('should return true for modern skill in modern era', () => {
      expect(isSkillAvailableInEra(modernSkill, 'modern')).toBe(true)
    })

    it('should return false for modern-only skill in 1920s era', () => {
      expect(isSkillAvailableInEra(modernSkill, '1920s')).toBe(false)
    })

    it('should return true for skill available in both eras (modern)', () => {
      expect(isSkillAvailableInEra(bothEraSkill, 'modern')).toBe(true)
    })

    it('should return true for skill available in both eras (1920s)', () => {
      expect(isSkillAvailableInEra(bothEraSkill, '1920s')).toBe(true)
    })
  })
})
