// frontend/src/pages/CharacterCreatePage.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/Header'
import { BasicInfoSection } from '@/components/character-creation'
import { AttributesSection } from '@/components/character-creation'
import { SkillsSection } from '@/components/character-creation'
import { BackgroundSection } from '@/components/character-creation'
import { EquipmentSection } from '@/components/character-creation'
import { characterApi } from '@/lib/api'
import { toast } from '@/components/ui/use-toast'
import { validateCharacter } from '@/utils/characterValidation'
import { saveDraft, loadDraft, clearDraft } from '@/utils/characterDraftStorage'
import { useCharacterCreationReducer } from '@/hooks/useCharacterCreationReducer'

export function CharacterCreatePage() {
  const navigate = useNavigate()
  const [state, dispatch] = useCharacterCreationReducer()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Load draft on mount
  useEffect(() => {
    const draft = loadDraft()
    if (draft && confirm('发现未完成的草稿，是否恢复？')) {
      if (draft.name) dispatch({ type: 'SET_NAME', value: draft.name })
      if (draft.age) dispatch({ type: 'SET_AGE', value: draft.age })
      if (draft.gender) dispatch({ type: 'SET_GENDER', value: draft.gender })
      if (draft.era) dispatch({ type: 'SET_ERA', value: draft.era })
      if (draft.occupation) dispatch({ type: 'SET_OCCUPATION', occupation: draft.occupation })
      if (draft.attributes) {
        Object.entries(draft.attributes).forEach(([key, value]) => {
          dispatch({ type: 'SET_ATTRIBUTE', attribute: key as any, value })
        })
      }
      if (draft.skills) {
        Object.entries(draft.skills).forEach(([skill, value]) => {
          dispatch({ type: 'ADD_INTEREST_SKILL', skill })
          dispatch({ type: 'CHANGE_SKILL', skill, delta: value })
        })
      }
      if (draft.background) {
        Object.entries(draft.background).forEach(([field, value]) => {
          dispatch({ type: 'SET_BACKGROUND', field: field as any, value })
        })
      }
      if (draft.equipment) {
        if (draft.equipment.occupationItems) {
          draft.equipment.occupationItems.forEach(item => {
            dispatch({ type: 'ADD_EQUIPMENT', item, category: 'occupation' })
          })
        }
        if (draft.equipment.customItems) {
          draft.equipment.customItems.forEach(item => {
            dispatch({ type: 'ADD_EQUIPMENT', item, category: 'custom' })
          })
        }
        if (draft.equipment.cash !== undefined) {
          dispatch({ type: 'SET_CASH', value: draft.equipment.cash })
        }
        if (draft.equipment.assets !== undefined) {
          dispatch({ type: 'SET_ASSETS', value: draft.equipment.assets })
        }
      }
    }
  }, [])

  // Auto-save draft (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft(state)
    }, 500)
    return () => clearTimeout(timer)
  }, [state])

  // Create character
  const handleCreate = async () => {
    const validationErrors = validateCharacter(state)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      toast({
        title: '验证失败',
        description: '请修正表单中的错误',
        variant: 'destructive',
      })
      return
    }

    try {
      setSaving(true)
      const characterData = {
        name: state.name,
        age: state.age,
        gender: state.gender,
        era: state.era,
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
        skills: state.skills,
      }
      await characterApi.create(characterData)
      clearDraft()
      toast({
        title: '创建成功',
        description: '角色已成功创建！',
      })
      navigate('/characters')
    } catch (err) {
      toast({
        title: '创建失败',
        description: err instanceof Error ? err.message : '创建失败，请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // Save draft
  const handleSaveDraft = () => {
    saveDraft(state)
    toast({
      title: '草稿已保存',
      description: '您可以稍后继续编辑',
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        characterName="创建调查员"
      />

      <main className="container mx-auto px-4 py-8">
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
            era={state.era}
            errors={errors}
            dispatch={dispatch}
          />

          <AttributesSection attributes={state.attributes} dispatch={dispatch} />

          <SkillsSection
            occupation={state.occupation}
            attributes={state.attributes}
            skills={state.skills}
            occupationalPointsRemaining={state.occupationalPointsRemaining}
            interestPointsRemaining={state.interestPointsRemaining}
            dispatch={dispatch}
          />

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
    </div>
  )
}

export default CharacterCreatePage
