// frontend/src/utils/characterDraftStorage.ts
import type { CharacterCreationState } from '@/types/characterCreation'

export const DRAFT_KEY = 'monika_character_draft'

export function saveDraft(state: CharacterCreationState): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('Failed to save draft:', error)
  }
}

export function loadDraft(): CharacterCreationState | null {
  try {
    const data = localStorage.getItem(DRAFT_KEY)
    if (!data) return null
    return JSON.parse(data) as CharacterCreationState
  } catch (error) {
    console.error('Failed to load draft:', error)
    return null
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch (error) {
    console.error('Failed to clear draft:', error)
  }
}
