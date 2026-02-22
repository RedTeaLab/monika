// frontend/src/components/character-creation/__tests__/AttributesSection.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AttributesSection } from '../AttributesSection'
import type { Attributes } from '@/types/characterCreation'

describe('AttributesSection', () => {
  it('renders all attributes', () => {
    const dispatch = vi.fn()
    const attributes: Attributes = {
      str: 0, con: 0, siz: 0, dex: 0, app: 0, pow: 0, int: 0, edu: 0, luck: 0
    }
    render(<AttributesSection attributes={attributes} dispatch={dispatch} />)
    expect(screen.getByText('力量')).toBeInTheDocument()
    expect(screen.getByText('体质')).toBeInTheDocument()
    expect(screen.getByText('体型')).toBeInTheDocument()
  })

  it('dispatches ROLL_ATTRIBUTE when dice button clicked', () => {
    const dispatch = vi.fn()
    const attributes: Attributes = {
      str: 0, con: 0, siz: 0, dex: 0, app: 0, pow: 0, int: 0, edu: 0, luck: 0
    }
    render(<AttributesSection attributes={attributes} dispatch={dispatch} />)

    const buttons = screen.getAllByRole('button')
    const strButton = buttons.find(b => b.textContent === '🎲')
    expect(strButton).toBeDefined()
    fireEvent.click(strButton!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ROLL_ATTRIBUTE', attribute: 'str' })
  })
})
