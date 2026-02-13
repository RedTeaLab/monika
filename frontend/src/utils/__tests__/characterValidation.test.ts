// frontend/src/utils/__tests__/characterValidation.test.ts
import { describe, it, expect } from 'vitest'
import { validateCharacter } from '../characterValidation'
import type { CharacterCreationState } from '@/types/characterCreation'

describe('validateCharacter', () => {
  it('passes with valid data', () => {
    const state: CharacterCreationState = {
      name: 'Test Investigator',
      age: 25,
      gender: 'male',
      occupation: { id: '1', name: 'Detective' } as any,
      attributes: { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, luck: 50, edu: 50 },
      background: {
        appearance: 'Tall and handsome detective',
        beliefs: 'Justice matters above all else',
        importantPerson: 'My mentor who taught me',
        significantPlace: 'The library where I research',
        treasuredItem: 'Old watch from my grandfather',
        traits: 'Curious and always investigating',
      },
    } as any
    const errors = validateCharacter(state)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('requires name', () => {
    const state = { name: '', age: 25, occupation: {} as any, attributes: { str: 50 } as any, background: {} } as any
    const errors = validateCharacter(state)
    expect(errors.name).toBeTruthy()
  })

  it('validates age range 15-90', () => {
    const tooYoung = { name: 'Test', age: 10, occupation: {} as any, attributes: { str: 50 } as any, background: {} } as any
    const tooOld = { name: 'Test', age: 95, occupation: {} as any, attributes: { str: 50 } as any, background: {} } as any
    expect(validateCharacter(tooYoung).age).toBeTruthy()
    expect(validateCharacter(tooOld).age).toBeTruthy()
  })

  it('requires all attributes > 0', () => {
    const state = { name: 'Test', age: 25, occupation: {} as any, attributes: { str: 0, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 } as any, background: {} } as any
    const errors = validateCharacter(state)
    expect(errors.str).toBeTruthy()
  })

  it('requires background fields min 10 characters', () => {
    const state = {
      name: 'Test',
      age: 25,
      occupation: {} as any,
      attributes: { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 } as any,
      background: { appearance: 'Short', beliefs: 'Too short', importantPerson: 'X', significantPlace: 'Y', treasuredItem: 'Z', traits: 'W' }
    }
    const errors = validateCharacter(state as any)
    expect(errors.appearance).toBeTruthy()
  })
})
