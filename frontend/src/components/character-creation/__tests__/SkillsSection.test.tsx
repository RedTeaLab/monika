// frontend/src/components/character-creation/__tests__/SkillsSection.test.tsx
// Comprehensive tests for SkillsSection component

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SkillsSection } from '../SkillsSection'
import type { Occupation } from '@/types/characterCreation'

// Mock the useSkills hook
vi.mock('@/hooks/useSkills', () => ({
  useSkills: vi.fn(),
  getSkillBaseFallback: vi.fn((name: string) => {
    const defaults: Record<string, number> = {
      '格斗': 25,
      '射击': 20,
      '图书馆使用': 20,
      '信用评级': 0,
    }
    return defaults[name] ?? 10
  }),
}))

import { useSkills } from '@/hooks/useSkills'

const mockUseSkills = vi.mocked(useSkills)

// Mock skill data
const mockSkills = [
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
  {
    id: 3,
    name: '心理学',
    name_en: 'Psychology',
    base_value: 10,
    category: 'social',
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

// Default mock occupation
const mockOccupation: Occupation = {
  id: 'antiquarian',
  name: '古文物学家',
  nameEn: 'Antiquarian',
  isCustom: false,
  fixed_skills: ['估价', '历史', '图书馆使用', '侦查'],
  optional_skills: [
    { category: 'art_craft', count: 1 },
    { category: 'language', count: 1 },
  ],
  free_skill_slots: 1,
  credit_rating_min: 30,
  credit_rating_max: 70,
  skill_point_formula: 'edu4',
}

// Default props
const defaultProps = {
  occupation: null as Occupation | null,
  attributes: { edu: 70, int: 70, dex: 50, str: 50, app: 50, pow: 50 },
  skills: {} as Record<string, number>,
  occupationalPointsRemaining: 280,
  interestPointsRemaining: 140,
  dispatch: vi.fn(),
}

describe('SkillsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementation
    mockUseSkills.mockReturnValue({
      skills: mockSkills,
      loading: false,
      error: null,
      reload: vi.fn(),
      getSkillBase: (name: string) => {
        const skill = mockSkills.find(s => s.name === name || s.name_en === name)
        return skill?.base_value ?? 0
      },
      getSkillByName: (name: string) => mockSkills.find(s => s.name === name || s.name_en === name),
    })
  })

  describe('rendering', () => {
    it('should render the skills section card', () => {
      render(<SkillsSection {...defaultProps} />)

      expect(screen.getByText('技能分配')).toBeInTheDocument()
    })

    it('should render occupation selection button', () => {
      render(<SkillsSection {...defaultProps} />)

      // Use regex to match partial text since there's an arrow character
      expect(screen.getByText(/点击选择职业/)).toBeInTheDocument()
    })

    it('should show selected occupation name', () => {
      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)

      expect(screen.getByText('古文物学家')).toBeInTheDocument()
    })

    it('should display skill points summary', () => {
      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)

      expect(screen.getByText('本职技能点')).toBeInTheDocument()
      expect(screen.getByText('兴趣技能点')).toBeInTheDocument()
    })

    it('should show skill point formula', () => {
      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)

      expect(screen.getByText(/EDU/)).toBeInTheDocument()
    })

    it('should display credit rating range when occupation selected', () => {
      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)

      expect(screen.getByText(/信用评级范围/)).toBeInTheDocument()
      // The format is "30 - 70" with spaces
      expect(screen.getByText(/30.*70/)).toBeInTheDocument()
    })

    it('should show prompt to select occupation when none selected', () => {
      render(<SkillsSection {...defaultProps} />)

      expect(screen.getByText('请先选择职业以开始分配技能点')).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('should show loading state when skills are loading', () => {
      mockUseSkills.mockReturnValue({
        skills: [],
        loading: true,
        error: null,
        reload: vi.fn(),
        getSkillBase: () => 0,
        getSkillByName: () => undefined,
      })

      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)

      expect(screen.getByText('加载技能数据...')).toBeInTheDocument()
    })
  })

  describe('error handling', () => {
    it('should handle skills loading error gracefully', () => {
      mockUseSkills.mockReturnValue({
        skills: [],
        loading: false,
        error: 'Failed to load skills',
        reload: vi.fn(),
        getSkillBase: () => 0,
        getSkillByName: () => undefined,
      })

      // Should not crash
      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)
      expect(screen.getByText('技能分配')).toBeInTheDocument()
    })
  })

  describe('occupation selection', () => {
    it('should open occupation dialog when button clicked', async () => {
      const user = userEvent.setup()
      render(<SkillsSection {...defaultProps} />)

      await user.click(screen.getByText(/点击选择职业/))

      expect(screen.getByText('选择职业')).toBeInTheDocument()
      expect(screen.getByText('预置职业')).toBeInTheDocument()
      expect(screen.getByText('自定义职业')).toBeInTheDocument()
    })

    it('should dispatch SET_OCCUPATION when occupation selected', async () => {
      const dispatch = vi.fn()
      const user = userEvent.setup()
      render(<SkillsSection {...defaultProps} dispatch={dispatch} />)

      // Open dialog
      await user.click(screen.getByText(/点击选择职业/))

      // Find and click an occupation (古文物学家)
      const occupationCard = screen.getByText('古文物学家/古董收藏家')
      await user.click(occupationCard)

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SET_OCCUPATION',
          occupation: expect.objectContaining({
            id: 'antiquarian',
          }),
        })
      )
    })

    it('should allow selecting custom occupation', async () => {
      const dispatch = vi.fn()
      const user = userEvent.setup()
      render(<SkillsSection {...defaultProps} dispatch={dispatch} />)

      // Open dialog
      await user.click(screen.getByText(/点击选择职业/))

      // Switch to custom tab
      await user.click(screen.getByText('自定义职业'))

      // Click custom occupation button
      await user.click(screen.getByText('选择自定义职业'))

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SET_OCCUPATION',
          occupation: expect.objectContaining({
            id: 'custom',
            isCustom: true,
          }),
        })
      )
    })
  })

  describe('tabs navigation', () => {
    it('should render all tabs when occupation selected', () => {
      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)

      expect(screen.getByText('职业技能')).toBeInTheDocument()
      expect(screen.getByText('兴趣技能')).toBeInTheDocument()
      expect(screen.getByText('武器技能')).toBeInTheDocument()
      expect(screen.getByText('信用评级')).toBeInTheDocument()
    })
  })

  describe('skill allocation', () => {
    it('should display fixed skills for occupation', () => {
      render(
        <SkillsSection
          {...defaultProps}
          occupation={mockOccupation}
        />
      )

      expect(screen.getByText('必备技能')).toBeInTheDocument()
    })

    it('should dispatch CHANGE_SKILL when skill increased', async () => {
      const dispatch = vi.fn()
      const user = userEvent.setup()

      render(
        <SkillsSection
          {...defaultProps}
          occupation={mockOccupation}
          skills={{ '图书馆使用': 20 }}
          dispatch={dispatch}
        />
      )

      // Find and click the + button for a fixed skill
      const plusButtons = screen.getAllByRole('button', { name: '+' })
      if (plusButtons.length > 0) {
        await user.click(plusButtons[0])
        expect(dispatch).toHaveBeenCalled()
      }
    })

    it('should have minus buttons for allocated skills', async () => {
      render(
        <SkillsSection
          {...defaultProps}
          occupation={mockOccupation}
          skills={{ '图书馆使用': 20 }}
        />
      )

      // Find the - buttons (should exist for allocated skills)
      const minusButtons = screen.getAllByRole('button', { name: '-' })
      expect(minusButtons.length).toBeGreaterThan(0)
    })
  })

  describe('search functionality', () => {
    it('should have search input for skills', async () => {
      const user = userEvent.setup()
      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)

      const searchInputs = screen.getAllByPlaceholderText('搜索技能...')
      expect(searchInputs.length).toBeGreaterThan(0)

      await user.type(searchInputs[0], '格斗')
      expect(searchInputs[0]).toHaveValue('格斗')
    })

    it('should filter skills based on search term', async () => {
      const user = userEvent.setup()
      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)

      const searchInputs = screen.getAllByPlaceholderText('搜索技能...')
      await user.type(searchInputs[0], '心理学')

      // After filtering, psychology-related skills should appear
      expect(screen.getByText('心理学')).toBeInTheDocument()
    })
  })

  describe('credit rating', () => {
    it('should display credit rating tab content', () => {
      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)

      expect(screen.getByText('信用评级')).toBeInTheDocument()
    })

    it('should show credit rating range info', () => {
      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)

      // Check for the credit rating range text
      expect(screen.getByText(/信用评级范围/)).toBeInTheDocument()
    })
  })

  describe('skill point calculations', () => {
    it('should calculate occupational points based on EDU', () => {
      render(
        <SkillsSection
          {...defaultProps}
          occupation={mockOccupation}
          attributes={{ ...defaultProps.attributes, edu: 80 }}
        />
      )

      // EDU * 4 = 320
      // Use regex since the number may appear in multiple places
      expect(screen.getByText(/320/)).toBeInTheDocument()
    })

    it('should calculate interest points based on INT', () => {
      render(
        <SkillsSection
          {...defaultProps}
          occupation={mockOccupation}
          attributes={{ ...defaultProps.attributes, int: 60 }}
        />
      )

      // INT * 2 = 120
      expect(screen.getByText(/120/)).toBeInTheDocument()
    })

    it('should use different formula based on occupation', () => {
      const customOccupation: Occupation = {
        ...mockOccupation,
        skill_point_formula: 'edu2_dex2',
      }

      render(
        <SkillsSection
          {...defaultProps}
          occupation={customOccupation}
          attributes={{ ...defaultProps.attributes, edu: 60, dex: 50 }}
        />
      )

      // EDU*2 + DEX*2 = 120 + 100 = 220
      expect(screen.getByText(/220/)).toBeInTheDocument()
    })
  })

  describe('component integration', () => {
    it('should use useSkills hook for skill data', () => {
      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)

      expect(mockUseSkills).toHaveBeenCalled()
    })

    it('should handle empty skills array', () => {
      mockUseSkills.mockReturnValue({
        skills: [],
        loading: false,
        error: null,
        reload: vi.fn(),
        getSkillBase: () => 0,
        getSkillByName: () => undefined,
      })

      render(<SkillsSection {...defaultProps} occupation={mockOccupation} />)
      expect(screen.getByText('技能分配')).toBeInTheDocument()
    })
  })
})
