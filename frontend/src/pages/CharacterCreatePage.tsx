import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { InvestigatorFileCard } from '@/components/InvestigatorFileCard'
import type { InvestigatorData } from '@/types/investigator'

interface CharacterCreationState {
  step: 'roll_attributes' | 'occupation' | 'personal_info' | 'review'
  attributes: {
    str: number
    con: number
    siz: number
    dex: number
    app: number
    pow: number
    int: number
    edu: number
  }
  rolls: Record<string, number[]>
}

const ATTRIBUTES = ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu'] as const

const ATTRIBUTE_INFO: Record<string, { name: string; shortDesc: string; description: string }> = {
  str: { name: '力量 (STR)', shortDesc: '3d6×5', description: '力量是调查员肌肉能力的量化。力量越高，调查员就能举起更重的东西或更强有力的抓住物体。该属性会决定调查员在近战中造成的伤害。' },
  con: { name: '体质 (CON)', shortDesc: '3d6×5', description: '体质意味着健康、生气和活力。毒药和疾病会与调查员的体质属性正面相斗。高体质的调查员会有更多的生命值。' },
  siz: { name: '体型 (SIZ)', shortDesc: '2d6+6×5', description: '体型值将身高和体重整合成了一个数字。伸长脖子越过矮墙观望，或者挤进狭窄的空间。' },
  dex: { name: '敏捷 (DEX)', shortDesc: '3d6×5', description: '高敏捷的调查员更为迅捷灵敏，肉体更加柔韧。敏捷检定可以帮助你在坠落中抓住支撑，或高速穿越敌人。' },
  app: { name: '外貌 (APP)', shortDesc: '3d6×5', description: '外貌统括了肉体吸引力和人格魅力。高外貌的人潇洒而惹人喜爱。外貌会在社交活动中发生效用。' },
  int: { name: '智力 (INT)', shortDesc: '2d6+6×5', description: '智力表示为调查员学习能力、理解能力、信息分析能力和解密能力的优劣度。' },
  pow: { name: '意志 (POW)', shortDesc: '3d6×5', description: '意志正是心意的力量。意志越高，学习和抵抗魔法的资质就越高。意志降为0的调查员如同行尸走肉。' },
  edu: { name: '教育 (EDU)', shortDesc: '2d6+6×5', description: '教育属性是调查员所真正掌握的正规知识的量化，它表明了调查员在全日制学习中花费了多长时间。' },
}

// Value meanings for each attribute
const ATTRIBUTE_MEANINGS: Record<string, Record<number, string>> = {
  str: {
    0: '衰弱：没法站起来甚至端起一杯茶',
    15: '虚弱：连举起一把椅子都困难',
    50: '普通：普通人的平均力量',
    65: '健壮：能举起自己的体重',
    80: '强壮：能轻松搬运重物',
    90: '非常强壮：专业运动员或重体力劳动者水平',
    99: '世界级：奥赛举重冠军，人类极限',
    100: '超人：超越人类极限',
  },
  con: {
    0: '濒死：生命垂危，随时可能离世',
    15: '体弱多病：经常生病，抵抗力差',
    50: '普通：普通人的平均体质',
    90: '强健：很少生病，恢复能力强',
    99: '钢铁之躯：几乎不生病，极其强健',
  },
  siz: {
    0: '微小：像昆虫一样小',
    40: '瘦小：身材矮小瘦弱',
    50: '普通：普通人的平均体型',
    60: '高大：身材高大魁梧',
    80: '巨大：非常庞大，像相扑选手',
    100: '巨型：超乎寻常的巨大体型',
  },
  dex: {
    0: '僵硬：几乎无法移动',
    15: '笨拙：动作不协调，经常绊倒',
    50: '普通：普通人的平均敏捷',
    80: '灵活：动作流畅，反应迅速',
    90: '非常灵活：像体操运动员一样',
    99: '超人：反应速度超越人类极限',
  },
  app: {
    0: '恐怖：令人作呕的外貌，让人不敢直视',
    15: '丑陋：外貌欠佳，容易引起他人注意',
    50: '普通：普通人的平均外貌',
    80: '英俊/美丽：外貌出众，吸引他人目光',
    90: '非常英俊/美丽：像电影明星一样',
    99: '完美：绝世容颜，令人神魂颠倒',
  },
  int: {
    0: '痴呆：智力如同婴儿',
    15: '愚钝：理解能力差，学习困难',
    50: '普通：普通人的平均智力',
    80: '聪明：学习能力强，理解迅速',
    90: '非常聪明：天才级别，智力超群',
    99: '超人：智力超越人类极限',
  },
  pow: {
    0: '意志崩溃：没有任何意志力，如同行尸走肉',
    15: '意志薄弱：容易被说服或影响',
    50: '普通：普通人的平均意志',
    80: '意志坚定：不容易被他人影响',
    90: '意志极强：钢铁般的意志，难以动摇',
    99: '超人：意志力超越人类极限',
  },
  edu: {
    0: '无知：没有受过任何教育',
    15: '基础教育：只有基本的文化知识',
    50: '普通：高中或同等学历水平',
    70: '高等教育：大学毕业',
    80: '高学历：硕士或同等水平',
    90: '专家：博士或更高学历',
    99: '学者：该领域的顶尖专家',
  },
}

export function CharacterCreatePage() {
  const navigate = useNavigate()
  const [selectedAttribute, setSelectedAttribute] = useState<string | null>(null)
  const [isRolling, setIsRolling] = useState(false)
  const [showInvestigatorCard, setShowInvestigatorCard] = useState(false)

  const [state, setState] = useState<CharacterCreationState>({
    step: 'roll_attributes',
    attributes: { str: 0, con: 0, siz: 0, dex: 0, app: 0, pow: 0, int: 0, edu: 0 },
    rolls: {},
  })

  const rollAttribute = async (attr: string) => {
    setIsRolling(true)
    await new Promise(r => setTimeout(r, 600))

    let roll1 = Math.floor(Math.random() * 6) + 1
    let roll2 = Math.floor(Math.random() * 6) + 1
    let roll3 = Math.floor(Math.random() * 6) + 1
    if (attr === 'siz' || attr === 'int' || attr === 'edu') {
      roll3 = 0
    }

    const value = attr === 'siz' || attr === 'int' || attr === 'edu'
      ? (roll1 + roll2 + 6) * 5
      : (roll1 + roll2 + roll3) * 5

    setState(prev => ({
      ...prev,
      attributes: { ...prev.attributes, [attr]: value },
      rolls: { ...prev.rolls, [attr]: [roll1, roll2, roll3] },
    }))

    setTimeout(() => setIsRolling(false), 100)
  }

  const rollAllAttributes = async () => {
    setIsRolling(true)
    for (let i = 0; i < ATTRIBUTES.length; i++) {
      await rollAttribute(ATTRIBUTES[i])
      await new Promise(r => setTimeout(r, 300))
    }
  }

  // Get investigator data for card display
  const getInvestigatorData = (): Partial<InvestigatorData> => {
    const { str, con, siz, dex, app, pow: powAttr, int: intAttr, edu: eduAttr } = state.attributes

    // HP = (CON + SIZ) ÷ 10
    const hp = Math.floor((con + siz) / 10)
    const hpMax = hp

    // MP = POW ÷ 5
    const mp = Math.floor(powAttr / 5)
    const mpMax = mp

    // SAN = POW
    const sanity = { current: powAttr, max: 99 - powAttr }

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
    let db = '-1D4'
    if (strSiz > 64) db = '-1D4'
    if (strSiz > 84) db = '0'
    if (strSiz > 124) db = '+1D4'
    if (strSiz > 164) db = '+1D6'

    return {
      name: '未命名调查员',
      age: 25,
      gender: 'other' as const,
      occupation: '',
      attributes: {
        str: state.attributes.str || 0,
        con: state.attributes.con || 0,
        siz: state.attributes.siz || 0,
        dex: state.attributes.dex || 0,
        app: state.attributes.app || 0,
        int: state.attributes.int || 0,
        pow: state.attributes.pow || 0,
        edu: state.attributes.edu || 0,
      },
      hp: { current: hp, max: hpMax },
      mp: { current: mp, max: mpMax },
      sanity,
      luck: { current: 50, max: 50 },
      derived: { move, build, damageBonus: db },
      skills: [],
    }
  }

  // Check if all attributes have been rolled
  const allAttributesRolled = ATTRIBUTES.every(attr => state.rolls[attr] && state.rolls[attr].length > 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-900 via-stone-800 to-amber-950/30">
      {/* Header */}
      <header className="border-b-4 border-amber-900/40 bg-amber-950/10 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded bg-amber-950 animate-pulse"></div>
              <div>
                <h1 className="text-2xl font-bold tracking-widest text-amber-100 font-serif">
                  调查员档案
                </h1>
                <p className="text-amber-200/70 text-sm">
                  美国 1920s · 阿卡姆探员协会
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowInvestigatorCard(!showInvestigatorCard)}
              className="text-amber-200 hover:text-amber-100 font-serif"
              disabled={!allAttributesRolled}
            >
              {showInvestigatorCard ? '← 返回掷骰' : '查看档案卡 →'}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {!showInvestigatorCard ? (
          <>
            {/* Intro */}
            <div className="text-center mb-8">
              <p className="text-amber-100/80 text-lg leading-relaxed font-serif">
                使用古老的三枚六面骰子……决定你调查员的七项核心属性
              </p>
            </div>

            {/* Attribute cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {ATTRIBUTES.map((attr) => {
                const info = ATTRIBUTE_INFO[attr]
                const roll = state.rolls[attr]
                const value = state.attributes[attr]
                const isSelected = selectedAttribute === attr

                return (
                  <div
                    key={attr}
                    className={`
                      group relative
                      ${roll ? 'opacity-100' : 'opacity-70'}
                      transition-all duration-300
                    `}
                  >
                    <div
                      className={`
                        relative bg-amber-50 border-4 border-double border-amber-900/60
                        shadow-[0_2px_4px_rgba(0,0,0,0.3)] p-6
                        transition-all duration-300 hover:scale-105 cursor-pointer
                        ${roll ? 'rotate-1' : '-rotate-1'}
                      `}
                      onClick={() => setSelectedAttribute(isSelected ? null : attr)}
                    >
                      {/* Coffee stain effect */}
                      {roll && (
                        <div
                          className="absolute inset-0 pointer-events-none opacity-40"
                          style={{
                            background: 'radial-gradient(circle at 70% 70%, rgba(120, 80, 40, 0.3) 0%, transparent 50%)',
                            filter: 'blur(4px)',
                          }}
                        />
                      )}

                      <div className="relative z-10">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-lg font-bold text-amber-900 font-serif uppercase tracking-wider">
                              {info.name}
                            </h3>
                            <div className="text-xs text-amber-600/80 font-mono">
                              {info.shortDesc}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold text-amber-900">
                              {value || '---'}
                            </div>
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-amber-700/30 my-3"></div>

                        {/* Roll info or roll button */}
                        {!roll ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); rollAttribute(attr) }}
                            disabled={isRolling}
                            className="w-full py-2 text-sm text-amber-900/80 hover:bg-amber-200/50 font-serif"
                            style={{ fontFamily: 'Courier New, monospace' }}
                          >
                            🎲 掷骰
                          </button>
                        ) : (
                          <div className="text-center">
                            <div className="text-xs text-amber-600/80 font-mono mb-1">
                              {roll.filter(r => r !== 0).join(' + ')}
                              {attr === 'siz' || attr === 'int' || attr === 'edu' ? ' + 6' : ''} × 5
                            </div>
                            <div className="text-[10px] text-amber-500/60">
                              {ATTRIBUTE_MEANINGS[attr]?.[value] || '点击查看详情'}
                            </div>
                          </div>
                        )}

                        {/* Value meanings on selection */}
                        {isSelected && roll && (
                          <div className="mt-3 pt-3 border-t border-amber-700/20">
                            <div className="text-[10px] text-amber-700/60 mb-2 uppercase tracking-wider">Value Meanings</div>
                            <div className="space-y-1 text-xs">
                              {Object.entries(ATTRIBUTE_MEANINGS[attr] || {})
                                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                                .slice(0, 5)
                                .map(([val, meaning]) => (
                                  <div
                                    key={val}
                                    className={`flex gap-2 ${parseInt(val) === value ? 'text-amber-900 font-bold' : 'text-amber-700/70'}`}
                                  >
                                    <span className="font-mono w-8">{val}:</span>
                                    <span className="flex-1">{meaning}</span>
                                  </div>
                                ))}
                            </div>
                            <div className="mt-2 text-[10px] text-amber-600/60">
                              {info.description}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Action buttons */}
            <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={rollAllAttributes}
                disabled={isRolling}
                className="px-8 py-3 bg-amber-900/20 border-2 border-amber-700/50 text-amber-100 font-serif hover:bg-amber-800/30"
                style={{ fontFamily: 'Courier New, monospace' }}
              >
                🎲 全部重掷
              </button>
              <Button
                onClick={() => {
                  setState(prev => ({ ...prev, step: 'occupation' as const }))
                }}
                disabled={!allAttributesRolled}
                className="min-w-40 px-6 py-3 bg-amber-900/80 text-amber-50 font-serif hover:bg-amber-900"
                style={{ fontFamily: 'Courier New, monospace' }}
              >
                确认 → 选择职业
              </Button>
            </div>
          </>
        ) : (
          /* Investigator File Card View */
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-6">
              <p className="text-amber-100/80 text-lg leading-relaxed font-serif">
                调查员档案卡
              </p>
            </div>
            <InvestigatorFileCard data={getInvestigatorData()} editable={false} />
            <div className="mt-8 flex justify-center">
              <Button
                onClick={() => setState(prev => ({ ...prev, step: 'occupation' as const }))}
                className="px-8 py-3 bg-amber-900/80 text-amber-50 font-serif hover:bg-amber-900"
                style={{ fontFamily: 'Courier New, monospace' }}
              >
                确认 → 选择职业
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Decorative elements */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-b from-amber-200/50 to-transparent opacity-30"></div>
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-t from-transparent via-amber-200/30 to-amber-950/20 opacity-50"></div>
      </div>

      {/* Custom font import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@400;700&display=swap');

        .font-serif {
          font-family: 'Courier Prime', 'Courier New', monospace;
        }
      `}</style>
    </div>
  )
}

export default CharacterCreatePage
