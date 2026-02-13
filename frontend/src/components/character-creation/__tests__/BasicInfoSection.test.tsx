// frontend/src/components/character-creation/__tests__/BasicInfoSection.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BasicInfoSection } from '../BasicInfoSection'
import type { CharacterCreationAction } from '@/types/characterCreation'
import type { Occupation } from '@/types/characterCreation'

describe('BasicInfoSection', () => {
  it('renders all fields', () => {
    const dispatch = vi.fn()
    render(
      <BasicInfoSection
        name=""
        age={0}
        gender="other"
        occupation={null}
        errors={{}}
        dispatch={dispatch}
        onOccupationClick={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/姓名/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/年龄/i)).toBeInTheDocument()
  })

  it('shows validation errors', () => {
    const dispatch = vi.fn()
    render(
      <BasicInfoSection
        name=""
        age={0}
        gender="other"
        occupation={null}
        errors={{ name: '姓名为必填项' }}
        dispatch={dispatch}
        onOccupationClick={vi.fn()}
      />
    )
    expect(screen.getByText('姓名为必填项')).toBeInTheDocument()
  })

  it('renders selected occupation', () => {
    const dispatch = vi.fn()
    const mockOccupation: Occupation = {
      id: '1',
      name: '侦探',
    }
    render(
      <BasicInfoSection
        name=""
        age={0}
        gender="other"
        occupation={mockOccupation}
        errors={{}}
        dispatch={dispatch}
        onOccupationClick={vi.fn()}
      />
    )
    expect(screen.getByText('侦探')).toBeInTheDocument()
  })

  it('renders gender radio buttons', () => {
    const dispatch = vi.fn()
    render(
      <BasicInfoSection
        name=""
        age={0}
        gender="other"
        occupation={null}
        errors={{}}
        dispatch={dispatch}
        onOccupationClick={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/男/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/女/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/其他/i)).toBeInTheDocument()
  })
})
