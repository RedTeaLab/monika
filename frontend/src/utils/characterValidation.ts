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
