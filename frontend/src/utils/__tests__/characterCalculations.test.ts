// frontend/src/utils/__tests__/characterCalculations.test.ts
import { describe, it, expect } from 'vitest'
import { calculateDerivedStats } from '../characterCalculations'

describe('calculateDerivedStats', () => {
  it('calculates HP from CON and SIZ', () => {
    const result = calculateDerivedStats({ con: 50, siz: 50, str: 50, dex: 50, pow: 50, int: 50, edu: 50, app: 50 })
    expect(result.hp).toBe(10)
  })

  it('calculates MP from POW', () => {
    const result = calculateDerivedStats({ con: 50, siz: 50, str: 50, dex: 50, pow: 50, int: 50, edu: 50, app: 50 })
    expect(result.mp).toBe(10)
  })

  it('caps SAN at 99', () => {
    const result = calculateDerivedStats({ con: 50, siz: 50, str: 50, dex: 50, pow: 100, int: 50, edu: 50, app: 50 })
    expect(result.san).toBe(99)
  })

  it('calculates move rate based on DEX, SIZ, STR', () => {
    const result = calculateDerivedStats({ con: 50, siz: 50, str: 70, dex: 70, pow: 50, int: 50, edu: 50, app: 50 })
    expect(result.move).toBe(9)
  })

  it('calculates build from STR+SIZ', () => {
    const result = calculateDerivedStats({ con: 50, siz: 80, str: 85, dex: 50, pow: 50, int: 50, edu: 50, app: 50 })
    expect(result.build).toBe(1)
  })

  it('calculates damage bonus from STR+SIZ', () => {
    const result = calculateDerivedStats({ con: 50, siz: 80, str: 85, dex: 50, pow: 50, int: 50, edu: 50, app: 50 })
    expect(result.damageBonus).toBe('+1D4')
  })
})
