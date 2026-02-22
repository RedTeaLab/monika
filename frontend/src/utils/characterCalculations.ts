// frontend/src/utils/characterCalculations.ts
export interface Attributes {
  str: number
  con: number
  siz: number
  dex: number
  app: number
  pow: number
  int: number
  edu: number
}

export interface DerivedStats {
  hp: number
  mp: number
  san: number
  move: number
  build: number
  damageBonus: string
}

export function calculateDerivedStats(attributes: Attributes): DerivedStats {
  const { con, siz, str, dex, pow } = attributes

  // HP = (CON + SIZ) ÷ 10
  const hp = Math.floor((con + siz) / 10)

  // MP = POW ÷ 5
  const mp = Math.floor(pow / 5)

  // SAN = POW (max 99)
  const san = Math.min(pow, 99)

  // Move rate
  let move = 7
  if (dex >= siz && str >= siz) move = 9
  else if (dex + siz > str) move = 8

  // Build & Damage Bonus based on STR + SIZ table
  const strSiz = str + siz
  let build: number
  let damageBonus: string

  if (strSiz <= 64) {
    build = -2
    damageBonus = '-2'
  } else if (strSiz <= 84) {
    build = -1
    damageBonus = '-1'
  } else if (strSiz <= 124) {
    build = 0
    damageBonus = '0'
  } else if (strSiz <= 164) {
    build = 1
    damageBonus = '+1D4'
  } else if (strSiz <= 204) {
    build = 2
    damageBonus = '+1D6'
  } else if (strSiz <= 284) {
    build = 3
    damageBonus = '+2D6'
  } else if (strSiz <= 364) {
    build = 4
    damageBonus = '+3D6'
  } else if (strSiz <= 444) {
    build = 5
    damageBonus = '+4D6'
  } else if (strSiz <= 524) {
    build = 6
    damageBonus = '+5D6'
  } else {
    // Beyond 524, continue the pattern (+1D6 per 80 points)
    const extraDice = Math.floor((strSiz - 525) / 80) + 6
    build = extraDice
    damageBonus = `+${extraDice}D6`
  }

  return { hp, mp, san, move, build, damageBonus }
}
