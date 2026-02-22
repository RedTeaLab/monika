// frontend/src/hooks/useCharacterCreationReducer.ts
import { useReducer } from 'react'
import type { CharacterCreationState, CharacterCreationAction, Attributes, Era, SkillPointFormula, Occupation, OptionalSkillCategory } from '@/types/characterCreation'
import { getOptionalCategorySkills } from '@/data/skills'

const INITIAL_STATE: CharacterCreationState = {
  name: '',
  age: 0,
  gender: 'male',
  era: 'modern' as Era,
  occupation: null,
  attributes: {
    str: 0,
    con: 0,
    siz: 0,
    dex: 0,
    app: 0,
    pow: 0,
    int: 0,
    edu: 0,
    luck: 0,
  },
  skills: {},
  occupationalPointsRemaining: 0,
  interestPointsRemaining: 0,
  background: {
    appearance: '',
    beliefs: '',
    importantPerson: '',
    significantPlace: '',
    treasuredItem: '',
    traits: '',
  },
  equipment: {
    occupationItems: [],
    customItems: [],
    cash: 0,
    assets: 0,
  },
}

function rollAttribute(attr: 'siz' | 'int' | 'edu' | 'other'): number {
  if (attr === 'siz' || attr === 'int' || attr === 'edu') {
    const d1 = Math.floor(Math.random() * 6) + 1
    const d2 = Math.floor(Math.random() * 6) + 1
    return (d1 + d2 + 6) * 5
  }
  const d1 = Math.floor(Math.random() * 6) + 1
  const d2 = Math.floor(Math.random() * 6) + 1
  const d3 = Math.floor(Math.random() * 6) + 1
  return (d1 + d2 + d3) * 5
}

function calculateOccupationalPoints(
  attributes: Attributes, 
  formula: SkillPointFormula = 'edu4'
): number {
  const { edu, dex, str, app, pow } = attributes
  
  switch (formula) {
    case 'edu4':
      return edu * 4
    case 'edu2_pow2':
      return edu * 2 + pow * 2
    case 'edu2_dex2':
      return edu * 2 + dex * 2
    case 'edu2_str2':
      return edu * 2 + str * 2
    case 'edu2_app2':
      return edu * 2 + app * 2
    default:
      return edu * 4
  }
}

function calculateInterestPoints(int: number): number {
  return int * 2
}

function isOccupationSkill(skillName: string, occupation: Occupation | null): boolean {
  if (!occupation || occupation.isCustom) return false
  
  // 检查固定技能
  if (occupation.fixed_skills?.includes(skillName)) return true
  
  // 检查固定技能中的基础技能名（如"格斗"匹配"格斗 (斗殴)"）
  const baseName = skillName.includes(' (') ? skillName.split(' (')[0] : skillName
  if (occupation.fixed_skills?.some(s => s === baseName || s.startsWith(`${baseName} (`) )) return true
  
  // 检查可选技能类别
  for (const opt of (occupation.optional_skills || [])) {
    const available = getOptionalCategorySkills(opt.category)
    if (available.some(s => s === skillName || s === baseName)) return true
  }
  
  return false
}

function countUsedOccupationPoints(skills: Record<string, number>, occupation: Occupation | null): number {
  if (!occupation) return 0
  
  let total = 0
  Object.entries(skills).forEach(([skillName, value]) => {
    if (isOccupationSkill(skillName, occupation)) {
      total += value
    }
  })
  return total
}

export function useCharacterCreationReducer(): [CharacterCreationState, (action: CharacterCreationAction) => void] {
  const [state, dispatch] = useReducer(characterCreationReducer, INITIAL_STATE)

  return [state, dispatch]
}

function characterCreationReducer(
  state: CharacterCreationState,
  action: CharacterCreationAction
): CharacterCreationState {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.value }

    case 'SET_AGE':
      return { ...state, age: action.value }

    case 'SET_GENDER':
      return { ...state, gender: action.value }

    case 'SET_ERA':
      return { ...state, era: action.value }

    case 'SET_OCCUPATION': {
      const occupation = action.occupation
      const equipment = occupation?.occupation_items
        ? { ...state.equipment, occupationItems: [...occupation.occupation_items] }
        : state.equipment

      const formula = occupation?.skill_point_formula ?? 'edu4'
      const occupationalPoints = calculateOccupationalPoints(state.attributes, formula)
      const interestPoints = calculateInterestPoints(state.attributes.int)

      return {
        ...state,
        occupation,
        equipment,
        occupationalPointsRemaining: occupationalPoints,
        interestPointsRemaining: interestPoints,
      }
    }

    case 'SET_ATTRIBUTE': {
      const newAttributes = { ...state.attributes, [action.attribute]: action.value }
      if (state.occupation) {
        const formula = state.occupation.skill_point_formula ?? 'edu4'
        const occupationalPoints = calculateOccupationalPoints(newAttributes, formula)
        const interestPoints = calculateInterestPoints(newAttributes.int)
        const usedOccPoints = countUsedOccupationPoints(state.skills, state.occupation)
        const totalPoints = Object.values(state.skills).reduce((sum, val) => sum + val, 0)
        const usedIntPoints = (totalPoints - usedOccPoints) * 2
        
        return {
          ...state,
          attributes: newAttributes,
          occupationalPointsRemaining: occupationalPoints - usedOccPoints,
          interestPointsRemaining: interestPoints - usedIntPoints,
        }
      }
      return {
        ...state,
        attributes: newAttributes,
      }
    }

    case 'ROLL_ATTRIBUTE': {
      const attr = action.attribute
      const isSpecial = attr === 'siz' || attr === 'int' || attr === 'edu'
      const value = rollAttribute(isSpecial ? attr : 'other')
      const newAttributes = { ...state.attributes, [attr]: value }
      
      if (state.occupation) {
        const formula = state.occupation.skill_point_formula ?? 'edu4'
        const occupationalPoints = calculateOccupationalPoints(newAttributes, formula)
        const interestPoints = calculateInterestPoints(newAttributes.int)
        const usedOccPoints = countUsedOccupationPoints(state.skills, state.occupation)
        const totalPoints = Object.values(state.skills).reduce((sum, val) => sum + val, 0)
        const usedIntPoints = (totalPoints - usedOccPoints) * 2
        
        return {
          ...state,
          attributes: newAttributes,
          occupationalPointsRemaining: occupationalPoints - usedOccPoints,
          interestPointsRemaining: interestPoints - usedIntPoints,
        }
      }
      return { ...state, attributes: newAttributes }
    }

    case 'ROLL_ALL_ATTRIBUTES': {
      const attrs: (keyof Attributes)[] = ['str', 'con', 'siz', 'dex', 'app', 'pow', 'int', 'edu', 'luck']
      const newAttributes = { ...state.attributes }
      attrs.forEach(attr => {
        const isSpecial = attr === 'siz' || attr === 'int' || attr === 'edu'
        newAttributes[attr] = rollAttribute(isSpecial ? attr : 'other')
      })
      
      if (state.occupation) {
        const formula = state.occupation.skill_point_formula ?? 'edu4'
        const occupationalPoints = calculateOccupationalPoints(newAttributes, formula)
        const interestPoints = calculateInterestPoints(newAttributes.int)
        const usedOccPoints = countUsedOccupationPoints(state.skills, state.occupation)
        const totalPoints = Object.values(state.skills).reduce((sum, val) => sum + val, 0)
        const usedIntPoints = (totalPoints - usedOccPoints) * 2
        
        return {
          ...state,
          attributes: newAttributes,
          occupationalPointsRemaining: occupationalPoints - usedOccPoints,
          interestPointsRemaining: interestPoints - usedIntPoints,
        }
      }
      return { ...state, attributes: newAttributes }
    }

    case 'CHANGE_SKILL': {
      const skill = action.skill
      const delta = action.delta
      const current = state.skills[skill] || 0
      const newValue = current + delta

      const isOccSkill = isOccupationSkill(skill, state.occupation)
      
      const cost = isOccSkill ? 1 : 2
      const pointsField = isOccSkill ? 'occupationalPointsRemaining' : 'interestPointsRemaining'

      if (delta > 0 && state[pointsField] < cost * delta) {
        return state // Not enough points
      }

      return {
        ...state,
        skills: { ...state.skills, [skill]: newValue },
        [pointsField]: state[pointsField] - cost * delta,
      }
    }

    case 'ADD_INTEREST_SKILL': {
      if (state.skills[action.skill]) return state
      return { ...state, skills: { ...state.skills, [action.skill]: 0 } }
    }

    case 'SET_BACKGROUND':
      return {
        ...state,
        background: { ...state.background, [action.field]: action.value },
      }

    case 'ADD_EQUIPMENT': {
      const category = action.category
      const itemsField = category === 'occupation' ? 'occupationItems' : 'customItems'
      const items = [...state.equipment[itemsField]]
      if (!items.includes(action.item)) {
        items.push(action.item)
      }
      return { ...state, equipment: { ...state.equipment, [itemsField]: items } }
    }

    case 'REMOVE_EQUIPMENT': {
      const category = action.category
      const itemsField = category === 'occupation' ? 'occupationItems' : 'customItems'
      const items = state.equipment[itemsField].filter(item => item !== action.item)
      return { ...state, equipment: { ...state.equipment, [itemsField]: items } }
    }

    case 'SET_CASH':
      return { ...state, equipment: { ...state.equipment, cash: action.value } }

    case 'SET_ASSETS':
      return { ...state, equipment: { ...state.equipment, assets: action.value } }

    case 'RESET_FORM':
      return { ...INITIAL_STATE }

    default:
      return state
  }
}
