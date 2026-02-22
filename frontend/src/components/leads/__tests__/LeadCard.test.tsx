/**
 * LeadCard Component Tests
 *
 * Tests the LeadCard component which displays individual leads
 * with title, description, status, priority, and interactive status update.
 *
 * Test Coverage:
 * - Rendering correctness
 * - Lead title and description display
 * - Status badge display
 * - Priority badge display
 * - Interactive status update buttons
 * - Related events display
 * - AI generated indicator
 * - Timestamp display
 * - Custom className support
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LeadCard } from '../LeadCard'
import type { Lead, LeadStatus, LeadPriority, LeadType } from '@/types/lead'

/**
 * Mock Lead data factory for testing
 */
const createMockLead = (overrides?: Partial<Lead>): Lead => ({
  id: 'lead-123',
  session_id: 'session-456',
  campaign_id: 'campaign-789',
  title: 'Investigate the old mansion',
  description: 'Find out what happened to the previous owner',
  priority: 'medium' as LeadPriority,
  type: 'investigate' as LeadType,
  execution_method: 'command',
  execution_data: {},
  visibility: 'all',
  visible_to_player_ids: [],
  status: 'available' as LeadStatus,
  rewards: [],
  consequences: [],
  related_lead_ids: [],
  created_by_player_id: 1,
  auto_generated: false,
  ai_generated: true,
  ai_confidence: 85,
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

describe('LeadCard', () => {
  describe('Rendering', () => {
    it('should render without crashing', () => {
      const lead = createMockLead()
      const { container } = render(<LeadCard lead={lead} />)

      expect(container).toBeInTheDocument()
    })

    it('should display lead title', () => {
      const lead = createMockLead({
        title: 'Investigate the mansion',
      })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
    })

    it('should display lead description', () => {
      const lead = createMockLead({
        description: 'Find out what happened to the previous owner',
      })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/Find out what happened/i)).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const lead = createMockLead()
      const { container } = render(
        <LeadCard lead={lead} className="custom-class" />
      )

      const card = container.querySelector('.custom-class')
      expect(card).toBeInTheDocument()
    })
  })

  describe('Status Display', () => {
    it('should display available status badge', () => {
      const lead = createMockLead({ status: 'available' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/可用/i)).toBeInTheDocument()
    })

    it('should display in_progress status badge', () => {
      const lead = createMockLead({ status: 'in_progress' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/进行中/i)).toBeInTheDocument()
    })

    it('should display completed status badge', () => {
      const lead = createMockLead({ status: 'completed' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/已完成/i)).toBeInTheDocument()
    })

    it('should display failed status badge', () => {
      const lead = createMockLead({ status: 'failed' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/失败/i)).toBeInTheDocument()
    })

    it('should display expired status badge', () => {
      const lead = createMockLead({ status: 'expired' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/已过期/i)).toBeInTheDocument()
    })

    it('should display archived status badge', () => {
      const lead = createMockLead({ status: 'archived' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/已归档/i)).toBeInTheDocument()
    })
  })

  describe('Priority Display', () => {
    it('should display critical priority badge', () => {
      const lead = createMockLead({ priority: 'critical' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/紧急/i)).toBeInTheDocument()
    })

    it('should display high priority badge', () => {
      const lead = createMockLead({ priority: 'high' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/高/i)).toBeInTheDocument()
    })

    it('should display medium priority badge', () => {
      const lead = createMockLead({ priority: 'medium' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/中/i)).toBeInTheDocument()
    })

    it('should display low priority badge', () => {
      const lead = createMockLead({ priority: 'low' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/低/i)).toBeInTheDocument()
    })
  })

  describe('Type Display', () => {
    it('should display investigate type', () => {
      const lead = createMockLead({ type: 'investigate' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/调查/i)).toBeInTheDocument()
    })

    it('should display interact type', () => {
      const lead = createMockLead({ type: 'interact' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/互动/i)).toBeInTheDocument()
    })

    it('should display travel type', () => {
      const lead = createMockLead({ type: 'travel' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/旅行/i)).toBeInTheDocument()
    })

    it('should display combat type', () => {
      const lead = createMockLead({ type: 'combat' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/战斗/i)).toBeInTheDocument()
    })

    it('should display rest type', () => {
      const lead = createMockLead({ type: 'rest' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/休息/i)).toBeInTheDocument()
    })

    it('should display custom type', () => {
      const lead = createMockLead({ type: 'custom' })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/自定义/i)).toBeInTheDocument()
    })
  })

  describe('Status Update', () => {
    it('should show status update buttons when onStatusChange is provided', () => {
      const lead = createMockLead({ status: 'available' })
      const onStatusChange = vi.fn()

      render(<LeadCard lead={lead} onStatusChange={onStatusChange} />)

      expect(screen.getByText(/start/i)).toBeInTheDocument()
      expect(screen.getByText(/complete/i)).toBeInTheDocument()
    })

    it('should not show status update buttons when onStatusChange is not provided', () => {
      const lead = createMockLead({ status: 'available' })

      render(<LeadCard lead={lead} />)

      expect(screen.queryByText(/start/i)).not.toBeInTheDocument()
    })

    it('should show complete and fail buttons for in_progress status', () => {
      const lead = createMockLead({ status: 'in_progress' })
      const onStatusChange = vi.fn()

      render(<LeadCard lead={lead} onStatusChange={onStatusChange} />)

      expect(screen.getByText(/complete/i)).toBeInTheDocument()
      expect(screen.getByText(/fail/i)).toBeInTheDocument()
    })

    it('should call onStatusChange when Start button is clicked', async () => {
      const lead = createMockLead({ status: 'available' })
      const onStatusChange = vi.fn()

      render(<LeadCard lead={lead} onStatusChange={onStatusChange} />)

      const startButton = screen.getByText(/start/i)
      await userEvent.click(startButton)

      expect(onStatusChange).toHaveBeenCalledWith(lead.id, 'in_progress')
    })

    it('should call onStatusChange when Complete button is clicked', async () => {
      const lead = createMockLead({ status: 'available' })
      const onStatusChange = vi.fn()

      render(<LeadCard lead={lead} onStatusChange={onStatusChange} />)

      const completeButton = screen.getByText(/complete/i)
      await userEvent.click(completeButton)

      expect(onStatusChange).toHaveBeenCalledWith(lead.id, 'completed')
    })

    it('should call onStatusChange when Fail button is clicked', async () => {
      const lead = createMockLead({ status: 'in_progress' })
      const onStatusChange = vi.fn()

      render(<LeadCard lead={lead} onStatusChange={onStatusChange} />)

      const failButton = screen.getByText(/fail/i)
      await userEvent.click(failButton)

      expect(onStatusChange).toHaveBeenCalledWith(lead.id, 'failed')
    })
  })

  describe('AI Indicator', () => {
    it('should display AI badge when lead is AI generated', () => {
      const lead = createMockLead({ ai_generated: true })

      render(<LeadCard lead={lead} />)

      expect(screen.getByText(/AI/i)).toBeInTheDocument()
    })

    it('should not display AI badge when lead is not AI generated', () => {
      const lead = createMockLead({ ai_generated: false })

      render(<LeadCard lead={lead} />)

      expect(screen.queryByText(/AI/i)).not.toBeInTheDocument()
    })
  })

  describe('Timestamp Display', () => {
    it('should display creation timestamp', () => {
      const lead = createMockLead({
        created_at: '2025-01-15T10:00:00Z',
      })

      render(<LeadCard lead={lead} />)

      // Should display formatted date
      expect(screen.getByText(/Jan/i)).toBeInTheDocument()
    })
  })

  describe('Event Display', () => {
    it('should display related event count when source_event_id exists', () => {
      const lead = createMockLead({
        source_event_id: 'event-123',
      })

      render(<LeadCard lead={lead} />)

      // Should show event indicator
      expect(screen.getByTestId('related-event')).toBeInTheDocument()
    })

    it('should not display related event section when no source_event_id', () => {
      const lead = createMockLead({
        source_event_id: undefined,
      })

      render(<LeadCard lead={lead} />)

      expect(screen.queryByTestId('related-event')).not.toBeInTheDocument()
    })
  })

  describe('Click Handler', () => {
    it('should call onClick when card is clicked', async () => {
      const lead = createMockLead()
      const onClick = vi.fn()

      render(<LeadCard lead={lead} onClick={onClick} />)

      const card = screen.getByText(/Investigate the old mansion/)
      await userEvent.click(card)

      expect(onClick).toHaveBeenCalled()
    })
  })
})
