// frontend/src/utils/__tests__/characterDraftStorage.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveDraft, loadDraft, clearDraft, DRAFT_KEY } from '../characterDraftStorage'
import type { CharacterCreationState } from '@/types/characterCreation'

describe('characterDraftStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
  })

  it('saves draft to localStorage', () => {
    const state = { name: 'Test' } as CharacterCreationState
    saveDraft(state)
    expect(localStorage.setItem).toHaveBeenCalledWith(DRAFT_KEY, JSON.stringify(state))
  })

  it('loads draft from localStorage', () => {
    const state = { name: 'Test' } as CharacterCreationState
    localStorage.getItem = vi.fn().mockReturnValue(JSON.stringify(state))
    const loaded = loadDraft()
    expect(loaded).toEqual(state)
  })

  it('returns null when no draft exists', () => {
    localStorage.getItem = vi.fn().mockReturnValue(null)
    const loaded = loadDraft()
    expect(loaded).toBeNull()
  })

  it('clears draft from localStorage', () => {
    clearDraft()
    expect(localStorage.removeItem).toHaveBeenCalledWith(DRAFT_KEY)
  })
})
