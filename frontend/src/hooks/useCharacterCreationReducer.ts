// frontend/src/hooks/useCharacterCreationReducer.ts
import { useReducer } from 'react'
import type { CharacterCreationState, CharacterCreationAction, Attributes } from '@/types/characterCreation'

const INITIAL_STATE: CharacterCreationState = {
  name: '',
  age: 0,
  gender: 'other',
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

function calculateSkillPoints(edu: number, int: number): { occupational: number; interest: number } {
  return {
    occupational: edu * 4,
    interest: int * 2,
  }
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

    case 'SET_OCCUPATION': {
      const occupation = action.occupation
      const equipment = occupation?.occupation_items
        ? { ...state.equipment, occupationItems: [...occupation.occupation_items] }
        : state.equipment

      const points = calculateSkillPoints(state.attributes.edu, state.attributes.int)

      return {
        ...state,
        occupation,
        equipment,
        occupationalPointsRemaining: points.occupational,
        interestPointsRemaining: points.interest,
      }
    }

    case 'SET_ATTRIBUTE':
      return {
        ...state,
        attributes: { ...state.attributes, [action.attribute]: action.value },
      }

    case 'ROLL_ATTRIBUTE': {
      const attr = action.attribute
      const isSpecial = attr === 'siz' || attr === 'int' || attr === 'edu'
      const value = rollAttribute(isSpecial ? attr : 'other')
      return { ...state, attributes: { ...state.attributes, [attr]: value } }
    }

    case 'ROLL_ALL_ATTRIBUTES': {
      const attrs: (keyof Attributes)[] = ['str', 'con', 'siz', 'dex', 'app', 'pow', 'int', 'edu', 'luck']
      const newAttributes = { ...state.attributes }
      attrs.forEach(attr => {
        const isSpecial = attr === 'siz' || attr === 'int' || attr === 'edu'
        newAttributes[attr] = rollAttribute(isSpecial ? attr : 'other')
      })
      return { ...state, attributes: newAttributes }
    }

    case 'CHANGE_SKILL': {
      const skill = action.skill
      const delta = action.delta
      const current = state.skills[skill] || 0
      const newValue = current + delta

      // Determine if occupation skill (cost 1) or interest skill (cost 2)
      const isOccupationSkill = state.occupation?.occupation_skills?.includes(skill)
      const cost = isOccupationSkill ? 1 : 2
      const pointsField = isOccupationSkill ? 'occupationalPointsRemaining' : 'interestPointsRemaining'

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
