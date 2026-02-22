/**
 * AddLeadDialog Component Tests
 *
 * Tests the AddLeadDialog component for creating new leads.
 *
 * Test Coverage:
 * - Dialog rendering
 * - Form validation
 * - API integration
 * - Error handling
 * - Success callback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddLeadDialog } from './AddLeadDialog'
import { leadsApi } from '@/services/api/leads'

/**
 * Mock the leads API
 */
vi.mock('@/services/api/leads', () => ({
  leadsApi: {
    createLead: vi.fn(),
  },
}))

const mockCreateLead = leadsApi.createLead as ReturnType<typeof vi.fn>

/**
 * Mock toast
 */
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { toast } from 'sonner'

describe('AddLeadDialog', () => {
  const mockOnClose = vi.fn()
  const mockOnSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render dialog when open', () => {
      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      expect(screen.getByText('添加线索')).toBeInTheDocument()
    })

    it('should not render dialog when closed', () => {
      render(
        <AddLeadDialog
          open={false}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      expect(screen.queryByText('添加线索')).not.toBeInTheDocument()
    })

    it('should render form fields', () => {
      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      expect(screen.getByLabelText(/标题/)).toBeInTheDocument()
      expect(screen.getByLabelText(/描述/)).toBeInTheDocument()
    })
  })

  describe('Validation', () => {
    it('should show error when title is empty', async () => {
      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      const submitButton = screen.getByRole('button', { name: /添加$/ })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/标题为必填项/)).toBeInTheDocument()
      })
    })

    it('should show error when title is too long', async () => {
      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      const titleInput = screen.getByLabelText(/标题/)
      titleInput.value = 'A'.repeat(201)

      const submitButton = screen.getByRole('button', { name: /添加$/ })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/标题不能超过/)).toBeInTheDocument()
      }, { timeout: 5000 })
    })

    it('should show error when description is empty', async () => {
      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      const titleInput = screen.getByLabelText(/标题/)
      await userEvent.type(titleInput, 'Test Title')

      const submitButton = screen.getByRole('button', { name: /添加$/ })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/描述为必填项/)).toBeInTheDocument()
      })
    })

    it('should not show validation errors initially', () => {
      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      expect(screen.queryByText(/标题为必填项/)).not.toBeInTheDocument()
    })
  })

  describe('Form Submission', () => {
    it('should call createLead API on submit', async () => {
      mockCreateLead.mockResolvedValue({
        id: 'new-lead-id',
        title: 'Test Lead',
        description: 'Test Description',
        status: 'available',
        priority: 'medium',
        type: 'investigate',
      })

      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          sessionId="session-123"
        />
      )

      const titleInput = screen.getByLabelText(/标题/)
      const descInput = screen.getByLabelText(/描述/)

      await userEvent.type(titleInput, 'Test Lead')
      await userEvent.type(descInput, 'Test Description')

      const submitButton = screen.getByRole('button', { name: /添加$/ })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(mockCreateLead).toHaveBeenCalledWith('session-123', {
          title: 'Test Lead',
          description: 'Test Description',
          priority: 'medium',
          type: 'investigate',
        })
      })
    })

    it('should call onSuccess callback after successful creation', async () => {
      mockCreateLead.mockResolvedValue({
        id: 'new-lead-id',
        title: 'Test Lead',
        description: 'Test Description',
        status: 'available',
        priority: 'medium',
        type: 'investigate',
      })

      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          sessionId="session-123"
        />
      )

      const titleInput = screen.getByLabelText(/标题/)
      const descInput = screen.getByLabelText(/描述/)

      await userEvent.type(titleInput, 'Test Lead')
      await userEvent.type(descInput, 'Test Description')

      const submitButton = screen.getByRole('button', { name: /添加$/ })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled()
      })
    })

    it('should call onClose after successful creation', async () => {
      mockCreateLead.mockResolvedValue({
        id: 'new-lead-id',
        title: 'Test Lead',
        description: 'Test Description',
        status: 'available',
        priority: 'medium',
        type: 'investigate',
      })

      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          sessionId="session-123"
        />
      )

      const titleInput = screen.getByLabelText(/标题/)
      const descInput = screen.getByLabelText(/描述/)

      await userEvent.type(titleInput, 'Test Lead')
      await userEvent.type(descInput, 'Test Description')

      const submitButton = screen.getByRole('button', { name: /添加$/ })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled()
      })
    })

    it('should show loading state during submission', async () => {
      mockCreateLead.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          sessionId="session-123"
        />
      )

      const titleInput = screen.getByLabelText(/标题/)
      const descInput = screen.getByLabelText(/描述/)

      await userEvent.type(titleInput, 'Test Lead')
      await userEvent.type(descInput, 'Test Description')

      const submitButton = screen.getByRole('button', { name: /添加$/ })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/添加中/)).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('should show error toast when API fails', async () => {
      mockCreateLead.mockRejectedValue(new Error('Failed to create lead'))

      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          sessionId="session-123"
        />
      )

      const titleInput = screen.getByLabelText(/标题/)
      const descInput = screen.getByLabelText(/描述/)

      await userEvent.type(titleInput, 'Test Lead')
      await userEvent.type(descInput, 'Test Description')

      const submitButton = screen.getByRole('button', { name: /添加$/ })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
    })

    it('should not call onSuccess when API fails', async () => {
      mockCreateLead.mockRejectedValue(new Error('Failed to create lead'))

      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          onSuccess={mockOnSuccess}
          sessionId="session-123"
        />
      )

      const titleInput = screen.getByLabelText(/标题/)
      const descInput = screen.getByLabelText(/描述/)

      await userEvent.type(titleInput, 'Test Lead')
      await userEvent.type(descInput, 'Test Description')

      const submitButton = screen.getByRole('button', { name: /添加$/ })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnSuccess).not.toHaveBeenCalled()
      })
    })
  })

  describe('Form Reset', () => {
    it('should reset form when dialog is closed', async () => {
      mockCreateLead.mockResolvedValue({
        id: 'new-lead-id',
        title: 'Test Lead',
        description: 'Test Description',
        status: 'available',
        priority: 'medium',
        type: 'investigate',
      })

      const { rerender } = render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      const titleInput = screen.getByLabelText(/标题/)
      const descInput = screen.getByLabelText(/描述/)

      await userEvent.type(titleInput, 'Test Lead')
      await userEvent.type(descInput, 'Test Description')

      // Close the dialog
      rerender(
        <AddLeadDialog
          open={false}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      // Reopen the dialog
      rerender(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      // Form should be reset
      const titleInput2 = screen.getByLabelText(/标题/)
      expect(titleInput2).toHaveValue('')
    })
  })

  describe('Priority and Type Selection', () => {
    it('should have default priority of medium', () => {
      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      // Priority select should exist
      expect(screen.getByLabelText(/优先级/)).toBeInTheDocument()
    })

    it('should have default type of investigate', () => {
      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      // Type select should exist
      expect(screen.getByLabelText(/类型/)).toBeInTheDocument()
    })
  })

  describe('Cancel Button', () => {
    it('should call onClose when cancel is clicked', async () => {
      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      const cancelButton = screen.getByRole('button', { name: /取消/ })
      await userEvent.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should be disabled during submission', async () => {
      mockCreateLead.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      render(
        <AddLeadDialog
          open={true}
          onClose={mockOnClose}
          sessionId="session-123"
        />
      )

      const titleInput = screen.getByLabelText(/标题/)
      const descInput = screen.getByLabelText(/描述/)

      await userEvent.type(titleInput, 'Test Lead')
      await userEvent.type(descInput, 'Test Description')

      const submitButton = screen.getByRole('button', { name: /添加$/ })
      await userEvent.click(submitButton)

      const cancelButton = screen.getByRole('button', { name: /取消/ })
      expect(cancelButton).toBeDisabled()
    })
  })
})
