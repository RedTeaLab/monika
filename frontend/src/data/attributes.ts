// CoC 7e 核心属性数据

export interface AttributeInfo {
  id: string
  name: string
  nameEn: string
  rollFormula: string
  description: string
  meanings: AttributeMeaning[]
}

export interface AttributeMeaning {
  value: number
  label: string
  description: string
}

// 核心属性信息
export const ATTRIBUTES: AttributeInfo[] = [
  {
    id: 'str',
    name: '力量',
    nameEn: 'STR',
    rollFormula: '3d6×5',
    description: '力量是调查员肌肉能力的量化。力量越高，调查员就能举起更重的东西或更强有力的抓住物体。该属性会决定调查员在近战中造成的伤害。力量降低为0时，调查员就成为了一个无法离开床铺的病号。',
    meanings: [
      { value: 0, label: '衰弱', description: '没法站起来甚至端起一杯茶' },
      { value: 15, label: '弱者', description: '虚弱，举重困难' },
      { value: 50, label: '普通', description: '普通人的平均力量' },
      { value: 90, label: '强壮', description: '你见过的力气最大的人' },
      { value: 99, label: '世界级', description: '奥赛举重冠军，人类极限' },
      { value: 140, label: '超越人类', description: '超越人类之力（例如大猩猩或马）' },
      { value: 200, label: '怪物', description: '怪物之力（例如格拉基）' },
    ]
  },
  {
    id: 'con',
    name: '体质',
    nameEn: 'CON',
    rollFormula: '3d6×5',
    description: '体质意味着健康、生气和活力。毒药和疾病会与调查员的体质属性正面相斗。高体质的调查员会有更多的生命值——能承受更多伤害和攻击。严重的物理损伤或魔法攻击有可能降低该属性，而当体质降为0时，调查员就死了。',
    meanings: [
      { value: 0, label: '死亡', description: '生命垂危，随时可能离世' },
      { value: 1, label: '体弱多病', description: '易病难愈，可能在没有帮助的情况下无法自理' },
      { value: 15, label: '虚弱', description: '身体虚弱，易突发疾病，易感到疼痛' },
      { value: 50, label: '普通', description: '普通人的平均体质' },
      { value: 90, label: '强健', description: '不惧寒冷，强壮而精神' },
      { value: 99, label: '钢铁之躯', description: '能够承受巨大的疼痛，人类极限' },
      { value: 140, label: '超越人类', description: '超越人类之体格（大象）' },
      { value: 200, label: '怪物', description: '怪物之体，免疫大部分地球疾病' },
    ]
  },
  {
    id: 'siz',
    name: '体型',
    nameEn: 'SIZ',
    rollFormula: '2d6+6×5',
    description: '体型值将身高和体重整合成了一个数字。伸长脖子越过矮墙观望，或者挤进狭窄的空间，或者判定谁的头在蹲下时也会高处草堆一个截时，就看体型了。体型可以帮助决定生命值和伤害加值和体格。体型的减少通常意味着丢失肢体，当然这也意味着敏捷的减少。',
    meanings: [
      { value: 1, label: '婴儿', description: '一个婴儿（1~12磅）' },
      { value: 15, label: '孩童', description: '孩童，或身短体瘦（矮人）（33磅/15kg）' },
      { value: 50, label: '普通', description: '普通人的平均体型' },
      { value: 65, label: '中等', description: '普通人类体型（中等身高和体重）（170磅/75kg）' },
      { value: 80, label: '高大', description: '非常高，强健的体格或非常胖（240磅/110kg）' },
      { value: 99, label: '超大', description: '某方面已经是超大号了（330磅/150kg）' },
      { value: 150, label: '兽类', description: '马或牛（960磅/436kg）' },
      { value: 180, label: '记录', description: '记录中最重的人类（1400磅/634kg）' },
      { value: 200, label: '怪物', description: '1920磅/872kg（例如昌格纳·方庚）' },
    ]
  },
  {
    id: 'dex',
    name: '敏捷',
    nameEn: 'DEX',
    rollFormula: '3d6×5',
    description: '高敏捷的调查员更为迅捷灵敏，肉体更加柔韧。敏捷检定可以帮助你在坠落中抓住支撑，或高速穿越敌人，或做到一些纤细的行动。敏捷降为0的调查员将会神经絮乱，无法完成任何物理行动。在战斗中，高敏捷的角色会优先行动。',
    meanings: [
      { value: 0, label: '无法移动', description: '没有协助无法移动' },
      { value: 15, label: '笨拙', description: '缓慢，笨拙，无法行动自如' },
      { value: 50, label: '普通', description: '普通人的平均敏捷' },
      { value: 90, label: '灵活', description: '高速而灵活，可以达成超凡的技艺（例如杂技演员、伟大的舞者）' },
      { value: 99, label: '世界级', description: '世界级运动员，人类极限' },
      { value: 120, label: '超越人类', description: '超越人类之速（例如虎）' },
      { value: 200, label: '闪电', description: '闪电之速，可以在人类反应过来之前完成一系列动作' },
    ]
  },
  {
    id: 'app',
    name: '外貌',
    nameEn: 'APP',
    rollFormula: '3d6×5',
    description: '外貌统括了肉体吸引力和人格魅力。高外貌的人潇洒而惹人喜爱，但不一定会有一副好面孔。外貌降为0的人恐怖而丑陋，有着令人十分厌恶的举止，走到哪都会引发议论和震动。外貌会在社交活动中发生效用，或在试图给某人留下好印象时有所帮助。',
    meanings: [
      { value: 0, label: '恐怖', description: '十分难看。他人会对你报以恐惧、厌恶和怜悯' },
      { value: 15, label: '丑陋', description: '挫。估计是因为受伤事故或先天如此' },
      { value: 50, label: '普通', description: '普通人的平均外貌' },
      { value: 90, label: '英俊', description: '你见过的最漂亮的人，有着天然的吸引力' },
      { value: 99, label: '完美', description: '魅力和酷的巅峰（超级名模或世界影星），人类极限' },
    ]
  },
  {
    id: 'int',
    name: '智力',
    nameEn: 'INT',
    rollFormula: '2d6+6×5',
    description: '智力表示为调查员学习能力、理解能力、信息分析能力和解密能力的优劣度。智力降为0的调查员就会如同婴儿般是个流涎的傻瓜。',
    meanings: [
      { value: 0, label: '无智', description: '没有智商，无法理解周遭的世界' },
      { value: 15, label: '愚钝', description: '学得很慢，只能理解最常用的数字，或阅读学前教育级别的书' },
      { value: 50, label: '普通', description: '普通人的平均智力' },
      { value: 90, label: '聪明', description: '超凡之脑，可以理解多门语言或定理' },
      { value: 99, label: '天才', description: '天才（爱因斯坦、达芬奇、特斯拉等等），人类极限' },
      { value: 140, label: '超越人类', description: '超越人类之智（例如远古者）' },
      { value: 210, label: '怪物', description: '怪物之智，可以理解并操作多重次元（例如伟大的克苏鲁）' },
    ]
  },
  {
    id: 'pow',
    name: '意志',
    nameEn: 'POW',
    rollFormula: '3d6×5',
    description: '意志正是心意的力量；意志越高，学习和抵抗魔法的资质就越高。意志降为0的调查员如同行尸走肉，没有了"意念"，当然也无法使用魔法。除非特有说明，否则游戏中意志的降低会是永久性的。',
    meanings: [
      { value: 0, label: '弱者', description: '弱者的心，没有意志力，没有魔法潜能' },
      { value: 15, label: '薄弱', description: '意志力弱，经常成为高智力或高意志人士的人偶或玩物' },
      { value: 50, label: '普通', description: '普通人的平均意志' },
      { value: 90, label: '坚强', description: '坚强的心，对沟通不可视之物和魔法有着高潜质' },
      { value: 100, label: '钢铁', description: '钢铁之心，与灵能领域和不可视世界有着强烈的链接' },
      { value: 140, label: '超越人类', description: '超越人类，基本上是异界存在（例如依格）' },
      { value: 210, label: '怪物', description: '怪物的魔法潜质和力量，超越凡人之理解力（例如伟大的克苏鲁）' },
    ]
  },
  {
    id: 'edu',
    name: '教育',
    nameEn: 'EDU',
    rollFormula: '2d6+6×5',
    description: '教育属性是调查员所真正掌握的正规知识的量化，它表明了调查员在全日制学习中花费了多长时间。教育表示的是调查员保持的信息数量，而非机智应变使用信息的能力（那是智力的范畴）。教育为0的角色估计是新生儿或者失忆过——没有关于世界的常识，就会显得十分好奇而容易受骗。',
    meanings: [
      { value: 0, label: '新生儿', description: '新生儿' },
      { value: 15, label: '无教育', description: '任何方面都没有受过教育' },
      { value: 50, label: '普通', description: '普通人的平均教育' },
      { value: 60, label: '高中', description: '高中毕业' },
      { value: 70, label: '大学', description: '大学毕业（专科学位）' },
      { value: 80, label: '研究生', description: '研究生毕业（硕士学位）' },
      { value: 90, label: '博士', description: '博士学位，教授' },
      { value: 96, label: '权威', description: '某研究领域的世界级权威' },
      { value: 99, label: '人类极限', description: '人类极限' },
    ]
  },
]

// 幸运值
export const LUCK_INFO = {
  rollFormula: '3d6×5',
  description: '创建调查员时，骰3d6，结果乘5，即是幸运值。幸运值可用于在游戏中重新掷骰或修正检定结果。',
}

// 年龄调整规则
export interface AgeAdjustment {
  range: string
  description: string
  strSizDexChange: number
  eduChange: number
  appChange: number
  eduBonusRolls: number
  luckRolls: number
}

export const AGE_ADJUSTMENTS: AgeAdjustment[] = [
  {
    range: '15-19岁',
    description: '青少年时期',
    strSizDexChange: -5,
    eduChange: -5,
    appChange: 0,
    eduBonusRolls: 0,
    luckRolls: 2,
  },
  {
    range: '20-39岁',
    description: '成年早期',
    strSizDexChange: 0,
    eduChange: 0,
    appChange: 0,
    eduBonusRolls: 1,
    luckRolls: 1,
  },
  {
    range: '40-49岁',
    description: '中年',
    strSizDexChange: -5,
    eduChange: 0,
    appChange: -5,
    eduBonusRolls: 2,
    luckRolls: 1,
  },
  {
    range: '50-59岁',
    description: '中老年',
    strSizDexChange: -10,
    eduChange: 0,
    appChange: -10,
    eduBonusRolls: 3,
    luckRolls: 1,
  },
  {
    range: '60-69岁',
    description: '老年',
    strSizDexChange: -20,
    eduChange: 0,
    appChange: -15,
    eduBonusRolls: 4,
    luckRolls: 1,
  },
  {
    range: '70-79岁',
    description: '高龄',
    strSizDexChange: -40,
    eduChange: 0,
    appChange: -20,
    eduBonusRolls: 4,
    luckRolls: 1,
  },
  {
    range: '80-89岁',
    description: '超高龄',
    strSizDexChange: -80,
    eduChange: 0,
    appChange: -25,
    eduBonusRolls: 4,
    luckRolls: 1,
  },
]

// 伤害加值和体格表
export interface DamageBonusEntry {
  minStrSiz: number
  maxStrSiz: number
  damageBonus: string
  build: number
}

export const DAMAGE_BONUS_TABLE: DamageBonusEntry[] = [
  { minStrSiz: 2, maxStrSiz: 64, damageBonus: '-2', build: -2 },
  { minStrSiz: 65, maxStrSiz: 84, damageBonus: '-1', build: -1 },
  { minStrSiz: 85, maxStrSiz: 124, damageBonus: '0', build: 0 },
  { minStrSiz: 125, maxStrSiz: 164, damageBonus: '+1d4', build: 1 },
  { minStrSiz: 165, maxStrSiz: 204, damageBonus: '+1d6', build: 2 },
  { minStrSiz: 205, maxStrSiz: 284, damageBonus: '+2d6', build: 3 },
  { minStrSiz: 285, maxStrSiz: 364, damageBonus: '+3d6', build: 4 },
  { minStrSiz: 365, maxStrSiz: 444, damageBonus: '+4d6', build: 5 },
  { minStrSiz: 445, maxStrSiz: 524, damageBonus: '+5d6', build: 6 },
]

// 根据力量+体型计算伤害加值和体格
export function calculateDamageBonus(str: number, siz: number): { damageBonus: string; build: number } {
  const strSiz = str + siz

  // 查找对应的伤害加值
  const entry = DAMAGE_BONUS_TABLE.find(e => strSiz >= e.minStrSiz && strSiz <= e.maxStrSiz)

  if (entry) {
    return { damageBonus: entry.damageBonus, build: entry.build }
  }

  // 超过表格范围，每80点增加1d6伤害加值和+1体格
  const extra = Math.floor((strSiz - 524) / 80)
  const baseDamage = 6 + extra
  const baseBuild = 6 + extra
  return { damageBonus: `+${baseDamage}d6`, build: baseBuild }
}

// 计算生命值
export function calculateHitPoints(con: number, siz: number): number {
  return Math.floor((con + siz) / 10)
}

// 计算移动速度
export function calculateMoveRate(str: number, dex: number, siz: number, age: number): number {
  let move = 8 // 基础移动速度

  // 根据属性调整
  if (dex < siz && str < siz) {
    move = 7
  } else if (dex >= siz && str >= siz) {
    move = 9
  }

  // 根据年龄调整
  if (age >= 40 && age <= 49) move -= 1
  else if (age >= 50 && age <= 59) move -= 2
  else if (age >= 60 && age <= 69) move -= 3
  else if (age >= 70 && age <= 79) move -= 4
  else if (age >= 80 && age <= 89) move -= 5

  return Math.max(1, move) // 至少为1
}

// 计算魔法值（魔力点）
export function calculateMagicPoints(pow: number): number {
  return Math.floor(pow / 5)
}

// 计算理智值（SAN）
export function calculateSanity(pow: number): { current: number; max: number } {
  return { current: pow, max: 99 - pow }
}

// 教育增强检定
export function rollEducationBonus(currentEdu: number): { success: boolean; newEdu?: number } {
  const roll = Math.floor(Math.random() * 100) + 1
  if (roll > currentEdu && currentEdu < 99) {
    const increase = Math.floor(Math.random() * 10) + 1
    const newEdu = Math.min(99, currentEdu + increase)
    return { success: true, newEdu }
  }
  return { success: false }
}

// 计算半值和五分之一值
export function calculateDifficultyValues(attributeValue: number): { half: number; fifth: number } {
  return {
    half: Math.floor(attributeValue / 2),
    fifth: Math.floor(attributeValue / 5),
  }
}

// 幸运值掷骰（取两次中较高的）
export function rollLuck(): number {
  const roll1 = (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1)
  const roll2 = (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1)
  return Math.max(roll1, roll2) * 5
}

// 标准幸运值掷骰
export function rollLuckStandard(): number {
  return ((Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1)) * 5
}

// 属性ID类型
export type AttributeId = 'str' | 'con' | 'siz' | 'dex' | 'app' | 'int' | 'pow' | 'edu'

// 获取属性信息
export function getAttributeInfo(id: AttributeId): AttributeInfo | undefined {
  return ATTRIBUTES.find(attr => attr.id === id)
}

// 获取属性含义
export function getAttributeMeaning(id: AttributeId, value: number): string {
  const attr = getAttributeInfo(id)
  if (!attr) return ''

  // 找到最接近的值
  const sortedMeanings = [...attr.meanings].sort((a, b) => a.value - b.value)
  let result = ''

  for (let i = 0; i < sortedMeanings.length; i++) {
    if (value >= sortedMeanings[i].value) {
      result = `${sortedMeanings[i].label}：${sortedMeanings[i].description}`
    } else {
      break
    }
  }

  return result || '未知'
}
