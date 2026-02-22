// frontend/src/data/skills.ts
// 技能常量和辅助函数 - 技能数据从API获取

// 社交技能列表
export const SOCIAL_SKILLS = ['魅力', '快速交谈', '恐吓', '说服']

// 艺术/手艺特化
export const ART_CRAFT_SPECIALIZATIONS = [
  '表演', '写作', '绘画', '雕塑', '摄影', '音乐', '舞蹈',
  '木工', '铁匠', '裁缝', '设计图纸', '农事', '文学', '乐器'
]

// 语言技能
export const LANGUAGE_SKILLS = [
  '英语', '法语', '德语', '俄语', '西班牙语', '意大利语',
  '日语', '中文', '拉丁文', '古希腊语', '阿拉伯语', '其他语言'
]

// 科学特化
export const SCIENCE_SPECIALIZATIONS = [
  '天文学', '生物学', '植物学', '化学', '药学', '电子学',
  '工程学', '地质学', '数学', '气象学', '物理学', '动物学'
]

// 格斗特化
export const FIGHTING_SPECIALIZATIONS = ['斗殴', '刀剑', '斧头', '链枷/锤', '绞索/鞭子', '矛', '徒手', '拳击']

// 射击特化
export const FIREARMS_SPECIALIZATIONS = ['手枪', '步枪/霰弹枪', '冲锋枪', '机枪', '弓箭', '弩']

// 信用评级生活水平表
export const CREDIT_RATING_LEVELS = [
  { min: 0, max: 9, name: '身无分文', cash: 0.5, assets: 0, description: '流浪汉、乞丐' },
  { min: 10, max: 29, name: '贫穷', cash: 10, assets: 50, description: '劳工、农民' },
  { min: 30, max: 49, name: '标准', cash: 50, assets: 250, description: '普通工薪阶层' },
  { min: 50, max: 69, name: '小康', cash: 250, assets: 1000, description: '专业人士、小商人' },
  { min: 70, max: 89, name: '富裕', cash: 500, assets: 5000, description: '成功商人、医生律师' },
  { min: 90, max: 99, name: '豪富', cash: 5000, assets: 50000, description: '富豪、贵族' },
]

/**
 * 根据信用评级值获取生活水平
 */
export function getCreditRatingLevel(value: number) {
  return CREDIT_RATING_LEVELS.find(l => value >= l.min && value <= l.max) ?? CREDIT_RATING_LEVELS[0]
}

/**
 * 获取可选技能类别的技能列表
 * 用于职业选择时显示可选技能
 */
export function getOptionalCategorySkills(category: string): string[] {
  switch (category) {
    case 'art_craft': return ART_CRAFT_SPECIALIZATIONS.map(s => `艺术/手艺 (${s})`)
    case 'social': return SOCIAL_SKILLS
    case 'language': return LANGUAGE_SKILLS.map(s => `其他语言 (${s})`)
    case 'science': return SCIENCE_SPECIALIZATIONS.map(s => `科学 (${s})`)
    case 'combat': return ['格斗 (斗殴)', '格斗 (刀剑)', '格斗 (拳击)', '射击 (手枪)', '射击 (步枪/霰弹枪)']
    default: return []
  }
}

/**
 * 获取可选技能类别的名称
 */
export function getOptionalCategoryName(category: string): string {
  switch (category) {
    case 'art_craft': return '艺术/手艺（任选其一）'
    case 'social': return '社交技能（任选其一）'
    case 'language': return '其他语言'
    case 'science': return '科学'
    case 'combat': return '战斗技能'
    default: return '其他'
  }
}
