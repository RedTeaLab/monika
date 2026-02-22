// frontend/src/hooks/__tests__/useSkills.test.ts
// Comprehensive tests for useSkills hook

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSkills, getSkillBaseFallback, DEFAULT_SKILL_BASES } from '../useSkills'

// Mock the skills service
vi.mock('@/services/skills', () => ({
  fetchSkills: vi.fn(),
}))

import { fetchSkills } from '@/services/skills'

const mockFetchSkills = vi.mocked(fetchSkills)

const createMockSkill = (overrides = {}) => ({
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
  ...overrides,
})

describe('useSkills hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('initial state and autoLoad', () => {
    it('should have initial loading state true when autoLoad is true', () => {
      mockFetchSkills.mockImplementation(() => new Promise(() => {})) // Never resolves

      const { result } = renderHook(() => useSkills({ autoLoad: true }))

      expect(result.current.loading).toBe(true)
      expect(result.current.skills).toEqual([])
      expect(result.current.error).toBeNull()
    })

    it('should have initial loading state false when autoLoad is false', () => {
      const { result } = renderHook(() => useSkills({ autoLoad: false }))

      expect(result.current.loading).toBe(false)
      expect(result.current.skills).toEqual([])
      expect(result.current.error).toBeNull()
    })

    it('should autoLoad by default', () => {
      mockFetchSkills.mockImplementation(() => new Promise(() => {}))

      const { result } = renderHook(() => useSkills())

      expect(result.current.loading).toBe(true)
    })
  })

  describe('successful data loading', () => {
    it('should load skills successfully', async () => {
      const mockSkills = [
        createMockSkill({ id: 1, name: '格斗', base_value: 25 }),
        createMockSkill({ id: 2, name: '图书馆使用', base_value: 20 }),
      ]

      mockFetchSkills.mockResolvedValueOnce({
        skills: mockSkills,
        total: 2,
      })

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.skills).toHaveLength(2)
      expect(result.current.skills[0].name).toBe('格斗')
      expect(result.current.skills[1].name).toBe('图书馆使用')
      expect(result.current.error).toBeNull()
    })

    it('should load skills with era parameter', async () => {
      mockFetchSkills.mockResolvedValueOnce({
        skills: [createMockSkill()],
        total: 1,
      })

      renderHook(() => useSkills({ era: '1920s' }))

      await waitFor(() => {
        expect(mockFetchSkills).toHaveBeenCalledWith('1920s')
      })
    })

    it('should load skills with modern era parameter', async () => {
      mockFetchSkills.mockResolvedValueOnce({
        skills: [createMockSkill()],
        total: 1,
      })

      renderHook(() => useSkills({ era: 'modern' }))

      await waitFor(() => {
        expect(mockFetchSkills).toHaveBeenCalledWith('modern')
      })
    })
  })

  describe('error handling', () => {
    it('should handle API errors', async () => {
      mockFetchSkills.mockRejectedValueOnce(new Error('API Error'))

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('API Error')
      expect(result.current.skills).toEqual([])
    })

    it('should handle non-Error errors', async () => {
      mockFetchSkills.mockRejectedValueOnce('String error')

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('Failed to load skills')
      expect(result.current.skills).toEqual([])
    })

    it('should handle network errors', async () => {
      mockFetchSkills.mockRejectedValueOnce(new Error('Network failure'))

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.error).toBe('Network failure')
      })
    })

    it('should set skills to empty array on error', async () => {
      mockFetchSkills.mockRejectedValueOnce(new Error('Any error'))

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.skills).toEqual([])
      })
    })
  })

  describe('reload function', () => {
    it('should reload skills when reload is called', async () => {
      const mockSkills1 = [createMockSkill({ id: 1, name: '格斗' })]
      const mockSkills2 = [
        createMockSkill({ id: 1, name: '格斗' }),
        createMockSkill({ id: 2, name: '图书馆使用' }),
      ]

      mockFetchSkills
        .mockResolvedValueOnce({ skills: mockSkills1, total: 1 })
        .mockResolvedValueOnce({ skills: mockSkills2, total: 2 })

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.skills).toHaveLength(1)
      })

      act(() => {
        result.current.reload()
      })

      await waitFor(() => {
        expect(result.current.skills).toHaveLength(2)
      })

      expect(mockFetchSkills).toHaveBeenCalledTimes(2)
    })

    it('should set loading state during reload', async () => {
      mockFetchSkills.mockResolvedValueOnce({
        skills: [createMockSkill()],
        total: 1,
      })

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Create a promise that we can resolve manually
      let resolveSecond: (value: any) => void
      const secondPromise = new Promise((resolve) => {
        resolveSecond = resolve
      })
      mockFetchSkills.mockReturnValueOnce(secondPromise as any)

      act(() => {
        result.current.reload()
      })

      expect(result.current.loading).toBe(true)

      // Resolve the promise
      act(() => {
        resolveSecond!({ skills: [createMockSkill()], total: 1 })
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })

    it('should clear error on reload', async () => {
      mockFetchSkills.mockRejectedValueOnce(new Error('First error'))

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.error).toBe('First error')
      })

      mockFetchSkills.mockResolvedValueOnce({
        skills: [createMockSkill()],
        total: 1,
      })

      act(() => {
        result.current.reload()
      })

      await waitFor(() => {
        expect(result.current.error).toBeNull()
      })
    })
  })

  describe('getSkillBase utility', () => {
    it('should return base value for skill by Chinese name', async () => {
      const mockSkills = [createMockSkill({ name: '格斗', base_value: 25 })]

      mockFetchSkills.mockResolvedValueOnce({
        skills: mockSkills,
        total: 1,
      })

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.getSkillBase('格斗')).toBe(25)
    })

    it('should return base value for skill by English name', async () => {
      const mockSkills = [createMockSkill({ name_en: 'Fighting', base_value: 25 })]

      mockFetchSkills.mockResolvedValueOnce({
        skills: mockSkills,
        total: 1,
      })

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.getSkillBase('Fighting')).toBe(25)
    })

    it('should handle skill with specialization', async () => {
      const mockSkills = [createMockSkill({ name: '格斗', base_value: 25 })]

      mockFetchSkills.mockResolvedValueOnce({
        skills: mockSkills,
        total: 1,
      })

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // "格斗 (斗殴)" should find "格斗"
      expect(result.current.getSkillBase('格斗 (斗殴)')).toBe(25)
    })

    it('should return 0 for non-existent skill', async () => {
      mockFetchSkills.mockResolvedValueOnce({
        skills: [createMockSkill()],
        total: 1,
      })

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.getSkillBase('不存在的技能')).toBe(0)
    })

    it('should return 0 when skills list is empty', async () => {
      mockFetchSkills.mockResolvedValueOnce({
        skills: [],
        total: 0,
      })

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.getSkillBase('格斗')).toBe(0)
    })
  })

  describe('getSkillByName utility', () => {
    it('should find skill by Chinese name', async () => {
      const mockSkill = createMockSkill({ name: '格斗', base_value: 25 })
      mockFetchSkills.mockResolvedValueOnce({
        skills: [mockSkill],
        total: 1,
      })

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const found = result.current.getSkillByName('格斗')
      expect(found).toEqual(mockSkill)
    })

    it('should find skill by English name', async () => {
      const mockSkill = createMockSkill({ name_en: 'Fighting', base_value: 25 })
      mockFetchSkills.mockResolvedValueOnce({
        skills: [mockSkill],
        total: 1,
      })

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const found = result.current.getSkillByName('Fighting')
      expect(found).toEqual(mockSkill)
    })

    it('should return undefined for non-existent skill', async () => {
      mockFetchSkills.mockResolvedValueOnce({
        skills: [createMockSkill()],
        total: 1,
      })

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const found = result.current.getSkillByName('NonExistent')
      expect(found).toBeUndefined()
    })

    it('should return undefined when skills list is empty', async () => {
      mockFetchSkills.mockResolvedValueOnce({
        skills: [],
        total: 0,
      })

      const { result } = renderHook(() => useSkills())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const found = result.current.getSkillByName('格斗')
      expect(found).toBeUndefined()
    })
  })

  describe('era changes', () => {
    it('should reload skills when era changes', async () => {
      mockFetchSkills.mockResolvedValue({
        skills: [createMockSkill()],
        total: 1,
      })

      const { result, rerender } = renderHook(
        ({ era }: { era?: 'modern' | '1920s' }) => useSkills({ era }),
        { initialProps: { era: undefined } }
      )

      await waitFor(() => {
        expect(mockFetchSkills).toHaveBeenCalledTimes(1)
      })

      rerender({ era: '1920s' })

      await waitFor(() => {
        expect(mockFetchSkills).toHaveBeenCalledWith('1920s')
      })
    })
  })
})

describe('getSkillBaseFallback utility', () => {
  it('should return base value for common skill', () => {
    expect(getSkillBaseFallback('格斗')).toBe(25)
  })

  it('should return base value for skill with specialization', () => {
    expect(getSkillBaseFallback('格斗 (斗殴)')).toBe(25)
  })

  it('should return 0 for unknown skill', () => {
    expect(getSkillBaseFallback('未知技能')).toBe(0)
  })

  it('should return 0 for skill not in defaults', () => {
    expect(getSkillBaseFallback('RandomSkill')).toBe(0)
  })

  it('should handle all default skills', () => {
    expect(getSkillBaseFallback('射击')).toBe(20)
    expect(getSkillBaseFallback('闪避')).toBe(0) // DEX/2
    expect(getSkillBaseFallback('魅力')).toBe(15)
    expect(getSkillBaseFallback('图书馆使用')).toBe(20)
    expect(getSkillBaseFallback('急救')).toBe(30)
  })
})

describe('DEFAULT_SKILL_BASES constant', () => {
  it('should contain common skills', () => {
    expect(DEFAULT_SKILL_BASES['格斗']).toBe(25)
    expect(DEFAULT_SKILL_BASES['射击']).toBe(20)
    expect(DEFAULT_SKILL_BASES['图书馆使用']).toBe(20)
  })

  it('should have special values for attribute-based skills', () => {
    // These skills have base values derived from attributes
    expect(DEFAULT_SKILL_BASES['闪避']).toBe(0) // DEX/2
    expect(DEFAULT_SKILL_BASES['母语']).toBe(0) // EDU
    expect(DEFAULT_SKILL_BASES['信用评级']).toBe(0)
  })

  it('should have correct number of default skills', () => {
    const keys = Object.keys(DEFAULT_SKILL_BASES)
    expect(keys.length).toBeGreaterThan(10)
  })
})
