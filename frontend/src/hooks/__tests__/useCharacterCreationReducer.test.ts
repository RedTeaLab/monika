// frontend/src/hooks/__tests__/useCharacterCreationReducer.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCharacterCreationReducer } from '../useCharacterCreationReducer'
import type { CharacterCreationState } from '@/types/characterCreation'

describe('useCharacterCreationReducer', () => {
  it('has correct initial state', () => {
    const { result } = renderHook(() => useCharacterCreationReducer())
    const [state] = result.current
    expect(state.name).toBe('')
    expect(state.age).toBe(0)
    expect(state.occupation).toBeNull()
  })

  it('sets name', () => {
    const { result } = renderHook(() => useCharacterCreationReducer())
    const [, dispatch] = result.current

    act(() => {
      dispatch({ type: 'SET_NAME', value: 'John Doe' })
    })

    const [state] = result.current
    expect(state.name).toBe('John Doe')
  })

  it('rolls single attribute', () => {
    const { result } = renderHook(() => useCharacterCreationReducer())
    const [, dispatch] = result.current

    act(() => {
      dispatch({ type: 'ROLL_ATTRIBUTE', attribute: 'str' })
    })

    const [state] = result.current
    expect(state.attributes.str).toBeGreaterThan(0)
  })

  it('sets occupation and populates equipment', () => {
    const occupation = {
      id: '1',
      name: 'Detective',
      occupation_items: ['Magnifying glass', 'Notebook']
    } as any
    const { result } = renderHook(() => useCharacterCreationReducer())
    const [, dispatch] = result.current

    act(() => {
      dispatch({ type: 'SET_OCCUPATION', occupation })
    })

    const [state] = result.current
    expect(state.occupation).toEqual(occupation)
    expect(state.equipment.occupationItems).toContain('Magnifying glass')
  })
})
