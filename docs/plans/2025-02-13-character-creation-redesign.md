# Character Creation Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the multi-step wizard character creator with a single-page long-scroll design featuring clean black/white aesthetics matching the Dashboard.

**Architecture:** Modular section components orchestrated by a main page using useReducer for form state. Derived stats calculated centrally, draft auto-saved to localStorage.

**Tech Stack:** React 19, TypeScript, shadcn/ui, useReducer, localStorage, vitest

---

## Prerequisites

- Worktree: `.worktrees/character-create`
- Branch: `feature/character-create-redesign`
- Frontend dependencies installed

---

### Task 1: Create utilities for derived attribute calculations

**Files:**
- Create: `frontend/src/utils/characterCalculations.ts`
- Test: `frontend/src/utils/__tests__/characterCalculations.test.ts`

**Step 1: Write failing tests**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- characterCalculations.test.ts`
Expected: FAIL - "Cannot find module '../characterCalculations'"

**Step 3: Write minimal implementation**

```typescript
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
  if (strSiz > 164) build = 2

  // Damage bonus
  let damageBonus = '-1D4'
  if (strSiz > 84) damageBonus = '0'
  if (strSiz > 124) damageBonus = '+1D4'
  if (strSiz > 164) damageBonus = '+1D6'

  return { hp, mp, san, move, build, damageBonus }
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- characterCalculations.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
cd .worktrees/character-create
git add frontend/src/utils/characterCalculations.ts frontend/src/utils/__tests__/characterCalculations.test.ts
git commit -m "feat(utils): add derived attribute calculations for character creation"
```

---

### Task 2: Create validation utility

**Files:**
- Create: `frontend/src/utils/characterValidation.ts`
- Test: `frontend/src/utils/__tests__/characterValidation.test.ts`

**Step 1: Write failing tests**

```typescript
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
      attributes: { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 },
      background: {
        appearance: 'Tall and handsome',
        beliefs: 'Justice matters',
        importantPerson: 'Mentor',
        significantPlace: 'Library',
        treasuredItem: 'Old watch',
        traits: 'Curious',
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
    const state = { name: 'Test', age: 25, occupation: {} as any, attributes: { str: 0, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50 }, background: {} } as any
    const errors = validateCharacter(state)
    expect(errors.str).toBeTruthy()
  })

  it('requires background fields min 10 characters', () => {
    const state = {
      name: 'Test',
      age: 25,
      occupation: {} as any,
      attributes: { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50 } as any,
      background: { appearance: 'Short', beliefs: 'Too short', importantPerson: 'X', significantPlace: 'Y', treasuredItem: 'Z', traits: 'W' }
    }
    const errors = validateCharacter(state as any)
    expect(errors.appearance).toBeTruthy()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- characterValidation.test.ts`
Expected: FAIL - "Cannot find module '../characterValidation'"

**Step 3: Write minimal implementation**

```typescript
// frontend/src/utils/characterValidation.ts
import type { CharacterCreationState } from '@/types/characterCreation'

export interface ValidationErrors {
  [key: string]: string
}

export function validateCharacter(state: CharacterCreationState): ValidationErrors {
  const errors: ValidationErrors = {}

  // Required basic fields
  if (!state.name?.trim()) {
    errors.name = '姓名为必填项'
  }
  if (!state.age || state.age < 15 || state.age > 90) {
    errors.age = '年龄必须在 15-90 之间'
  }
  if (!state.occupation) {
    errors.occupation = '请选择职业'
  }

  // All attributes must be rolled (value > 0)
  const ATTRIBUTES = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu'] as const
  ATTRIBUTES.forEach(attr => {
    if (!state.attributes[attr] || state.attributes[attr] <= 0) {
      errors[attr] = '请先掷骰生成属性'
    }
  })

  // Background fields: minimum 10 characters each
  const BACKGROUND_FIELDS = ['appearance', 'beliefs', 'importantPerson', 'significantPlace', 'treasuredItem', 'traits'] as const
  BACKGROUND_FIELDS.forEach(field => {
    if (!state.background[field] || state.background[field].length < 10) {
      errors[field] = '请至少输入 10 个字符'
    }
  })

  return errors
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- characterValidation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/utils/characterValidation.ts frontend/src/utils/__tests__/characterValidation.test.ts
git commit -m "feat(utils): add character form validation"
```

---

### Task 3: Create CharacterCreationState types

**Files:**
- Create: `frontend/src/types/characterCreation.ts`

**Step 1: Write type definitions**

```typescript
// frontend/src/types/characterCreation.ts
import type { Occupation } from './occupation'

export interface Attributes {
  str: number
  con: number
  siz: number
  dex: number
  app: number
  pow: number
  int: number
  edu: number
  luck: number
}

export interface Background {
  appearance: string
  beliefs: string
  importantPerson: string
  significantPlace: string
  treasuredItem: string
  traits: string
}

export interface Equipment {
  occupationItems: string[]
  customItems: string[]
  cash: number
  assets: number
}

export interface CharacterCreationState {
  // Basic info
  name: string
  age: number
  gender: 'male' | 'female' | 'other'
  occupation: Occupation | null

  // Attributes
  attributes: Attributes

  // Skills
  skills: Record<string, number>
  occupationalPointsRemaining: number
  interestPointsRemaining: number

  // Background
  background: Background

  // Equipment
  equipment: Equipment
}

export type CharacterCreationAction =
  | { type: 'SET_NAME'; value: string }
  | { type: 'SET_AGE'; value: number }
  | { type: 'SET_GENDER'; value: 'male' | 'female' | 'other' }
  | { type: 'SET_OCCUPATION'; occupation: Occupation | null }
  | { type: 'SET_ATTRIBUTE'; attribute: keyof Attributes; value: number }
  | { type: 'ROLL_ATTRIBUTE'; attribute: keyof Attributes }
  | { type: 'ROLL_ALL_ATTRIBUTES' }
  | { type: 'CHANGE_SKILL'; skill: string; delta: number }
  | { type: 'ADD_INTEREST_SKILL'; skill: string }
  | { type: 'SET_BACKGROUND'; field: keyof Background; value: string }
  | { type: 'ADD_EQUIPMENT'; item: string; category: 'occupation' | 'custom' }
  | { type: 'REMOVE_EQUIPMENT'; item: string; category: 'occupation' | 'custom' }
  | { type: 'SET_CASH'; value: number }
  | { type: 'SET_ASSETS'; value: number }
  | { type: 'RESET_FORM' }
```

**Step 2: Commit**

```bash
git add frontend/src/types/characterCreation.ts
git commit -m "feat(types): add CharacterCreationState types"
```

---

### Task 4: Create reducer for character creation state

**Files:**
- Create: `frontend/src/hooks/useCharacterCreationReducer.ts`
- Test: `frontend/src/hooks/__tests__/useCharacterCreationReducer.test.ts`

**Step 1: Write failing tests**

```typescript
// frontend/src/hooks/__tests__/useCharacterCreationReducer.test.ts
import { describe, it, expect } from 'vitest'
import { useCharacterCreationReducer } from '../useCharacterCreationReducer'
import type { CharacterCreationState } from '@/types/characterCreation'

describe('useCharacterCreationReducer', () => {
  it('has correct initial state', () => {
    const [state] = useCharacterCreationReducer()
    expect(state.name).toBe('')
    expect(state.age).toBe(0)
    expect(state.occupation).toBeNull()
  })

  it('sets name', () => {
    const [, dispatch] = useCharacterCreationReducer()
    dispatch({ type: 'SET_NAME', value: 'John Doe' })
    const [state] = useCharacterCreationReducer()
    expect(state.name).toBe('John Doe')
  })

  it('rolls single attribute', () => {
    const [, dispatch] = useCharacterCreationReducer()
    dispatch({ type: 'ROLL_ATTRIBUTE', attribute: 'str' })
    const [state] = useCharacterCreationReducer()
    expect(state.attributes.str).toBeGreaterThan(0)
  })

  it('sets occupation and populates equipment', () => {
    const occupation = {
      id: '1',
      name: 'Detective',
      occupation_items: ['Magnifying glass', 'Notebook']
    } as any
    const [, dispatch] = useCharacterCreationReducer()
    dispatch({ type: 'SET_OCCUPATION', occupation })
    const [state] = useCharacterCreationReducer()
    expect(state.occupation).toEqual(occupation)
    expect(state.equipment.occupationItems).toContain('Magnifying glass')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- useCharacterCreationReducer.test.ts`
Expected: FAIL - "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// frontend/src/hooks/useCharacterCreationReducer.ts
import { useReducer } from 'react'
import type { CharacterCreationState, CharacterCreationAction, Attributes, Background, Equipment } from '@/types/characterCreation'

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
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- useCharacterCreationReducer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/hooks/useCharacterCreationReducer.ts frontend/src/hooks/__tests__/useCharacterCreationReducer.test.ts
git commit -m "feat(hooks): add character creation reducer hook"
```

---

### Task 5: Create draft storage utility

**Files:**
- Create: `frontend/src/utils/characterDraftStorage.ts`
- Test: `frontend/src/utils/__tests__/characterDraftStorage.test.ts`

**Step 1: Write failing tests**

```typescript
// frontend/src/utils/__tests__/characterDraftStorage.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveDraft, loadDraft, clearDraft, DRAFT_KEY } from '../characterDraftStorage'
import type { CharacterCreationState } from '@/types/characterCreation'

describe('characterDraftStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
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
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- characterDraftStorage.test.ts`
Expected: FAIL - "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- characterDraftStorage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/utils/characterDraftStorage.ts frontend/src/utils/__tests__/characterDraftStorage.test.ts
git commit -m "feat(utils): add character draft localStorage utility"
```

---

### Task 6: Create BasicInfoSection component

**Files:**
- Create: `frontend/src/components/character-creation/BasicInfoSection.tsx`
- Test: `frontend/src/components/character-creation/__tests__/BasicInfoSection.test.tsx`

**Step 1: Write failing tests**

```typescript
// frontend/src/components/character-creation/__tests__/BasicInfoSection.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BasicInfoSection } from '../BasicInfoSection'
import type { CharacterCreationAction } from '@/types/characterCreation'

describe('BasicInfoSection', () => {
  it('renders all fields', () => {
    const dispatch = vi.fn()
    render(
      <BasicInfoSection
        name=""
        age={0}
        gender="other"
        occupation={null}
        errors={{}}
        dispatch={dispatch}
        onOccupationClick={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/姓名/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/年龄/i)).toBeInTheDocument()
  })

  it('shows validation errors', () => {
    const dispatch = vi.fn()
    render(
      <BasicInfoSection
        name=""
        age={0}
        gender="other"
        occupation={null}
        errors={{ name: '姓名为必填项' }}
        dispatch={dispatch}
        onOccupationClick={vi.fn()}
      />
    )
    expect(screen.getByText('姓名为必填项')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- BasicInfoSection.test.tsx`
Expected: FAIL - "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// frontend/src/components/character-creation/BasicInfoSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioItem } from '@/components/ui/radio-group'
import type { Occupation } from '@/types/occupation'
import type { CharacterCreationAction } from '@/types/characterCreation'

export interface BasicInfoSectionProps {
  name: string
  age: number
  gender: 'male' | 'female' | 'other'
  occupation: Occupation | null
  errors: Record<string, string>
  dispatch: (action: CharacterCreationAction) => void
  onOccupationClick: () => void
}

export function BasicInfoSection({
  name,
  age,
  gender,
  occupation,
  errors,
  dispatch,
  onOccupationClick,
}: BasicInfoSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>基本信息</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name and Age */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">姓名 *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => dispatch({ type: 'SET_NAME', value: e.target.value })}
              placeholder="输入调查员姓名"
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="age">年龄 *</Label>
            <Input
              id="age"
              type="number"
              min={15}
              max={90}
              value={age || ''}
              onChange={(e) => dispatch({ type: 'SET_AGE', value: parseInt(e.target.value) || 0 })}
              placeholder="15-90"
            />
            {errors.age && <p className="text-sm text-destructive">{errors.age}</p>}
          </div>
        </div>

        {/* Gender */}
        <div className="space-y-2">
          <Label>性别</Label>
          <RadioGroup value={gender} onValueChange={(v) => dispatch({ type: 'SET_GENDER', value: v })}>
            <div className="flex gap-4">
              <RadioItem value="male">男</RadioItem>
              <RadioItem value="female">女</RadioItem>
              <RadioItem value="other">其他</RadioItem>
            </div>
          </RadioGroup>
        </div>

        {/* Occupation */}
        <div className="space-y-2">
          <Label>职业 *</Label>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onOccupationClick}
          >
            {occupation ? occupation.name : '选择职业 →'}
          </Button>
          {errors.occupation && <p className="text-sm text-destructive">{errors.occupation}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- BasicInfoSection.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/character-creation/BasicInfoSection.tsx frontend/src/components/character-creation/__tests__/BasicInfoSection.test.tsx
git commit -m "feat(components): add BasicInfoSection component"
```

---

### Task 7: Create AttributesSection component

**Files:**
- Create: `frontend/src/components/character-creation/AttributesSection.tsx`
- Test: `frontend/src/components/character-creation/__tests__/AttributesSection.test.tsx`

**Step 1: Write failing tests**

```typescript
// frontend/src/components/character-creation/__tests__/AttributesSection.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AttributesSection } from '../AttributesSection'
import type { Attributes } from '@/types/characterCreation'

describe('AttributesSection', () => {
  it('renders all attributes', () => {
    const dispatch = vi.fn()
    const attributes: Attributes = {
      str: 0, con: 0, siz: 0, dex: 0, app: 0, pow: 0, int: 0, edu: 0, luck: 0
    }
    render(<AttributesSection attributes={attributes} dispatch={dispatch} />)
    expect(screen.getByLabelText(/力量/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/体质/i)).toBeInTheDocument()
  })

  it('dispatches ROLL_ATTRIBUTE when dice button clicked', () => {
    const dispatch = vi.fn()
    const attributes: Attributes = {
      str: 0, con: 0, siz: 0, dex: 0, app: 0, pow: 0, int: 0, edu: 0, luck: 0
    }
    render(<AttributesSection attributes={attributes} dispatch={dispatch} />)

    const strButton = screen.getAllByRole('button').find(b => b.textContent === '🎲')
    fireEvent.click(strButton)
    expect(dispatch).toHaveBeenCalledWith({ type: 'ROLL_ATTRIBUTE', attribute: 'str' })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- AttributesSection.test.tsx`
Expected: FAIL - "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// frontend/src/components/character-creation/AttributesSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { calculateDerivedStats } from '@/utils/characterCalculations'
import type { Attributes, CharacterCreationAction } from '@/types/characterCreation'

const ATTRIBUTES: { key: keyof Attributes; label: string }[] = [
  { key: 'str', label: '力量 STR' },
  { key: 'con', label: '体质 CON' },
  { key: 'siz', label: '体型 SIZ' },
  { key: 'dex', label: '敏捷 DEX' },
  { key: 'app', label: '外貌 APP' },
  { key: 'int', label: '智力 INT' },
  { key: 'pow', label: '意志 POW' },
  { key: 'edu', label: '教育 EDU' },
]

export interface AttributesSectionProps {
  attributes: Attributes
  dispatch: (action: CharacterCreationAction) => void
}

export function AttributesSection({ attributes, dispatch }: AttributesSectionProps) {
  const derived = calculateDerivedStats(attributes)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>核心属性</CardTitle>
        <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'ROLL_ALL_ATTRIBUTES' })}>
          一键生成
        </Button>
      </CardHeader>
      <CardContent>
        {/* Core attributes grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {ATTRIBUTES.map((attr) => (
            <div key={attr.key} className="space-y-1">
              <Label htmlFor={attr.key} className="text-xs">{attr.label}</Label>
              <div className="flex gap-1">
                <Input
                  id={attr.key}
                  type="number"
                  value={attributes[attr.key] || ''}
                  onChange={(e) => dispatch({
                    type: 'SET_ATTRIBUTE',
                    attribute: attr.key,
                    value: parseInt(e.target.value) || 0
                  })}
                  className="w-20"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => dispatch({ type: 'ROLL_ATTRIBUTE', attribute: attr.key })}
                  aria-label={`Roll ${attr.label}`}
                >
                  🎲
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Derived stats */}
        <div className="mt-6 pt-6 border-t">
          <h4 className="text-sm font-medium mb-3">衍生属性</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatDisplay label="HP" value={`${derived.hp}/${derived.hp}`} />
            <StatDisplay label="MP" value={`${derived.mp}/${derived.mp}`} />
            <StatDisplay label="SAN" value={`${derived.san}/99`} />
            <StatDisplay label="移动" value={derived.move} />
            <StatDisplay label="体格" value={derived.build} />
            <StatDisplay label="伤害加成" value={derived.damageBonus} />
          </div>
        </div>

        {/* Luck roll */}
        <div className="mt-6 pt-6 border-t">
          <div className="flex items-center justify-between">
            <Label htmlFor="luck">幸运 LUCK</Label>
            <Button
              variant="outline"
              size="icon"
              onClick={() => dispatch({ type: 'ROLL_ATTRIBUTE', attribute: 'luck' }}
            >
              🎲
            </Button>
          </div>
          <Input
            id="luck"
            type="number"
            value={attributes.luck || ''}
            onChange={(e) => dispatch({
              type: 'SET_ATTRIBUTE',
              attribute: 'luck',
              value: parseInt(e.target.value) || 0
            })}
            className="w-20 mt-2"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function StatDisplay({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- AttributesSection.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/character-creation/AttributesSection.tsx frontend/src/components/character-creation/__tests__/AttributesSection.test.tsx
git commit -m "feat(components): add AttributesSection component"
```

---

### Task 8: Create OccupationSelectModal component

**Files:**
- Create: `frontend/src/components/character-creation/OccupationSelectModal.tsx`

**Step 1: Write component**

```typescript
// frontend/src/components/character-creation/OccupationSelectModal.tsx
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { characterApi } from '@/lib/api'
import type { Occupation } from '@/types/occupation'

export interface OccupationSelectModalProps {
  open: boolean
  onClose: () => void
  onSelect: (occupation: Occupation) => void
  selectedId?: string
}

export function OccupationSelectModal({
  open,
  onClose,
  onSelect,
  selectedId,
}: OccupationSelectModalProps) {
  const [search, setSearch] = useState('')
  const [occupations, setOccupations] = useState<Occupation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    const fetchOccupations = async () => {
      try {
        setLoading(true)
        const data = await characterApi.getOccupations()
        setOccupations(Array.isArray(data) ? data : Object.values(data))
      } catch (err) {
        console.error('Failed to fetch occupations:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchOccupations()
  }, [open])

  const filtered = occupations.filter(occ =>
    occ.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>选择职业</DialogTitle>
        </DialogHeader>

        <Input
          placeholder="搜索职业..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4"
        />

        {loading ? (
          <div className="text-center py-8">加载中...</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((occ) => (
              <div
                key={occ.id}
                className={`p-4 border rounded cursor-pointer hover:bg-accent ${
                  selectedId === occ.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => onSelect(occ)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium">{occ.name}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{occ.description}</p>
                  </div>
                  {selectedId === occ.id && <Badge>已选择</Badge>}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {occ.suggested_attrs.map((attr) => (
                    <Badge key={attr} variant="outline" className="text-xs">
                      {attr}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/character-creation/OccupationSelectModal.tsx
git commit -m "feat(components): add OccupationSelectModal component"
```

---

### Task 9: Create SkillsSection component

**Files:**
- Create: `frontend/src/components/character-creation/SkillsSection.tsx`

**Step 1: Write component**

```typescript
// frontend/src/components/character-creation/SkillsSection.tsx
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Occupation } from '@/types/occupation'
import type { CharacterCreationAction } from '@/types/characterCreation'

export interface SkillsSectionProps {
  occupation: Occupation | null
  attributes: { edu: number; int: number }
  skills: Record<string, number>
  occupationalPointsRemaining: number
  interestPointsRemaining: number
  dispatch: (action: CharacterCreationAction) => void
}

export function SkillsSection({
  occupation,
  attributes,
  skills,
  occupationalPointsRemaining,
  interestPointsRemaining,
  dispatch,
}: SkillsSectionProps) {
  const [customSkillName, setCustomSkillName] = useState('')

  const addCustomSkill = () => {
    if (customSkillName.trim()) {
      dispatch({ type: 'ADD_INTEREST_SKILL', skill: customSkillName.trim() })
      setCustomSkillName('')
    }
  }

  const isOccupationSkill = (skill: string): boolean => {
    return occupation?.occupation_skills?.includes(skill) ?? false
  }

  const getPointCost = (skill: string): number => {
    return isOccupationSkill(skill) ? 1 : 2
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>技能分配</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Point summary */}
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className={`text-2xl font-bold ${occupationalPointsRemaining < 0 ? 'text-destructive' : ''}`}>
              {occupationalPointsRemaining}
            </div>
            <div className="text-sm text-muted-foreground">职业技能点</div>
          </div>
          <div>
            <div className={`text-2xl font-bold ${interestPointsRemaining < 0 ? 'text-destructive' : ''}`}>
              {interestPointsRemaining}
            </div>
            <div className="text-sm text-muted-foreground">兴趣技能点</div>
          </div>
        </div>

        {/* Occupation skills */}
        {occupation && occupation.occupation_skills && occupation.occupation_skills.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">职业技能</h4>
            <div className="space-y-2">
              {occupation.occupation_skills.map((skill) => (
                <SkillRow
                  key={skill}
                  name={skill}
                  baseValue={0}
                  currentValue={skills[skill] || 0}
                  pointsCost={1}
                  pointsRemaining={occupationalPointsRemaining}
                  onIncrease={(delta) => dispatch({ type: 'CHANGE_SKILL', skill, delta })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Interest skills */}
        <div>
          <h4 className="text-sm font-medium mb-3">兴趣技能</h4>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="搜索技能..."
              value={customSkillName}
              onChange={(e) => setCustomSkillName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCustomSkill()}
            />
            <Button onClick={addCustomSkill}>添加</Button>
          </div>
          <div className="space-y-2">
            {Object.entries(skills)
              .filter(([skill]) => !isOccupationSkill(skill))
              .map(([skill, value]) => (
                <SkillRow
                  key={skill}
                  name={skill}
                  baseValue={0}
                  currentValue={value}
                  pointsCost={2}
                  pointsRemaining={interestPointsRemaining}
                  onIncrease={(delta) => dispatch({ type: 'CHANGE_SKILL', skill, delta })}
                />
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SkillRow({
  name,
  baseValue,
  currentValue,
  pointsCost,
  pointsRemaining,
  onIncrease,
}: {
  name: string
  baseValue: number
  currentValue: number
  pointsCost: number
  pointsRemaining: number
  onIncrease: (delta: number) => void
}) {
  const canIncrease = pointsRemaining >= pointsCost
  const canDecrease = currentValue > baseValue

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-32 truncate">{name}</span>
      <span className="text-xs text-muted-foreground">基础 {baseValue}</span>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onIncrease(-5)}
        disabled={!canDecrease}
      >
        -
      </Button>

      <Input type="number" value={currentValue} readOnly className="w-16 h-8" />

      <Button
        variant="outline"
        size="sm"
        onClick={() => onIncrease(5)}
        disabled={!canIncrease}
      >
        +5
      </Button>

      <span className="text-xs text-muted-foreground">消耗 {pointsCost}倍</span>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/character-creation/SkillsSection.tsx
git commit -m "feat(components): add SkillsSection component"
```

---

### Task 10: Create BackgroundSection component

**Files:**
- Create: `frontend/src/components/character-creation/BackgroundSection.tsx`

**Step 1: Write component**

```typescript
// frontend/src/components/character-creation/BackgroundSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Background, CharacterCreationAction } from '@/types/characterCreation'

const BACKGROUND_FIELDS: {
  key: keyof Background
  label: string
  placeholder: string
}[] = [
  { key: 'appearance', label: '外貌描述', placeholder: '描述调查员的外貌特征、穿着打扮等' },
  { key: 'beliefs', label: '思想/信念', placeholder: '调查员的价值观、人生哲学或信仰' },
  { key: 'importantPerson', label: '重要之人', placeholder: '对调查员有重要影响的人' },
  { key: 'significantPlace', label: '意义非凡之地', placeholder: '对调查员有特殊意义的地点' },
  { key: 'treasuredItem', label: '宝贵之物', placeholder: '调查员珍视的物品' },
  { key: 'traits', label: '特质', placeholder: '调查员的性格特点、怪癖或特长' },
]

export interface BackgroundSectionProps {
  background: Background
  errors: Record<string, string>
  dispatch: (action: CharacterCreationAction) => void
}

export function BackgroundSection({
  background,
  errors,
  dispatch,
}: BackgroundSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>背景故事</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {BACKGROUND_FIELDS.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Textarea
              id={field.key}
              rows={2}
              value={background[field.key]}
              onChange={(e) => dispatch({ type: 'SET_BACKGROUND', field: field.key, value: e.target.value })}
              placeholder={field.placeholder}
            />
            {errors[field.key] && (
              <p className="text-sm text-destructive">{errors[field.key]}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/character-creation/BackgroundSection.tsx
git commit -m "feat(components): add BackgroundSection component"
```

---

### Task 11: Create EquipmentSection component

**Files:**
- Create: `frontend/src/components/character-creation/EquipmentSection.tsx`

**Step 1: Write component**

```typescript
// frontend/src/components/character-creation/EquipmentSection.tsx
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Occupation } from '@/types/occupation'
import type { Equipment, CharacterCreationAction } from '@/types/characterCreation'

export interface EquipmentSectionProps {
  occupation: Occupation | null
  equipment: Equipment
  dispatch: (action: CharacterCreationAction) => void
}

export function EquipmentSection({
  occupation,
  equipment,
  dispatch,
}: EquipmentSectionProps) {
  const [customItemName, setCustomItemName] = useState('')

  const addCustomItem = () => {
    if (customItemName.trim()) {
      dispatch({ type: 'ADD_EQUIPMENT', item: customItemName.trim(), category: 'custom' })
      setCustomItemName('')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>装备物品</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Occupation default gear */}
        <div>
          <h4 className="text-sm font-medium mb-3">职业基础装备</h4>
          {equipment.occupationItems.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              {occupation ? '该职业无预设装备' : '请先选择职业'}
            </p>
          ) : (
            <ul className="space-y-1">
              {equipment.occupationItems.map((item) => (
                <li key={item} className="flex items-center justify-between">
                  <span className="text-sm">{item}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dispatch({ type: 'REMOVE_EQUIPMENT', item, category: 'occupation' })}
                  >
                    删除
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Custom items */}
        <div>
          <h4 className="text-sm font-medium mb-3">自定义物品</h4>
          <ul className="space-y-1 mb-3">
            {equipment.customItems.map((item) => (
              <li key={item} className="flex items-center justify-between">
                <span className="text-sm">{item}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch({ type: 'REMOVE_EQUIPMENT', item, category: 'custom' })}
                >
                  删除
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              placeholder="物品名称..."
              value={customItemName}
              onChange={(e) => setCustomItemName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCustomItem()}
            />
            <Button onClick={addCustomItem}>添加</Button>
          </div>
        </div>

        {/* Money */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-3">资产</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cash">现金 ($)</Label>
              <Input
                id="cash"
                type="number"
                value={equipment.cash || ''}
                onChange={(e) => dispatch({ type: 'SET_CASH', value: parseInt(e.target.value) || 0 })}
                placeholder="根据职业信用评级"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assets">资产 ($)</Label>
              <Input
                id="assets"
                type="number"
                value={equipment.assets || ''}
                onChange={(e) => dispatch({ type: 'SET_ASSETS', value: parseInt(e.target.value) || 0 })}
                placeholder="房产、投资等"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/character-creation/EquipmentSection.tsx
git commit -m "feat(components): add EquipmentSection component"
```

---

### Task 12: Create main CharacterCreatePage

**Files:**
- Modify: `frontend/src/pages/CharacterCreatePage.tsx` (replace entire file)

**Step 1: Write main page component**

```typescript
// frontend/src/pages/CharacterCreatePage.tsx
import { useEffect, useState, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/Header'
import { BasicInfoSection } from '@/components/character-creation/BasicInfoSection'
import { AttributesSection } from '@/components/character-creation/AttributesSection'
import { SkillsSection } from '@/components/character-creation/SkillsSection'
import { BackgroundSection } from '@/components/character-creation/BackgroundSection'
import { EquipmentSection } from '@/components/character-creation/EquipmentSection'
import { OccupationSelectModal } from '@/components/character-creation/OccupationSelectModal'
import { characterApi } from '@/lib/api'
import { useToast } from '@/hooks/useToast'
import { validateCharacter } from '@/utils/characterValidation'
import { saveDraft, loadDraft, clearDraft } from '@/utils/characterDraftStorage'
import { useCharacterCreationReducer } from '@/hooks/useCharacterCreationReducer'
import characterCreationReducer, type { CharacterCreationState, CharacterCreationAction } from '@/hooks/useCharacterCreationReducer'
import type { Occupation } from '@/types/occupation'

export function CharacterCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [state, dispatch] = useCharacterCreationReducer()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [occupationModalOpen, setOccupationModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load draft on mount
  useEffect(() => {
    const draft = loadDraft()
    if (draft && confirm('发现未完成的草稿，是否恢复？')) {
      // Restore draft by dispatching actions
      if (draft.name) dispatch({ type: 'SET_NAME', value: draft.name })
      if (draft.age) dispatch({ type: 'SET_AGE', value: draft.age })
      if (draft.occupation) dispatch({ type: 'SET_OCCUPATION', occupation: draft.occupation })
      // ... restore other fields
    }
  }, [])

  // Auto-save draft (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft(state)
    }, 500)
    return () => clearTimeout(timer)
  }, [state])

  // Handle occupation selection
  const handleOccupationSelect = (occupation: Occupation) => {
    dispatch({ type: 'SET_OCCUPATION', occupation })
    setOccupationModalOpen(false)
  }

  // Create character
  const handleCreate = async () => {
    const validationErrors = validateCharacter(state)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      toast.error('请修正表单中的错误')
      return
    }

    try {
      setSaving(true)
      const characterData = {
        name: state.name,
        age: state.age,
        gender: state.gender,
        occupation: state.occupation?.name || '',
        str: state.attributes.str,
        con: state.attributes.con,
        siz: state.attributes.siz,
        dex: state.attributes.dex,
        app: state.attributes.app,
        pow: state.attributes.pow,
        intelligence: state.attributes.int,
        edu: state.attributes.edu,
        luck: state.attributes.luck,
        backstory: Object.entries(state.background)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n'),
      }
      await characterApi.create(characterData)
      clearDraft()
      toast.success('角色创建成功！')
      navigate('/characters')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  // Save draft
  const handleSaveDraft = () => {
    saveDraft(state)
    toast.success('草稿已保存')
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">创建调查员</h1>
          <p className="text-muted-foreground mt-2">Call of Cthulhu 7th Edition</p>
        </div>

        {/* Form sections */}
        <div className="space-y-6">
          <BasicInfoSection
            name={state.name}
            age={state.age}
            gender={state.gender}
            occupation={state.occupation}
            errors={errors}
            dispatch={dispatch}
            onOccupationClick={() => setOccupationModalOpen(true)}
          />

          <AttributesSection attributes={state.attributes} dispatch={dispatch} />

          {state.occupation && (
            <SkillsSection
              occupation={state.occupation}
              attributes={state.attributes}
              skills={state.skills}
              occupationalPointsRemaining={state.occupationalPointsRemaining}
              interestPointsRemaining={state.interestPointsRemaining}
              dispatch={dispatch}
            />
          )}

          <BackgroundSection background={state.background} errors={errors} dispatch={dispatch} />

          {state.occupation && (
            <EquipmentSection occupation={state.occupation} equipment={state.equipment} dispatch={dispatch} />
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-12 pt-6 border-t flex justify-end gap-4">
          <Button variant="outline" onClick={handleSaveDraft}>
            保存草稿
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? '创建中...' : '创建角色'}
          </Button>
        </div>
      </main>

      {/* Occupation modal */}
      <OccupationSelectModal
        open={occupationModalOpen}
        onClose={() => setOccupationModalOpen(false)}
        onSelect={handleOccupationSelect}
        selectedId={state.occupation?.id}
      />
    </div>
  )
}

export default CharacterCreatePage
```

**Step 2: Commit**

```bash
git add frontend/src/pages/CharacterCreatePage.tsx
git commit -m "feat(pages): implement new CharacterCreatePage with single-page layout"
```

---

### Task 13: Export components from index

**Files:**
- Modify: `frontend/src/components/character-creation/index.ts`

**Step 1: Export all components**

```typescript
// frontend/src/components/character-creation/index.ts
export { BasicInfoSection } from './BasicInfoSection'
export type { BasicInfoSectionProps } from './BasicInfoSection'

export { AttributesSection } from './AttributesSection'
export type { AttributesSectionProps } from './AttributesSection'

export { SkillsSection } from './SkillsSection'
export type { SkillsSectionProps } from './SkillsSection'

export { BackgroundSection } from './BackgroundSection'
export type { BackgroundSectionProps } from './BackgroundSection'

export { EquipmentSection } from './EquipmentSection'
export type { EquipmentSectionProps } from './EquipmentSection'

export { OccupationSelectModal } from './OccupationSelectModal'
export type { OccupationSelectModalProps } from './OccupationSelectModal'
```

**Step 2: Commit**

```bash
git add frontend/src/components/character-creation/index.ts
git commit -m "feat(components): export character creation components"
```

---

### Task 14: Update component index

**Files:**
- Modify: `frontend/src/components/index.ts`

**Step 1: Add character-creation export**

```typescript
// Add to existing exports
export * from './character-creation'
```

**Step 2: Commit**

```bash
git add frontend/src/components/index.ts
git commit -m "feat(components): add character-creation to main exports"
```

---

## Final Tasks

### Task 15: Run all tests

**Step 1: Run test suite**

Run: `cd frontend && npm test`

Expected: All new tests pass

**Step 2: Check for type errors**

Run: `cd frontend && npm run typecheck`

Fix any type errors if present.

**Step 3: Commit any fixes**

```bash
git commit -amend --no-edit
```

---

### Task 16: Manual testing checklist

**Step 1: Start dev servers**

Backend: `cd backend && uv run python -m uvicorn src.main:app --reload`

Frontend: `cd frontend && npm run dev`

**Step 2: Test flow**

- [ ] Navigate to `/character/create`
- [ ] Fill in basic info (name, age, gender)
- [ ] Open occupation modal and select occupation
- [ ] Roll attributes (individual and roll all)
- [ ] Verify derived stats update correctly
- [ ] Allocate skill points
- [ ] Fill in background fields (min 10 chars)
- [ ] Verify equipment populates from occupation
- [ ] Add custom equipment
- [ ] Set cash/assets
- [ ] Save draft - refresh and confirm restore prompt appears
- [ ] Create character - verify redirect to character list

**Step 3: Fix any issues found**

Document fixes in commit messages.

---

### Task 17: Clean up old files

**Step 1: Archive old page**

Old `CharacterCreatePage.tsx` was replaced during rewrite. No cleanup needed.

**Step 2: Verify no unused imports**

Run: `cd frontend && npx ts-check --noUnusedLocals`

Fix any reported issues.

---

## Summary

This plan creates:
- 1 reducer hook with TDD
- 3 utility modules with TDD
- 6 section components
- 1 modal component
- 1 main page
- Full integration with existing APIs

Total: ~17 tasks, each with test + commit cycle.
