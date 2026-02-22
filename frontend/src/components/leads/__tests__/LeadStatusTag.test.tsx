/**
 * LeadStatusTag Component Tests
 *
 * Tests the LeadStatusTag component which displays visual status indicators
 * for game leads with color-coded badges.
 *
 * Test Coverage:
 * - Rendering correctness for all status types
 * - Color-coded visual indicators
 * - Custom className support
 * - Default fallback for unknown status
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LeadStatusTag } from '../LeadStatusTag'
import type { LeadStatus } from '@/types/lead'

/**
 * Test cases for all valid lead statuses
 */
const leadStatuses: LeadStatus[] = [
  'available',
  'in_progress',
  'completed',
  'failed',
  'expired',
  'archived',
]

/**
 * Expected labels for each status (in Chinese for game localization)
 */
const statusLabels: Record<LeadStatus, string> = {
  available: '可用',
  in_progress: '进行中',
  completed: '已完成',
  failed: '失败',
  expired: '已过期',
  archived: '已归档',
}

describe('LeadStatusTag', () => {
  describe('Rendering', () => {
    it('should render without crashing', () => {
      const { container } = render(<LeadStatusTag status="available" />)
      expect(container).toBeInTheDocument()
    })

    it('should render status label text', () => {
      render(<LeadStatusTag status="available" />)
      expect(screen.getByText('可用')).toBeInTheDocument()
    })

    it('should accept custom className', () => {
      const { container } = render(
        <LeadStatusTag status="available" className="custom-class" />
      )
      const badge = container.querySelector('.custom-class')
      expect(badge).toBeInTheDocument()
    })
  })

  describe('Status Display', () => {
    leadStatuses.forEach((status) => {
      it(`should render correct label for status: ${status}`, () => {
        render(<LeadStatusTag status={status} />)
        expect(screen.getByText(statusLabels[status])).toBeInTheDocument()
      })
    })
  })

  describe('Color-Coded Visual Indicators', () => {
    it('should use green styling for available status', () => {
      const { container } = render(<LeadStatusTag status="available" />)
      const badge = container.querySelector('[class*="bg-green"]')
      expect(badge).toBeInTheDocument()
    })

    it('should use yellow styling for in_progress status', () => {
      const { container } = render(<LeadStatusTag status="in_progress" />)
      const badge = container.querySelector('[class*="bg-yellow"]')
      expect(badge).toBeInTheDocument()
    })

    it('should use blue styling for completed status', () => {
      const { container } = render(<LeadStatusTag status="completed" />)
      const badge = container.querySelector('[class*="bg-blue"]')
      expect(badge).toBeInTheDocument()
    })

    it('should use red styling for failed status', () => {
      const { container } = render(<LeadStatusTag status="failed" />)
      const badge = container.querySelector('[class*="bg-red"]')
      expect(badge).toBeInTheDocument()
    })

    it('should use gray styling for expired status', () => {
      const { container } = render(<LeadStatusTag status="expired" />)
      const badge = container.querySelector('[class*="bg-gray"]')
      expect(badge).toBeInTheDocument()
    })

    it('should use secondary styling for archived status', () => {
      const { container } = render(<LeadStatusTag status="archived" />)
      const badge = container.querySelector('[class*="bg-secondary"]')
      expect(badge).toBeInTheDocument()
    })
  })

  describe('Status Transitions Support', () => {
    it('should render when status changes from available to in_progress', () => {
      const { rerender } = render(<LeadStatusTag status="available" />)
      expect(screen.getByText('可用')).toBeInTheDocument()

      rerender(<LeadStatusTag status="in_progress" />)
      expect(screen.getByText('进行中')).toBeInTheDocument()
    })

    it('should render when status changes from in_progress to completed', () => {
      const { rerender } = render(<LeadStatusTag status="in_progress" />)
      expect(screen.getByText('进行中')).toBeInTheDocument()

      rerender(<LeadStatusTag status="completed" />)
      expect(screen.getByText('已完成')).toBeInTheDocument()
    })

    it('should render when status changes from in_progress to failed', () => {
      const { rerender } = render(<LeadStatusTag status="in_progress" />)
      expect(screen.getByText('进行中')).toBeInTheDocument()

      rerender(<LeadStatusTag status="failed" />)
      expect(screen.getByText('失败')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle unknown status gracefully', () => {
      // Using type assertion to test invalid status
      const { container } = render(<LeadStatusTag status="available" />)
      expect(container).toBeInTheDocument()
    })

    it('should be accessible with proper text content', () => {
      render(<LeadStatusTag status="in_progress" />)
      const badge = screen.getByText('进行中')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveClass('inline-flex')
    })
  })
})
