// frontend/src/components/character-creation/SkillsSection.tsx
import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getCreditRatingLevel, CREDIT_RATING_LEVELS, getOptionalCategorySkills, getOptionalCategoryName, FIGHTING_SPECIALIZATIONS, FIREARMS_SPECIALIZATIONS } from '@/data/skills'
import { useSkills, getSkillBaseFallback } from '@/hooks/useSkills'
import type { Occupation, CharacterCreationAction, SkillPointFormula, OptionalSkillCategory } from '@/types/characterCreation'

function getFormulaDescription(formula: SkillPointFormula): string {
  switch (formula) {
    case 'edu4': return 'EDU×4'
    case 'edu2_pow2': return 'EDU×2 + POW×2'
    case 'edu2_dex2': return 'EDU×2 + DEX×2'
    case 'edu2_str2': return 'EDU×2 + STR×2'
    case 'edu2_app2': return 'EDU×2 + APP×2'
    default: return 'EDU×4'
  }
}

function calculateOccupationalDisplay(
  attributes: { edu: number; int: number; dex: number; str: number; app: number; pow: number },
  formula: SkillPointFormula
): number {
  switch (formula) {
    case 'edu4': return attributes.edu * 4
    case 'edu2_pow2': return attributes.edu * 2 + attributes.pow * 2
    case 'edu2_dex2': return attributes.edu * 2 + attributes.dex * 2
    case 'edu2_str2': return attributes.edu * 2 + attributes.str * 2
    case 'edu2_app2': return attributes.edu * 2 + attributes.app * 2
    default: return attributes.edu * 4
  }
}

// 预置职业数据
const PRESET_OCCUPATIONS: Occupation[] = [
  {
    id: 'antiquarian',
    name: '古文物学家/古董收藏家',
    nameEn: 'Antiquarian',
    isCustom: false,
    fixed_skills: ['估价', '历史', '图书馆使用', '侦查'],
    optional_skills: [
      { category: 'art_craft', count: 1 },
      { category: 'language', count: 1 },
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 1,
    credit_rating_min: 30,
    credit_rating_max: 70,
    skill_point_formula: 'edu4',
  },
  {
    id: 'artist',
    name: '艺术家',
    nameEn: 'Artist',
    isCustom: false,
    fixed_skills: ['心理学', '侦查'],
    optional_skills: [
      { category: 'art_craft', count: 1 },
      { category: 'social', count: 1 },
      { category: 'language', count: 1 },
    ],
    free_skill_slots: 2,
    credit_rating_min: 9,
    credit_rating_max: 50,
    skill_point_formula: 'edu2_pow2',
  },
  {
    id: 'athlete',
    name: '运动员',
    nameEn: 'Athlete',
    isCustom: false,
    fixed_skills: ['攀爬', '跳跃', '格斗 (拳击)', '骑术', '游泳', '投掷'],
    optional_skills: [
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 1,
    credit_rating_min: 9,
    credit_rating_max: 70,
    skill_point_formula: 'edu2_dex2',
  },
  {
    id: 'author',
    name: '作家',
    nameEn: 'Author',
    isCustom: false,
    fixed_skills: ['艺术/手艺 (文学)', '图书馆使用', '母语', '心理学'],
    optional_skills: [
      { category: 'language', count: 1 },
    ],
    free_skill_slots: 3,
    credit_rating_min: 9,
    credit_rating_max: 30,
    skill_point_formula: 'edu4',
  },
  {
    id: 'clergy',
    name: '神职人员',
    nameEn: 'Clergy',
    isCustom: false,
    fixed_skills: ['会计', '历史', '图书馆使用', '聆听', '心理学'],
    optional_skills: [
      { category: 'language', count: 1 },
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 1,
    credit_rating_min: 9,
    credit_rating_max: 60,
    skill_point_formula: 'edu4',
  },
  {
    id: 'criminal',
    name: '罪犯',
    nameEn: 'Criminal',
    isCustom: false,
    fixed_skills: ['心理学', '侦查', '潜行'],
    optional_skills: [
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 4,
    credit_rating_min: 5,
    credit_rating_max: 65,
    skill_point_formula: 'edu2_dex2',
  },
  {
    id: 'dilettante',
    name: '业余艺术爱好者',
    nameEn: 'Dilettante',
    isCustom: false,
    fixed_skills: ['射击', '骑术'],
    optional_skills: [
      { category: 'art_craft', count: 1 },
      { category: 'language', count: 1 },
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 3,
    credit_rating_min: 50,
    credit_rating_max: 99,
    skill_point_formula: 'edu2_app2',
  },
  {
    id: 'doctor',
    name: '医生',
    nameEn: 'Doctor',
    isCustom: false,
    fixed_skills: ['急救', '其他语言 (拉丁文)', '医学', '心理学', '科学 (生物学)', '科学 (药学)'],
    optional_skills: [],
    free_skill_slots: 2,
    credit_rating_min: 30,
    credit_rating_max: 80,
    skill_point_formula: 'edu4',
  },
  {
    id: 'drifter',
    name: '流浪者',
    nameEn: 'Drifter',
    isCustom: false,
    fixed_skills: ['攀爬', '跳跃', '聆听', '导航', '潜行'],
    optional_skills: [
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 2,
    credit_rating_min: 0,
    credit_rating_max: 5,
    skill_point_formula: 'edu2_app2',
  },
  {
    id: 'engineer',
    name: '工程师',
    nameEn: 'Engineer',
    isCustom: false,
    fixed_skills: ['艺术/手艺 (设计图纸)', '电气维修', '图书馆使用', '机械维修', '操作重型机械', '科学 (工程学)', '科学 (物理学)'],
    optional_skills: [],
    free_skill_slots: 1,
    credit_rating_min: 30,
    credit_rating_max: 60,
    skill_point_formula: 'edu4',
  },
  {
    id: 'entertainer',
    name: '艺人/演艺人员',
    nameEn: 'Entertainer',
    isCustom: false,
    fixed_skills: ['艺术/手艺 (表演)', '伪装', '聆听', '心理学'],
    optional_skills: [
      { category: 'social', count: 2 },
    ],
    free_skill_slots: 2,
    credit_rating_min: 9,
    credit_rating_max: 70,
    skill_point_formula: 'edu2_app2',
  },
  {
    id: 'farmer',
    name: '农民',
    nameEn: 'Farmer',
    isCustom: false,
    fixed_skills: ['艺术/手艺 (农事)', '驾驶汽车', '机械维修', '自然', '操作重型机械', '追踪'],
    optional_skills: [
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 1,
    credit_rating_min: 9,
    credit_rating_max: 30,
    skill_point_formula: 'edu2_dex2',
  },
  {
    id: 'hacker',
    name: '黑客',
    nameEn: 'Hacker',
    isCustom: false,
    fixed_skills: ['计算机使用', '电气维修', '科学 (电子学)', '图书馆使用', '侦查'],
    optional_skills: [
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 2,
    credit_rating_min: 10,
    credit_rating_max: 70,
    skill_point_formula: 'edu4',
  },
  {
    id: 'journalist',
    name: '记者',
    nameEn: 'Journalist',
    isCustom: false,
    fixed_skills: ['艺术/手艺 (摄影)', '历史', '图书馆使用', '心理学'],
    optional_skills: [
      { category: 'language', count: 1 },
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 2,
    credit_rating_min: 9,
    credit_rating_max: 30,
    skill_point_formula: 'edu4',
  },
  {
    id: 'lawyer',
    name: '律师',
    nameEn: 'Lawyer',
    isCustom: false,
    fixed_skills: ['会计', '法律', '图书馆使用', '心理学'],
    optional_skills: [
      { category: 'social', count: 2 },
    ],
    free_skill_slots: 2,
    credit_rating_min: 30,
    credit_rating_max: 80,
    skill_point_formula: 'edu4',
  },
  {
    id: 'librarian',
    name: '图书馆管理员',
    nameEn: 'Librarian',
    isCustom: false,
    fixed_skills: ['会计', '图书馆使用', '母语'],
    optional_skills: [
      { category: 'language', count: 1 },
    ],
    free_skill_slots: 4,
    credit_rating_min: 9,
    credit_rating_max: 35,
    skill_point_formula: 'edu4',
  },
  {
    id: 'military_officer',
    name: '军官',
    nameEn: 'Military Officer',
    isCustom: false,
    fixed_skills: ['会计', '射击', '导航', '心理学', '生存'],
    optional_skills: [
      { category: 'social', count: 2 },
    ],
    free_skill_slots: 1,
    credit_rating_min: 20,
    credit_rating_max: 70,
    skill_point_formula: 'edu2_dex2',
  },
  {
    id: 'missionary',
    name: '传教士',
    nameEn: 'Missionary',
    isCustom: false,
    fixed_skills: ['机械维修', '医学', '自然'],
    optional_skills: [
      { category: 'art_craft', count: 1 },
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 3,
    credit_rating_min: 0,
    credit_rating_max: 30,
    skill_point_formula: 'edu4',
  },
  {
    id: 'musician',
    name: '音乐家',
    nameEn: 'Musician',
    isCustom: false,
    fixed_skills: ['艺术/手艺 (乐器)', '聆听', '心理学'],
    optional_skills: [
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 4,
    credit_rating_min: 9,
    credit_rating_max: 30,
    skill_point_formula: 'edu2_dex2',
  },
  {
    id: 'parapsychologist',
    name: '超心理学家',
    nameEn: 'Parapsychologist',
    isCustom: false,
    fixed_skills: ['人类学', '艺术/手艺 (摄影)', '历史', '图书馆使用', '神秘学', '心理学'],
    optional_skills: [
      { category: 'language', count: 1 },
    ],
    free_skill_slots: 1,
    credit_rating_min: 9,
    credit_rating_max: 30,
    skill_point_formula: 'edu4',
  },
  {
    id: 'pilot',
    name: '飞行员',
    nameEn: 'Pilot',
    isCustom: false,
    fixed_skills: ['电气维修', '机械维修', '导航', '操作重型机械', '科学 (天文学)'],
    optional_skills: [],
    free_skill_slots: 3,
    credit_rating_min: 20,
    credit_rating_max: 70,
    skill_point_formula: 'edu2_dex2',
  },
  {
    id: 'police_detective',
    name: '警探',
    nameEn: 'Police Detective',
    isCustom: false,
    fixed_skills: ['艺术/手艺 (表演)', '射击', '法律', '聆听', '心理学', '侦查'],
    optional_skills: [
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 1,
    credit_rating_min: 20,
    credit_rating_max: 50,
    skill_point_formula: 'edu2_dex2',
  },
  {
    id: 'police_officer',
    name: '警察',
    nameEn: 'Police Officer',
    isCustom: false,
    fixed_skills: ['格斗 (拳击)', '射击', '急救', '法律', '心理学', '侦查'],
    optional_skills: [
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 1,
    credit_rating_min: 9,
    credit_rating_max: 30,
    skill_point_formula: 'edu2_dex2',
  },
  {
    id: 'private_investigator',
    name: '私家侦探',
    nameEn: 'Private Investigator',
    isCustom: false,
    fixed_skills: ['艺术/手艺 (摄影)', '伪装', '法律', '图书馆使用', '心理学', '侦查'],
    optional_skills: [
      { category: 'social', count: 1 },
    ],
    free_skill_slots: 1,
    credit_rating_min: 9,
    credit_rating_max: 30,
    skill_point_formula: 'edu2_dex2',
  },
  {
    id: 'professor',
    name: '教授',
    nameEn: 'Professor',
    isCustom: false,
    fixed_skills: ['图书馆使用', '母语', '心理学'],
    optional_skills: [
      { category: 'language', count: 1 },
    ],
    free_skill_slots: 4,
    credit_rating_min: 20,
    credit_rating_max: 70,
    skill_point_formula: 'edu4',
  },
  {
    id: 'soldier',
    name: '士兵',
    nameEn: 'Soldier',
    isCustom: false,
    fixed_skills: ['攀爬', '闪避', '格斗', '射击', '潜行', '生存'],
    optional_skills: [],
    free_skill_slots: 2,
    credit_rating_min: 9,
    credit_rating_max: 30,
    skill_point_formula: 'edu2_dex2',
  },
  {
    id: 'tribal_member',
    name: '部落成员',
    nameEn: 'Tribal Member',
    isCustom: false,
    fixed_skills: ['攀爬', '格斗', '自然', '聆听', '神秘学', '侦查', '游泳', '生存'],
    optional_skills: [],
    free_skill_slots: 0,
    credit_rating_min: 0,
    credit_rating_max: 15,
    skill_point_formula: 'edu2_dex2',
  },
  {
    id: 'zealot',
    name: '狂热者',
    nameEn: 'Zealot',
    isCustom: false,
    fixed_skills: ['历史', '心理学', '潜行'],
    optional_skills: [
      { category: 'social', count: 2 },
    ],
    free_skill_slots: 3,
    credit_rating_min: 0,
    credit_rating_max: 30,
    skill_point_formula: 'edu2_app2',
  },
]

export interface SkillsSectionProps {
  occupation: Occupation | null
  attributes: { edu: number; int: number; dex: number; str: number; app: number; pow: number }
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
  const [searchTerm, setSearchTerm] = useState('')
  const [occupationDialogOpen, setOccupationDialogOpen] = useState(false)

  // 从API加载技能数据
  const { skills: allSkills, loading: skillsLoading, getSkillBase } = useSkills()

  const formula = occupation?.skill_point_formula ?? 'edu4'
  const occupationalPoints = calculateOccupationalDisplay(attributes, formula)
  const interestPoints = attributes.int * 2
  const formulaDesc = getFormulaDescription(formula)

  const handleSelectOccupation = (occ: Occupation) => {
    dispatch({ type: 'SET_OCCUPATION', occupation: occ })
    setOccupationDialogOpen(false)
  }

  const handleSelectCustomOccupation = () => {
    dispatch({
      type: 'SET_OCCUPATION',
      occupation: {
        id: 'custom',
        name: '自定义职业',
        isCustom: true,
        fixed_skills: [],
        optional_skills: [],
        free_skill_slots: 8,
        credit_rating_min: 10,
        credit_rating_max: 50,
        skill_point_formula: 'edu4',
      }
    })
    setOccupationDialogOpen(false)
  }

  // 检查技能是否为职业技能
  const isOccupationSkill = (skillName: string): boolean => {
    if (!occupation || occupation.isCustom) return false
    
    // 检查固定技能
    if (occupation.fixed_skills?.includes(skillName)) return true
    
    // 检查可选技能
    for (const opt of (occupation.optional_skills || [])) {
      const available = getOptionalCategorySkills(opt.category)
      if (available.includes(skillName)) return true
    }
    
    return false
  }

  // 获取可选技能已选数量
  const getOptionalSkillStatus = (opt: OptionalSkillCategory) => {
    const availableSkills = getOptionalCategorySkills(opt.category)
    const selected = availableSkills.filter(s => skills[s] > 0)
    const required = opt.count as number
    return { selected, required, completed: selected.length >= required }
  }

  // 获取自选技能已选数量
  const getFreeSkillStatus = () => {
    if (!occupation) return { count: 0, required: 0 }
    
    // 所有职业技能
    const allOccupationSkills = new Set<string>()
    occupation.fixed_skills?.forEach(s => allOccupationSkills.add(s))
    occupation.optional_skills?.forEach(opt => {
      getOptionalCategorySkills(opt.category).forEach(s => allOccupationSkills.add(s))
    })
    
    // 格斗和射击不算自选
    const combatSkills = new Set<string>()
    FIGHTING_SPECIALIZATIONS.forEach(s => combatSkills.add(`格斗 (${s})`))
    FIREARMS_SPECIALIZATIONS.forEach(s => combatSkills.add(`射击 (${s})`))
    combatSkills.add('闪避')
    combatSkills.add('投掷')
    
    let count = 0
    Object.keys(skills).forEach(skillName => {
      if (skills[skillName] > 0 && 
          !allOccupationSkills.has(skillName) && 
          !combatSkills.has(skillName) &&
          skillName !== '信用评级') {
        count++
      }
    })
    
    return { count, required: occupation.free_skill_slots || 0 }
  }

  // 检查技能是否是格斗/射击技能
  const isCombatSkill = (skillName: string): boolean => {
    if (skillName.startsWith('格斗 (') || skillName.startsWith('射击 (')) return true
    if (skillName === '格斗' || skillName === '射击') return true
    if (skillName === '闪避' || skillName === '投掷') return true
    return false
  }

  const handleSkillChange = (skillName: string, delta: number) => {
    dispatch({ type: 'CHANGE_SKILL', skill: skillName, delta })
  }

  const creditRatingValue = skills['信用评级'] ?? 0
  const creditLevel = getCreditRatingLevel(creditRatingValue)

  // 获取已添加的非职业技能
  const getInterestSkills = () => {
    return Object.keys(skills).filter(skillName => {
      if (skillName === '信用评级') return false
      if (isOccupationSkill(skillName)) return false
      if (isCombatSkill(skillName)) return false
      return skills[skillName] > 0
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>技能分配</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 职业选择 */}
        <div className="space-y-2">
          <Label>职业</Label>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setOccupationDialogOpen(true)}
          >
            {occupation ? (
              <span>{occupation.name}</span>
            ) : (
              <span className="text-muted-foreground">点击选择职业 →</span>
            )}
          </Button>
          {occupation && (
            <div className="text-sm text-muted-foreground">
              信用评级范围: {occupation.credit_rating_min} - {occupation.credit_rating_max}
            </div>
          )}
        </div>

        {/* 技能点数统计 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className={`text-2xl font-bold ${occupationalPointsRemaining < 0 ? 'text-destructive' : ''}`}>
              {occupation ? occupationalPointsRemaining : occupationalPoints}
            </div>
            <div className="text-sm text-muted-foreground">本职技能点</div>
            <div className="text-xs text-muted-foreground">{formulaDesc} = {occupationalPoints}</div>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className={`text-2xl font-bold ${interestPointsRemaining < 0 ? 'text-destructive' : ''}`}>
              {occupation ? interestPointsRemaining : interestPoints}
            </div>
            <div className="text-sm text-muted-foreground">兴趣技能点</div>
            <div className="text-xs text-muted-foreground">INT×2 = {interestPoints}</div>
          </div>
        </div>

        {!occupation && (
          <div className="p-4 border rounded-lg bg-muted/30 text-center text-muted-foreground">
            请先选择职业以开始分配技能点
          </div>
        )}

        {occupation && (
          <Tabs defaultValue="occupation" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="occupation">职业技能</TabsTrigger>
              <TabsTrigger value="interest">兴趣技能</TabsTrigger>
              <TabsTrigger value="combat">武器技能</TabsTrigger>
              <TabsTrigger value="credit">信用评级</TabsTrigger>
            </TabsList>

            {/* 职业技能 */}
            <TabsContent value="occupation" className="space-y-6">
              {/* 必备技能 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">必备技能</h4>
                  <Badge variant="outline">消耗本职技能点</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  职业必须具备的技能，从本职技能点中分配。
                </p>
                {occupation.isCustom ? (
                  <div className="text-sm text-muted-foreground">自定义职业无必备技能限制</div>
                ) : (
                  <div className="space-y-2">
                    {occupation.fixed_skills?.map(skillName => {
                      const baseValue = getSkillBase(skillName.split(' (')[0])
                      const currentValue = skills[skillName] ?? 0
                      
                      return (
                        <SkillRow
                          key={skillName}
                          name={skillName}
                          baseValue={baseValue}
                          currentValue={currentValue}
                          pointsRemaining={occupationalPointsRemaining}
                          onIncrease={(delta) => handleSkillChange(skillName, delta)}
                        />
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 可选技能 */}
              {occupation.optional_skills && occupation.optional_skills.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">可选技能</h4>
                    <Badge variant="outline">消耗本职技能点</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    从以下类别中选择技能，消耗本职技能点。
                  </p>
                  
                  {occupation.optional_skills.map((opt, idx) => {
                    const status = getOptionalSkillStatus(opt)
                    const availableSkills = getOptionalCategorySkills(opt.category)
                    
                    return (
                      <div key={idx} className="space-y-2 border-l-2 border-primary pl-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{getOptionalCategoryName(opt.category)}</span>
                          <Badge variant={status.completed ? 'default' : 'secondary'} className="text-xs">
                            {status.selected.length}/{status.required}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {availableSkills.map(skillName => {
                            const isSelected = skills[skillName] > 0
                            const baseValue = getSkillBase(skillName.split(' (')[0])
                            
                            return (
                              <div
                                key={skillName}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded border text-sm ${
                                  isSelected ? 'bg-primary/10 border-primary' : 'bg-muted/30'
                                }`}
                              >
                                <span>{skillName}</span>
                                <span className="text-xs text-muted-foreground">({baseValue})</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => handleSkillChange(skillName, isSelected ? -5 : 5)}
                                  disabled={!isSelected && occupationalPointsRemaining < 5}
                                >
                                  {isSelected ? '-' : '+'}
                                </Button>
                                {isSelected && (
                                  <span className="font-mono text-xs">{baseValue + skills[skillName]}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 自选技能 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">自选技能</h4>
                  <Badge variant="outline">消耗本职技能点</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  从所有技能中自由选择 {occupation.free_skill_slots} 个技能，消耗本职技能点。
                </p>
                
                <FreeSkillStatusBadge status={getFreeSkillStatus()} />
                
                <Input
                  placeholder="搜索技能..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mt-2"
                />
                
                {/* 已选自选技能 */}
                {(() => {
                  const allOccSkills = new Set<string>()
                  occupation.fixed_skills?.forEach(s => allOccSkills.add(s))
                  occupation.optional_skills?.forEach(opt => {
                    getOptionalCategorySkills(opt.category).forEach(s => allOccSkills.add(s))
                  })
                  
                  const selectedFreeSkills = Object.keys(skills).filter(skillName => {
                    if (skillName === '信用评级') return false
                    if (allOccSkills.has(skillName)) return false
                    if (isCombatSkill(skillName)) return false
                    return skills[skillName] > 0
                  })
                  
                  if (selectedFreeSkills.length > 0) {
                    return (
                      <div className="space-y-2 mt-2">
                        <div className="text-xs text-muted-foreground">已选自选技能:</div>
                        {selectedFreeSkills.map(skillName => {
                          const baseValue = getSkillBase(skillName.split(' (')[0])
                          return (
                            <SkillRow
                              key={skillName}
                              name={skillName}
                              baseValue={baseValue}
                              currentValue={skills[skillName]}
                              pointsRemaining={occupationalPointsRemaining}
                              onIncrease={(delta) => handleSkillChange(skillName, delta)}
                            />
                          )
                        })}
                      </div>
                    )
                  }
                  return null
                })()}
                
                {/* 可添加技能 */}
                <div className="space-y-2 mt-2">
                  <div className="text-xs text-muted-foreground">添加技能:</div>
                  {skillsLoading ? (
                    <div className="text-sm text-muted-foreground">加载技能数据...</div>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                      {allSkills
                        .filter(s => s.name !== '克苏鲁神话' && s.name !== '信用评级')
                        .filter(s => !isOccupationSkill(s.name))
                        .filter(s => !isCombatSkill(s.name))
                        .filter(s => !skills[s.name] || skills[s.name] === 0)
                        .filter(s =>
                          s.name.includes(searchTerm) ||
                          s.name_en.toLowerCase().includes(searchTerm.toLowerCase())
                        )
                        .map(skill => (
                          <Button
                            key={skill.name}
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => handleSkillChange(skill.name, 5)}
                            disabled={occupationalPointsRemaining < 5}
                          >
                            {skill.name} <span className="text-xs text-muted-foreground ml-1">({skill.base_value})</span>
                          </Button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* 兴趣技能 */}
            <TabsContent value="interest" className="space-y-4">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">兴趣技能</h4>
                <Badge variant="outline">消耗兴趣技能点 (2倍)</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                兴趣技能可以分配给除克苏鲁神话外的任何技能，消耗兴趣技能点（每5点消耗10点兴趣技能点）。
              </p>

              <Input
                placeholder="搜索技能..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              {/* 已选兴趣技能 */}
              {getInterestSkills().length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">已选兴趣技能:</div>
                  {getInterestSkills().map(skillName => {
                    const baseValue = getSkillBase(skillName.split(' (')[0])
                    return (
                      <SkillRow
                        key={skillName}
                        name={skillName}
                        baseValue={baseValue}
                        currentValue={skills[skillName]}
                        pointsRemaining={interestPointsRemaining}
                        isInterest
                        onIncrease={(delta) => handleSkillChange(skillName, delta)}
                      />
                    )
                  })}
                </div>
              )}

              {/* 添加兴趣技能 */}
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">添加技能:</div>
                {skillsLoading ? (
                  <div className="text-sm text-muted-foreground">加载技能数据...</div>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto">
                    {allSkills
                      .filter(s => s.name !== '克苏鲁神话')
                      .filter(s => !skills[s.name] || skills[s.name] === 0)
                      .filter(s =>
                        s.name.includes(searchTerm) ||
                        s.name_en.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map(skill => (
                        <Button
                          key={skill.name}
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() => handleSkillChange(skill.name, 5)}
                          disabled={interestPointsRemaining < 10}
                        >
                          {skill.name} <span className="text-xs text-muted-foreground ml-1">({skill.base_value})</span>
                        </Button>
                      ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* 武器和射击技能 */}
            <TabsContent value="combat" className="space-y-4">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">武器和射击技能</h4>
                <Badge variant="outline">可用本职或兴趣技能点</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                格斗和射击技能需要先选择特化分类。若职业包含格斗或射击，使用本职技能点；否则使用兴趣技能点。
              </p>

              {/* 格斗 */}
              <div className="space-y-2">
                <div className="font-medium text-sm">格斗 (Fighting)</div>
                <div className="text-xs text-muted-foreground">基础值 25，特化：</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {FIGHTING_SPECIALIZATIONS.map(spec => {
                    const skillName = `格斗 (${spec})`
                    const isOcc = isOccupationSkill('格斗')
                    const currentValue = skills[skillName] ?? 0
                    
                    return (
                      <SkillRowCompact
                        key={skillName}
                        name={skillName}
                        baseValue={25}
                        currentValue={currentValue}
                        isOccupation={isOcc}
                        occPointsRemaining={occupationalPointsRemaining}
                        intPointsRemaining={interestPointsRemaining}
                        onIncrease={(delta) => handleSkillChange(skillName, delta)}
                      />
                    )
                  })}
                </div>
              </div>

              {/* 射击 */}
              <div className="space-y-2">
                <div className="font-medium text-sm">射击 (Firearms)</div>
                <div className="text-xs text-muted-foreground">基础值 20，特化：</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {FIREARMS_SPECIALIZATIONS.map(spec => {
                    const skillName = `射击 (${spec})`
                    const isOcc = isOccupationSkill('射击')
                    const currentValue = skills[skillName] ?? 0
                    
                    return (
                      <SkillRowCompact
                        key={skillName}
                        name={skillName}
                        baseValue={20}
                        currentValue={currentValue}
                        isOccupation={isOcc}
                        occPointsRemaining={occupationalPointsRemaining}
                        intPointsRemaining={interestPointsRemaining}
                        onIncrease={(delta) => handleSkillChange(skillName, delta)}
                      />
                    )
                  })}
                </div>
              </div>

              {/* 其他战斗技能 */}
              <div className="space-y-2">
                <div className="font-medium text-sm">其他战斗技能</div>
                <div className="space-y-2">
                  {['闪避', '投掷'].map(skillName => {
                    const isOcc = isOccupationSkill(skillName)
                    const currentValue = skills[skillName] ?? 0
                    const baseValue = getSkillBase(skillName)
                    
                    return (
                      <SkillRow
                        key={skillName}
                        name={skillName}
                        baseValue={baseValue}
                        currentValue={currentValue}
                        pointsRemaining={isOcc ? occupationalPointsRemaining : interestPointsRemaining}
                        isInterest={!isOcc}
                        onIncrease={(delta) => handleSkillChange(skillName, delta)}
                      />
                    )
                  })}
                </div>
              </div>
            </TabsContent>

            {/* 信用评级 */}
            <TabsContent value="credit" className="space-y-4">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">信用评级</h4>
                <Badge variant="outline">消耗本职技能点</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                信用评级决定了调查员的财富水平和社会地位。职业范围: {occupation.credit_rating_min} - {occupation.credit_rating_max}
              </p>

              <div className="flex items-center gap-4">
                <Label>信用评级值</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newVal = Math.max(0, creditRatingValue - 10)
                      handleSkillChange('信用评级', newVal - creditRatingValue)
                    }}
                  >-</Button>
                  <Input
                    type="number"
                    value={creditRatingValue}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(99, parseInt(e.target.value) || 0))
                      handleSkillChange('信用评级', val - creditRatingValue)
                    }}
                    className="w-20 text-center"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newVal = Math.min(99, creditRatingValue + 10)
                      handleSkillChange('信用评级', newVal - creditRatingValue)
                    }}
                  >+</Button>
                </div>
              </div>

              {creditRatingValue > 0 && (
                <div className="p-4 border rounded-lg bg-muted/30">
                  <div className="font-medium">{creditLevel.name}</div>
                  <div className="text-sm text-muted-foreground">{creditLevel.description}</div>
                  <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">现金:</span> ${creditLevel.cash}</div>
                    <div><span className="text-muted-foreground">资产:</span> ${creditLevel.assets}</div>
                  </div>
                </div>
              )}

              {/* 生活水平表 */}
              <div className="space-y-2">
                <div className="text-sm font-medium">生活水平表</div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">评级</th>
                        <th className="p-2 text-left">水平</th>
                        <th className="p-2 text-left">现金</th>
                        <th className="p-2 text-left">资产</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CREDIT_RATING_LEVELS.map(level => (
                        <tr 
                          key={level.name} 
                          className={`border-t ${creditRatingValue >= level.min && creditRatingValue <= level.max ? 'bg-primary/10' : ''}`}
                        >
                          <td className="p-2">{level.min}-{level.max}</td>
                          <td className="p-2">{level.name}</td>
                          <td className="p-2">${level.cash}</td>
                          <td className="p-2">${level.assets}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>

      {/* 职业选择对话框 */}
      <Dialog open={occupationDialogOpen} onOpenChange={setOccupationDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>选择职业</DialogTitle>
            <DialogDescription>
              选择一个预置职业或创建自定义职业。职业决定了你的本职技能和信用评级范围。
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="preset">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="preset">预置职业</TabsTrigger>
              <TabsTrigger value="custom">自定义职业</TabsTrigger>
            </TabsList>

            <TabsContent value="preset" className="space-y-4">
              <Input
                placeholder="搜索职业..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {PRESET_OCCUPATIONS
                  .filter(occ => occ.name.includes(searchTerm))
                  .map(occ => (
                    <div
                      key={occ.id}
                      className={`p-4 border rounded-lg cursor-pointer hover:bg-accent transition-colors ${
                        occupation?.id === occ.id ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => handleSelectOccupation(occ)}
                    >
                      <div className="font-medium">{occ.name}</div>
                      <div className="text-sm text-muted-foreground mt-1 flex gap-4">
                        <span>信用: {occ.credit_rating_min}-{occ.credit_rating_max}</span>
                        <span>点数: {getFormulaDescription(occ.skill_point_formula)}</span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        必备: {occ.fixed_skills?.slice(0, 3).join('、')}{(occ.fixed_skills?.length ?? 0) > 3 ? '...' : ''}
                      </div>
                    </div>
                  ))}
              </div>
            </TabsContent>

            <TabsContent value="custom" className="space-y-4">
              <div className="text-center py-8">
                <div className="text-muted-foreground mb-4">
                  自定义职业允许你自由选择8个本职技能
                </div>
                <Button
                  variant={occupation?.id === 'custom' ? 'default' : 'outline'}
                  onClick={handleSelectCustomOccupation}
                >
                  选择自定义职业
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function FreeSkillStatusBadge({ status }: { status: { count: number; required: number } }) {
  const isComplete = status.count >= status.required
  return (
    <Badge variant={isComplete ? 'default' : 'secondary'}>
      已选 {status.count}/{status.required}
    </Badge>
  )
}

function SkillRow({
  name,
  baseValue,
  currentValue,
  pointsRemaining,
  isInterest = false,
  onIncrease,
}: {
  name: string
  baseValue: number
  currentValue: number
  pointsRemaining: number
  isInterest?: boolean
  onIncrease: (delta: number) => void
}) {
  const total = baseValue + currentValue
  const halfValue = Math.floor(total / 2)
  const fifthValue = Math.floor(total / 5)
  const cost = isInterest ? 10 : 5

  return (
    <div className="flex items-center gap-3 p-2 rounded border bg-muted/20">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{name}</div>
        <div className="text-xs text-muted-foreground">
          基础 {baseValue} | 半值 {halfValue} | 1/5 {fifthValue}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onIncrease(-5)}
          disabled={currentValue <= 0}
          className="w-8 h-8 p-0"
        >-</Button>

        <div className="w-16 text-center">
          <div className="font-mono text-lg">{total}</div>
          <div className="text-xs text-muted-foreground">+{currentValue}</div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onIncrease(5)}
          disabled={pointsRemaining < cost}
          className="w-8 h-8 p-0"
        >+</Button>
      </div>
    </div>
  )
}

function SkillRowCompact({
  name,
  baseValue,
  currentValue,
  isOccupation,
  occPointsRemaining,
  intPointsRemaining,
  onIncrease,
}: {
  name: string
  baseValue: number
  currentValue: number
  isOccupation: boolean
  occPointsRemaining: number
  intPointsRemaining: number
  onIncrease: (delta: number) => void
}) {
  const total = baseValue + currentValue
  const cost = isOccupation ? 5 : 10
  const pointsRemaining = isOccupation ? occPointsRemaining : intPointsRemaining

  return (
    <div className="flex items-center gap-2 p-2 rounded border bg-muted/20">
      <div className="flex-1 min-w-0 text-sm truncate">{name}</div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onIncrease(-5)}
        disabled={currentValue <= 0}
        className="h-7 w-7 p-0"
      >-</Button>
      <span className="w-8 text-center font-mono text-sm">{total}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onIncrease(5)}
        disabled={pointsRemaining < cost}
        className="h-7 w-7 p-0"
      >+</Button>
    </div>
  )
}
