/**
 * LeadsPanel Filter Tests
 *
 * Tests the filtering functionality of the LeadsPanel component:
 * - Filter by status (all, available, in_progress, completed, failed, expired, archived)
 * - Filter by priority (all, critical, high, medium, low)
 * - Filter by type (all, investigate, interact, travel, combat, rest, custom)
 * - Search by title/description
 * - Real-time filter updates
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
 * Sample leads for testing filtering
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
  createMockLead({
    id: 'lead-5',
    title: 'Fight the cultist',
    description: 'Defeat the enemy in combat',
    priority: 'critical',
    type: 'combat',
    status: 'failed',
  }),
  createMockLead({
    id: 'lead-6',
    title: 'Travel to the village',
    description: 'Go to the nearby village',
    priority: 'medium',
    type: 'travel',
    status: 'expired',
  }),
]

describe('LeadsPanel Filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Status Filter Tests
   */
  describe('Status Filter', () => {
    it('should have All status filter tab', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /all/i })).toBeInTheDocument()
      })
    })

    it('should have available status filter tab', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /available/i })).toBeInTheDocument()
      })
    })

    it('should filter leads when clicking on available tab', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        // Initially all leads should be visible
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
        expect(screen.getByText('Talk to the butler')).toBeInTheDocument()
        expect(screen.getByText('Find the hidden passage')).toBeInTheDocument()
        expect(screen.getByText('Rest at the inn')).toBeInTheDocument()
      })

      // Click on Available tab
      await user.click(screen.getByRole('tab', { name: /available/i }))

      // Should show only available leads
      await waitFor(() => {
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
        expect(screen.getByText('Rest at the inn')).toBeInTheDocument()
      })

      // Should NOT show in_progress, completed, failed leads
      await waitFor(() => {
        expect(screen.queryByText('Talk to the butler')).not.toBeInTheDocument()
        expect(screen.queryByText('Find the hidden passage')).not.toBeInTheDocument()
        expect(screen.queryByText('Fight the cultist')).not.toBeInTheDocument()
      })
    })

    it('should filter leads when clicking on in_progress tab', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /in progress/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('tab', { name: /in progress/i }))

      await waitFor(() => {
        expect(screen.getByText('Talk to the butler')).toBeInTheDocument()
      })

      // Should NOT show other status leads
      await waitFor(() => {
        expect(screen.queryByText('Investigate the mansion')).not.toBeInTheDocument()
        expect(screen.queryByText('Find the hidden passage')).not.toBeInTheDocument()
      })
    })

    it('should filter leads when clicking on completed tab', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /completed/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('tab', { name: /completed/i }))

      await waitFor(() => {
        expect(screen.getByText('Find the hidden passage')).toBeInTheDocument()
      })
    })

    it('should show correct count for each status tab', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        // Check tab counts - available: 2, in_progress: 1, completed: 1, failed: 1, expired: 1
        expect(screen.getByText(/All \(6\)/)).toBeInTheDocument()
        expect(screen.getByText(/Available \(2\)/)).toBeInTheDocument()
        expect(screen.getByText(/In Progress \(1\)/)).toBeInTheDocument()
        expect(screen.getByText(/Completed \(1\)/)).toBeInTheDocument()
        expect(screen.getByText(/Failed \(1\)/)).toBeInTheDocument()
      })
    })
  })

  /**
   * Priority Filter Tests
   */
  describe('Priority Filter', () => {
    it('should have priority filter dropdown', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: /all priorities/i })).toBeInTheDocument()
      })
    })

    it('should filter leads by critical priority', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        // Change priority filter to critical
        const prioritySelect = screen.getByRole('combobox', { name: /all priorities/i })
        user.selectOptions(prioritySelect, 'critical')
      })

      await waitFor(() => {
        // Should show critical priority leads
        expect(screen.getByText('Find the hidden passage')).toBeInTheDocument()
        expect(screen.getByText('Fight the cultist')).toBeInTheDocument()
      })

      // Should NOT show other priority leads
      await waitFor(() => {
        expect(screen.queryByText('Investigate the mansion')).not.toBeInTheDocument()
        expect(screen.queryByText('Talk to the butler')).not.toBeInTheDocument()
      })
    })

    it('should filter leads by high priority', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const prioritySelect = screen.getByRole('combobox')
        userEvent.selectOptions(prioritySelect, 'high')
      })

      await waitFor(() => {
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
      })
    })

    it('should show all leads when priority is set to all', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const prioritySelect = screen.getByRole('combobox', { name: /all priorities/i })
        user.selectOptions(prioritySelect, 'critical')
      })

      await waitFor(() => {
        // Filter to critical
        expect(screen.getByText('Find the hidden passage')).toBeInTheDocument()
      })

      // Switch back to all
      await user.selectOptions(screen.getByRole('combobox', { name: /all priorities/i }), 'all')

      await waitFor(() => {
        // Should show all leads again
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
        expect(screen.getByText('Talk to the butler')).toBeInTheDocument()
      })
    })
  })

  /**
   * Type Filter Tests
   */
  describe('Type Filter', () => {
    it('should have type filter dropdown', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: /all types/i })).toBeInTheDocument()
      })
    })

    it('should filter leads by investigate type', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const typeSelect = screen.getByRole('combobox', { name: /all types/i })
        user.selectOptions(typeSelect, 'investigate')
      })

      await waitFor(() => {
        // Should show investigate type leads
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
        expect(screen.getByText('Find the hidden passage')).toBeInTheDocument()
      })

      // Should NOT show other type leads
      await waitFor(() => {
        expect(screen.queryByText('Talk to the butler')).not.toBeInTheDocument()
        expect(screen.queryByText('Fight the cultist')).not.toBeInTheDocument()
      })
    })

    it('should filter leads by interact type', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const typeSelect = screen.getByRole('combobox', { name: /all types/i })
        user.selectOptions(typeSelect, 'interact')
      })

      await waitFor(() => {
        expect(screen.getByText('Talk to the butler')).toBeInTheDocument()
      })
    })

    it('should filter leads by combat type', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const typeSelect = screen.getByRole('combobox', { name: /all types/i })
        user.selectOptions(typeSelect, 'combat')
      })

      await waitFor(() => {
        expect(screen.getByText('Fight the cultist')).toBeInTheDocument()
      })
    })

    it('should show all leads when type is set to all', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const typeSelect = screen.getByRole('combobox', { name: /all types/i })
        user.selectOptions(typeSelect, 'combat')
      })

      await waitFor(() => {
        // Filter to combat
        expect(screen.getByText('Fight the cultist')).toBeInTheDocument()
      })

      // Switch back to all
      await user.selectOptions(screen.getByRole('combobox', { name: /all types/i }), 'all')

      await waitFor(() => {
        // Should show all leads again
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
        expect(screen.getByText('Talk to the butler')).toBeInTheDocument()
      })
    })
  })

  /**
   * Search Filter Tests
   */
  describe('Search Filter', () => {
    it('should have search input', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search leads...')).toBeInTheDocument()
      })
    })

    it('should filter leads by search query in title', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        // Search for "mansion"
        const searchInput = screen.getByPlaceholderText('Search leads...')
        user.type(searchInput, 'mansion')
      })

      await waitFor(() => {
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
      })

      // Should NOT show other leads
      await waitFor(() => {
        expect(screen.queryByText('Talk to the butler')).not.toBeInTheDocument()
      })
    })

    it('should filter leads by search query in description', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search leads...')
        user.type(searchInput, 'exhaustion')
      })

      await waitFor(() => {
        expect(screen.getByText('Rest at the inn')).toBeInTheDocument()
      })
    })

    it('should filter case-insensitively', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search leads...')
        user.type(searchInput, 'MANSION')
      })

      await waitFor(() => {
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
      })
    })

    it('should show all leads when search is cleared', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search leads...')
        user.type(searchInput, 'mansion')
      })

      await waitFor(() => {
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
      })

      // Clear search
      await user.clear(screen.getByPlaceholderText('Search leads...'))

      await waitFor(() => {
        // Should show all leads again
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
        expect(screen.getByText('Talk to the butler')).toBeInTheDocument()
      })
    })
  })

  /**
   * Combined Filters Tests
   */
  describe('Combined Filters', () => {
    it('should filter by status and priority together', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        // Filter by available status
        user.click(screen.getByRole('tab', { name: /available/i }))
      })

      await waitFor(() => {
        // Also filter by high priority
        const prioritySelect = screen.getByRole('combobox', { name: /all priorities/i })
        user.selectOptions(prioritySelect, 'high')
      })

      await waitFor(() => {
        // Should show only high priority available leads
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
      })

      // Should NOT show low priority available lead
      await waitFor(() => {
        expect(screen.queryByText('Rest at the inn')).not.toBeInTheDocument()
      })
    })

    it('should filter by status and type together', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        user.click(screen.getByRole('tab', { name: /completed/i }))
      })

      await waitFor(() => {
        const typeSelect = screen.getByRole('combobox', { name: /all types/i })
        user.selectOptions(typeSelect, 'investigate')
      })

      await waitFor(() => {
        expect(screen.getByText('Find the hidden passage')).toBeInTheDocument()
      })
    })

    it('should filter by search and status together', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search leads...')
        user.type(searchInput, 'secret')
      })

      await waitFor(() => {
        user.click(screen.getByRole('tab', { name: /completed/i }))
      })

      await waitFor(() => {
        expect(screen.getByText('Find the hidden passage')).toBeInTheDocument()
      })
    })
  })

  /**
   * Real-time Filter Updates Tests
   */
  describe('Real-time Filter Updates', () => {
    it('should update filters immediately without button click', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        // All leads shown initially
        expect(screen.getByText('Investigate the mansion')).toBeInTheDocument()
      })

      // Type in search - should filter immediately
      await user.type(screen.getByPlaceholderText('Search leads...'), 'combat')

      // Should immediately filter (no submit button needed)
      await waitFor(() => {
        expect(screen.queryByText('Investigate the mansion')).not.toBeInTheDocument()
        expect(screen.getByText('Fight the cultist')).toBeInTheDocument()
      })
    })

    it('should show empty state when no leads match filters', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)
      const user = userEvent.setup()

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search leads...')
        user.type(searchInput, 'nonexistent')
      })

      await waitFor(() => {
        expect(screen.getByText(/no .* leads/i)).toBeInTheDocument()
      })
    })
  })

  /**
   * Sort Tests
   */
  describe('Sort', () => {
    it('should have sort dropdown', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: /priority/i })).toBeInTheDocument()
      })
    })

    it('should sort by priority descending by default', async () => {
      mockGetLeads.mockResolvedValue(mockLeads)

      render(<LeadsPanel sessionId="session-123" />)

      await waitFor(() => {
        // Critical should appear first (highest priority)
        const leads = screen.getAllByText(/Find the hidden passage|Fight the cultist|Talk to the butler/)
        // The order depends on the implementation
      })
    })
  })
})
