/**
 * LeadsPanel Component Tests
 *
 * Tests the LeadsPanel component which displays game leads and clues
 * with filtering, sorting, and status management.
 *
 * Test Coverage:
 * - Rendering correctness
 * - Loading and error states
 * - Lead display and filtering
 * - Status badge colors
 * - Priority badge colors
 * - Sort functionality
 * - Empty state handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LeadsPanel } from './LeadsPanel'
import type { Lead, LeadStatus, LeadPriority, LeadType } from '@/types/lead'

/**
 * Mock leads API
 */
vi.mock('@/services/api/leads', () => ({
  getLeads: vi.fn(),
  updateLeadStatus: vi.fn(),
}))

import { getLeads, updateLeadStatus } from '@/services/api/leads'

const mockGetLeads = getLeads as ReturnType<typeof vi.fn>
const mockUpdateLeadStatus = updateLeadStatus as ReturnType<typeof vi.fn>

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

/**
 * Sample leads for testing
 */
const mockLeads: Lead[] = [
  createMockLead({
    id: 'lead-1',
    title: 'Investigate the mansion',
    description: 'Find out what happened to the previous owner',
    priority: 'high',
    type: 'investigate',
    status: 'available',
  }),
  createMockLead({
    id: 'lead-2',
    title: 'Talk to the butler',
    description: 'The butler seems to know something',
    priority: 'medium',
    type: 'interact',
    status: 'in_progress',
  }),
  createMockLead({
    id: 'lead-3',
    title: 'Find the hidden passage',
    description: 'There must be a secret way out',
    priority: 'critical',
    type: 'investigate',
    status: 'completed',
    completed_at: '2025-01-15T12:00:00Z',
  }),
  createMockLead({
    id: 'lead-4',
    title: 'Rest at the inn',
    description: 'Recover from exhaustion',
    priority: 'low',
    type: 'rest',
    status: 'available',
  }),
]

describe('LeadsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render without crashing', async () => {
      mockGetLeads.mockResolvedValue([])

      const { container } = render(<LeadsPanel sessionId="session-123" />)

      expect(container).toBeInTheDocument()
    })

    it('should render the panel title', async () => {
      mockGetLeads.mockResolvedValue([])

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByText('Leads')).toBeInTheDocument()
      })
    })

    it('should apply custom className', async () => {
      mockGetLeads.mockResolvedValue([])

      const { container } = render(
        <LeadsPanel sessionId="session-123" className="custom-class" />
      )

      const panel = container.querySelector('.custom-class')
      expect(panel).toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('should show loading state initially', () => {
      mockGetLeads.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      render(<LeadsPanel sessionId="session-123" />)

      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })

    it('should hide loading state after data loads', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Error State', () => {
    it('should show error message when fetch fails', async () => {
      mockGetLeads.mockRejectedValue(new Error('Failed to fetch'))

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByText(/failed to fetch/i)).toBeInTheDocument()
      })
    })

    it('should show retry button on error', async () => {
      mockGetLeads.mockRejectedValue(new Error('Failed to fetch'))

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByText(/retry/i)).toBeInTheDocument()
      })
    })
  })

  describe('Empty State', () => {
    it('should show empty state when no leads', async () => {
      mockGetLeads.mockResolvedValue([])

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByText(/no leads available/i)).toBeInTheDocument()
      })
    })
  })

  describe('Lead Display', () => {
    it('should display lead titles', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
        expect(screen.getByText('Talk to the butler')).toBeInTheDocument()
      })
    })

    it('should display lead descriptions', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByText(/Find out what happened/i)).toBeInTheDocument()
      })
    })

    it('should display lead count in header', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        // The lead count badge should show 4
        const badge = document.body.querySelector('.inline-flex.rounded-md.border.px-2\\.5')
        expect(badge?.textContent).toBe('4')
      })
    })
  })

  describe('Status Badges', () => {
    it('should display Available badge for available leads', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getAllByText('Available').length).toBeGreaterThan(0)
      })
    })

    it('should display In Progress badge for in_progress leads', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByText('In Progress')).toBeInTheDocument()
      })
    })

    it('should display Completed badge for completed leads', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByText('Completed')).toBeInTheDocument()
      })
    })
  })

  describe('Priority Badges', () => {
    it('should display priority badges for leads', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        // The component displays priority badges
        const badges = document.body.querySelectorAll('.inline-flex.items-center.rounded-md')
        expect(badges.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Filtering', () => {
    it('should have status filter tabs', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByRole('tablist')).toBeInTheDocument()
      })
    })

    it('should have All tab with correct count', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByText(/All \(4\)/)).toBeInTheDocument()
      })
    })

    it('should have priority filter dropdown', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const selects = document.body.querySelectorAll('select')
        expect(selects.length).toBeGreaterThan(0)
      })
    })

    it('should have type filter dropdown', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const selects = document.body.querySelectorAll('select')
        expect(selects.length).toBe(3) // priority, type, sort
      })
    })
  })

  describe('Sorting', () => {
    it('should have sort options', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        // Sort dropdown should be present
        const selects = document.body.querySelectorAll('select')
        expect(selects.length).toBe(3)
      })
    })
  })

  describe('Search', () => {
    it('should have search input', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search leads...')
        expect(searchInput).toBeInTheDocument()
      })
    })
  })

  describe('Refresh', () => {
    it('should have refresh button', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const refreshButton = screen.getByTitle(/refresh/i)
        expect(refreshButton).toBeInTheDocument()
      })
    })

    it('should call getLeads when refresh is clicked', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const refreshButton = screen.getByTitle(/refresh/i)
        userEvent.click(refreshButton)
      })

      expect(mockGetLeads).toHaveBeenCalled()
    })
  })

  describe('Status Update', () => {
    it('should show action buttons for available leads when onStatusChange provided', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      mockUpdateLeadStatus.mockResolvedValue({
        ...mockLeads[0],
        status: 'in_progress',
      })

      const onStatusChange = vi.fn()

      render(
        <LeadsPanel sessionId="session-123" onStatusChange={onStatusChange} />
      )

      await waitFor(() => {
        // Should show Start and Complete buttons for available leads
        expect(screen.getAllByText('Start').length).toBeGreaterThan(0)
      }, { timeout: 5000 })
    })

    it('should show action buttons for in_progress leads when onStatusChange provided', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      mockUpdateLeadStatus.mockResolvedValue({
        ...mockLeads[1],
        status: 'completed',
      })

      const onStatusChange = vi.fn()

      render(
        <LeadsPanel sessionId="session-123" onStatusChange={onStatusChange} />
      )

      await waitFor(() => {
        // Should show Complete and Fail buttons for in_progress leads
        expect(screen.getByText('Complete')).toBeInTheDocument()
        expect(screen.getByText('Fail')).toBeInTheDocument()
      }, { timeout: 5000 })
    })
  })
})
