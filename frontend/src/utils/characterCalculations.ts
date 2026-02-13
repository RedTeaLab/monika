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

  // Build
  const strSiz = str + siz
  let build = -2
  if (strSiz > 64) build = -1
  if (strSiz > 84) build = 0
  if (strSiz > 124) build = 1
  if (strSiz > 165) build = 2

  // Damage bonus
  let damageBonus = '-1D4'
  if (strSiz > 84) damageBonus = '0'
  if (strSiz > 124) damageBonus = '+1D4'
  if (strSiz > 165) damageBonus = '+1D6'

  return { hp, mp, san, move, build, damageBonus }
}
