// frontend/src/components/character-creation/__tests__/BasicInfoSection.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BasicInfoSection } from '../BasicInfoSection'
import type { CharacterCreationAction } from '@/types/characterCreation'

describe('BasicInfoSection', () => {
  it('renders all fields', () => {
    const dispatch = vi.fn()
    render(
      <BasicInfoSection
        name=""
        age={0}
        gender="male"
        era="modern"
        errors={{}}
        dispatch={dispatch}
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
        gender="male"
        era="modern"
        errors={{ name: '姓名为必填项' }}
        dispatch={dispatch}
      />
    )
    expect(screen.getByText('姓名为必填项')).toBeInTheDocument()
  })

  it('renders gender radio buttons', () => {
    const dispatch = vi.fn()
    render(
      <BasicInfoSection
        name=""
        age={0}
        gender="male"
        era="modern"
        errors={{}}
        dispatch={dispatch}
      />
    )
    expect(screen.getByLabelText(/男/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/女/i)).toBeInTheDocument()
  })

  it('renders era radio buttons', () => {
    const dispatch = vi.fn()
    render(
      <BasicInfoSection
        name=""
        age={0}
        gender="male"
        era="modern"
        errors={{}}
        dispatch={dispatch}
      />
    )
    expect(screen.getByLabelText(/现代/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/1920s/i)).toBeInTheDocument()
  })
})
