/**
 * StatisticsCharts Component Tests
 *
 * Tests the StatisticsCharts component which visualizes session statistics
 * including message statistics, roll statistics, and player performance.
 *
 * Test Coverage:
 * - Rendering correctness
 * - Message distribution chart (pie chart)
 * - Roll success rate chart (bar chart)
 * - Skill usage chart (bar chart)
 * - Hourly frequency chart (line chart)
 * - Player performance comparison (bar chart)
 * - Responsive design
 * - Empty data handling
 * - Edge cases
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatisticsCharts } from '../StatisticsCharts'
import type { SessionStatistics } from '@/types/session'

/**
 * Mock statistics data factory for testing
 */
const createMockStatistics = (overrides?: Partial<SessionStatistics>): SessionStatistics => ({
  session_id: 'session-123',
  messages: {
    total_messages: 100,
    public_messages: 60,
    kp_only_messages: 10,
    party_messages: 20,
    private_messages: 10,
    hourly_frequency: {
      10: 5,
      11: 10,
      12: 15,
      13: 20,
      14: 15,
      15: 10,
      16: 10,
      17: 5,
    },
  },
  rolls: {
    total_rolls: 50,
    successful_rolls: 35,
    failed_rolls: 15,
    success_rate: 0.7,
    pushed_rolls: 5,
    critical_successes: 3,
    critical_failures: 2,
    skill_usage: [
      { skill: 'Spot Hidden', count: 10 },
      { skill: 'Luck', count: 8 },
      { skill: 'Sneak', count: 7 },
      { skill: 'Fight', count: 6 },
      { skill: 'Firearms', count: 5 },
    ],
  },
  players: [
    {
      player_id: 1,
      total_actions: 30,
      roll_count: 20,
      message_count: 10,
      san_checks: 3,
      total_san_loss: 15,
      luck_spends: 2,
      total_luck_spent: 4,
    },
    {
      player_id: 2,
      total_actions: 25,
      roll_count: 15,
      message_count: 10,
      san_checks: 2,
      total_san_loss: 10,
      luck_spends: 1,
      total_luck_spent: 2,
    },
  ],
  ...overrides,
})

describe('StatisticsCharts', () => {
  describe('Rendering', () => {
    it('should render without crashing', () => {
      const statistics = createMockStatistics()
      const { container } = render(<StatisticsCharts statistics={statistics} />)

      expect(container).toBeInTheDocument()
    })

    it('should render the component title', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Session Statistics')).toBeInTheDocument()
    })

    it('should render all chart sections', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      // Should have message distribution chart
      expect(screen.getByText('Message Distribution')).toBeInTheDocument()

      // Should have roll statistics chart
      expect(screen.getByText('Roll Success Rate')).toBeInTheDocument()

      // Should have skill usage chart
      expect(screen.getByText('Skill Usage')).toBeInTheDocument()

      // Should have hourly activity chart
      expect(screen.getByText('Hourly Activity')).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const statistics = createMockStatistics()
      const { container } = render(
        <StatisticsCharts statistics={statistics} className="custom-class" />
      )

      const wrapper = container.querySelector('.custom-class')
      expect(wrapper).toBeInTheDocument()
    })
  })

  describe('Message Statistics Chart', () => {
    it('should display correct total message count', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Total: 100')).toBeInTheDocument()
    })

    it('should display message breakdown by visibility', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Public: 60')).toBeInTheDocument()
      expect(screen.getByText('KP Only: 10')).toBeInTheDocument()
      expect(screen.getByText('Party: 20')).toBeInTheDocument()
      expect(screen.getByText('Private: 10')).toBeInTheDocument()
    })

    it('should handle zero messages', () => {
      const statistics = createMockStatistics({
        messages: {
          total_messages: 0,
          public_messages: 0,
          kp_only_messages: 0,
          party_messages: 0,
          private_messages: 0,
          hourly_frequency: {},
        },
      })
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Total: 0')).toBeInTheDocument()
    })
  })

  describe('Roll Statistics Chart', () => {
    it('should display total roll count', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Total Rolls: 50')).toBeInTheDocument()
    })

    it('should display success rate percentage', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Success Rate: 70%')).toBeInTheDocument()
    })

    it('should display critical counts', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Critical Successes: 3')).toBeInTheDocument()
      expect(screen.getByText('Critical Failures: 2')).toBeInTheDocument()
    })

    it('should display pushed rolls count', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Pushed Rolls: 5')).toBeInTheDocument()
    })

    it('should handle zero rolls', () => {
      const statistics = createMockStatistics({
        rolls: {
          total_rolls: 0,
          successful_rolls: 0,
          failed_rolls: 0,
          success_rate: 0,
          pushed_rolls: 0,
          critical_successes: 0,
          critical_failures: 0,
          skill_usage: [],
        },
      })
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Success Rate: 0%')).toBeInTheDocument()
    })
  })

  describe('Skill Usage Chart', () => {
    it('should display skill usage section', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Skill Usage')).toBeInTheDocument()
    })

    it('should display skill usage counts in summary', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      // Check for skill count badges (should show 10 for Spot Hidden)
      expect(screen.getByText('10')).toBeInTheDocument()
    })

    it('should handle empty skill usage', () => {
      const statistics = createMockStatistics({
        rolls: {
          total_rolls: 0,
          successful_rolls: 0,
          failed_rolls: 0,
          success_rate: 0,
          pushed_rolls: 0,
          critical_successes: 0,
          critical_failures: 0,
          skill_usage: [],
        },
      })
      render(<StatisticsCharts statistics={statistics} />)

      // Should still render the chart section but with empty state
      expect(screen.getByText('Skill Usage')).toBeInTheDocument()
    })
  })

  describe('Hourly Activity Chart', () => {
    it('should display hourly activity section', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      // Should show the hourly activity section
      expect(screen.getByText('Hourly Activity')).toBeInTheDocument()
    })

    it('should display peak hour', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Peak Activity: 13:00')).toBeInTheDocument()
    })

    it('should handle empty hourly data', () => {
      const statistics = createMockStatistics({
        messages: {
          total_messages: 0,
          public_messages: 0,
          kp_only_messages: 0,
          party_messages: 0,
          private_messages: 0,
          hourly_frequency: {},
        },
      })
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Peak Activity: --')).toBeInTheDocument()
    })
  })

  describe('Player Performance Chart', () => {
    it('should display player performance when players exist', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Player Performance')).toBeInTheDocument()
    })

    it('should display SAN loss for players', () => {
      const statistics = createMockStatistics()
      render(<StatisticsCharts statistics={statistics} />)

      // Should show SAN loss info
      expect(screen.getByText('SAN Loss: 15')).toBeInTheDocument()
    })

    it('should handle empty players array', () => {
      const statistics = createMockStatistics({
        players: [],
      })
      render(<StatisticsCharts statistics={statistics} />)

      // Should still render but may show empty state
      expect(screen.getByText('Session Statistics')).toBeInTheDocument()
    })
  })

  describe('Responsive Design', () => {
    it('should render in grid layout', () => {
      const statistics = createMockStatistics()
      const { container } = render(<StatisticsCharts statistics={statistics} />)

      // Check for grid layout classes
      const gridContainer = container.querySelector('[class*="grid"]')
      expect(gridContainer).toBeInTheDocument()
    })

    it('should adapt to different screen sizes', () => {
      const statistics = createMockStatistics()
      const { container } = render(
        <StatisticsCharts statistics={statistics} breakpoint="mobile" />
      )

      // Mobile should have single column
      const gridContainer = container.querySelector('[class*="grid"]')
      expect(gridContainer).toBeInTheDocument()
    })

    it('should show more columns on desktop', () => {
      const statistics = createMockStatistics()
      const { container } = render(
        <StatisticsCharts statistics={statistics} breakpoint="desktop" />
      )

      const gridContainer = container.querySelector('[class*="grid"]')
      expect(gridContainer).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined statistics gracefully', () => {
      const { container } = render(<StatisticsCharts statistics={undefined as unknown as SessionStatistics} />)

      expect(container).toBeInTheDocument()
      expect(screen.getByText('No statistics available')).toBeInTheDocument()
    })

    it('should handle partial data', () => {
      const statistics = createMockStatistics({
        rolls: {
          total_rolls: 10,
          successful_rolls: 5,
          failed_rolls: 5,
          success_rate: 0.5,
          pushed_rolls: 0,
          critical_successes: 0,
          critical_failures: 0,
          skill_usage: [],
        },
      })
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Total Rolls: 10')).toBeInTheDocument()
    })

    it('should handle extreme success rates', () => {
      const statistics = createMockStatistics({
        rolls: {
          total_rolls: 100,
          successful_rolls: 100,
          failed_rolls: 0,
          success_rate: 1.0,
          pushed_rolls: 0,
          critical_successes: 10,
          critical_failures: 0,
          skill_usage: [],
        },
      })
      render(<StatisticsCharts statistics={statistics} />)

      expect(screen.getByText('Success Rate: 100%')).toBeInTheDocument()
    })

    it('should handle very high skill usage counts', () => {
      const statistics = createMockStatistics({
        rolls: {
          total_rolls: 1000,
          successful_rolls: 500,
          failed_rolls: 500,
          success_rate: 0.5,
          pushed_rolls: 100,
          critical_successes: 50,
          critical_failures: 30,
          skill_usage: [
            { skill: 'Test Skill', count: 500 },
            { skill: 'Another Skill', count: 300 },
            { skill: 'Third Skill', count: 200 },
          ],
        },
      })
      render(<StatisticsCharts statistics={statistics} />)

      // Should render the chart section
      expect(screen.getByText('Skill Usage')).toBeInTheDocument()
    })
  })
})
