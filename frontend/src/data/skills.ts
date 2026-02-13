// CoC 7e 预设技能列表
//
// 来源：Call of Cthulhu 7th Edition
// 技能默认值为 0（未分配）

export const PRESET_SKILLS: Record<string, number> = {
  // === 职业技能 ===
  "Accounting": 10,
  "Anthropology": 5,
  "Appraise": 5,
  "Archaeology": 1,
  "Art/Craft": 5,
  "Charm": 15,
  "Climb": 20,
  "Credit Rating": 10,
  "Cthulhu Mythos": 0,
  "Disguise": 5,
  "Dodge": 0,
  "Drive Auto": 20,
  "Electric Repair": 10,
  "Fast Talk": 10,
  "Fighting": 25,
  "First Aid": 30,
  "Fighting (Brawl)": 25,
  "Firearms": 20,
  "Handgun": 25,
  "Hide": 10,
  "History": 5,
  "Intimidate": 15,
  "Jump": 20,
  "Law": 5,
  "Library Use": 10,
  "Listen": 5,
  "Locksmith": 1,
  "Mechanical Repair": 10,
  "Medicine": 5,
  "Martial Arts": 25,
  "Natural History": 10,
  "Navigate": 10,
  "Occult": 5,
  "Opinion": 10,
  "Persuade": 10,
  "Psychology": 10,
  "Ride": 5,
  "Science": 1,
  "Sleight of Hand": 10,
  "Spot Hidden": 25,
  "Stealth": 20,
  "Streetwise": 10,
  "Swim": 20,
  "Throw": 20,
  "Track": 10,
  // === 语言技能 ===
  "English": 0,
  "Other Language": 0,
  // === 技能专长 ===
  "Artisan": 0,
  // === 其他 ===
  "Any": 0,
  "Luck": 0,
}

// 职业技能分组（用于职业模板）
export const OCCUPATION_SKILL_GROUPS = {
  combat: ['Fighting', 'Firearms', 'Dodge', 'Throw'],
  social: ['Charm', 'Fast Talk', 'Intimidate', 'Persuade', 'Psychology'],
  knowledge: ['History', 'Library Use', 'Occult', 'Science'],
  technical: ['Drive Auto', 'Electric Repair', 'Mechanical Repair', 'First Aid', 'Medicine', 'Locksmith'],
}

/**
 * 根据分组获取技能列表
 */
export function getSkillsByGroup(group: keyof typeof OCCUPATION_SKILL_GROUPS): string[] {
  return Object.entries(PRESET_SKILLS)
    .filter(([skill]) => OCCUPATION_SKILL_GROUPS[group].includes(skill))
    .map(([skill]) => skill[0])
}
