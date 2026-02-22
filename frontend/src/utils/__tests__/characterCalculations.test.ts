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

  describe('build and damage bonus table', () => {
    const testCases = [
      // [str + siz, expectedBuild, expectedDamageBonus]
      [64, -2, '-2'],
      [65, -1, '-1'],
      [84, -1, '-1'],
      [85, 0, '0'],
      [124, 0, '0'],
      [125, 1, '+1D4'],
      [164, 1, '+1D4'],
      [165, 2, '+1D6'],
      [204, 2, '+1D6'],
      [205, 3, '+2D6'],
      [284, 3, '+2D6'],
      [285, 4, '+3D6'],
      [364, 4, '+3D6'],
      [365, 5, '+4D6'],
      [444, 5, '+4D6'],
      [445, 6, '+5D6'],
      [524, 6, '+5D6'],
    ] as const

    testCases.forEach(([strSiz, expectedBuild, expectedDb]) => {
      it(`STR+SIZ=${strSiz}: build=${expectedBuild}, DB=${expectedDb}`, () => {
        const result = calculateDerivedStats({
          con: 50, siz: 50, str: strSiz - 50, dex: 50, pow: 50, int: 50, edu: 50, app: 50
        })
        expect(result.build).toBe(expectedBuild)
        expect(result.damageBonus).toBe(expectedDb)
      })
    })
  })
})
