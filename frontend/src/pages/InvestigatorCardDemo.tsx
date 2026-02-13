/**
 * InvestigatorFileCard Demo Page
 *
 * This page demonstrates the InvestigatorFileCard component with various examples
 */

import * as React from "react"
import { InvestigatorFileCard, InvestigatorFileCardSkeleton } from "@/components"
import type { InvestigatorData } from "@/types/investigator"

export default function InvestigatorCardDemo() {
  const [selectedExample, setSelectedExample] = React.useState<number>(0)

  const examples = [
    {
      title: "基本卡片",
      description: "仅包含基本信息的调查员卡片",
      data: {
        name: "艾丽丝·威廉姆斯",
        age: 28,
        gender: "female" as const,
        occupation: "私人侦探",
        attributes: {
          str: 50,
          con: 60,
          siz: 50,
          dex: 70,
          app: 60,
          int: 70,
          pow: 50,
          edu: 60,
        },
      } as Partial<InvestigatorData>,
    },
    {
      title: "完整卡片",
      description: "包含所有信息的调查员卡片",
      data: {
        name: "亨利·卡特赖特",
        age: 35,
        gender: "male" as const,
        occupation: "考古学家",
        portrait: "https://i.pravatar.cc/300?img=12",
        birthYear: 1895,
        nationality: "英国",
        residence: "伦敦",
        attributes: {
          str: 60,
          con: 55,
          siz: 60,
          dex: 50,
          app: 40,
          int: 80,
          pow: 60,
          edu: 85,
        },
        hp: { current: 11, max: 11 },
        mp: { current: 12, max: 12 },
        sanity: { current: 58, max: 60 },
        luck: { current: 45, max: 50 },
      } as Partial<InvestigatorData>,
    },
    {
      title: "紧凑视图",
      description: "不显示衍生属性的紧凑模式",
      data: {
        name: "莎拉·康纳",
        age: 24,
        gender: "female" as const,
        occupation: "新闻记者",
        attributes: {
          str: 45,
          con: 50,
          siz: 45,
          dex: 65,
          app: 70,
          int: 75,
          pow: 55,
          edu: 70,
        },
        hp: { current: 9, max: 9 },
        sanity: { current: 55, max: 60 },
      } as Partial<InvestigatorData>,
      compact: true,
    },
    {
      title: "加载状态",
      description: "加载中的骨架屏",
      skeleton: true,
    },
  ]

  const currentExample = examples[selectedExample]

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-50 to-stone-200 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-amber-900 font-mono">
            Investigator File Card
          </h1>
          <p className="text-amber-700/70 font-mono text-sm">
            CoC 7th Edition Character Display Component
          </p>
        </div>

        {/* Example selector */}
        <div className="flex flex-wrap justify-center gap-2">
          {examples.map((example, index) => (
            <button
              key={index}
              onClick={() => setSelectedExample(index)}
              className={`
                px-4 py-2 rounded-lg font-mono text-sm transition-all
                ${
                  selectedExample === index
                    ? "bg-amber-900 text-amber-50 shadow-lg"
                    : "bg-amber-100 text-amber-900 hover:bg-amber-200"
                }
              `}
            >
              {example.title}
            </button>
          ))}
        </div>

        {/* Current example display */}
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-amber-900 font-mono">
              {currentExample.title}
            </h2>
            <p className="text-amber-700/70 font-mono text-sm mt-1">
              {currentExample.description}
            </p>
          </div>

          <div className="flex justify-center">
            {currentExample.skeleton ? (
              <InvestigatorFileCardSkeleton />
            ) : (
              <InvestigatorFileCard
                data={currentExample.data}
                compact={currentExample.compact}
              />
            )}
          </div>
        </div>

        {/* Code example */}
        <div className="bg-amber-950 text-amber-100 p-6 rounded-lg font-mono text-sm overflow-x-auto">
          <pre className="whitespace-pre-wrap">
            {`<InvestigatorFileCard${
              currentExample.compact ? " compact" : ""
            }${
              currentExample.skeleton ? "Skeleton" : ""
            }
  data={{
    name: "${currentExample.data?.name || "..."}",
    age: ${currentExample.data?.age ?? 0},
    gender: "${currentExample.data?.gender ?? "male"}",
    occupation: "${currentExample.data?.occupation ?? "..."}",
    ${currentExample.data?.portrait ? `portrait: "${currentExample.data.portrait}",` : ""}
    attributes: {
      str: ${currentExample.data?.attributes?.str ?? 0},
      con: ${currentExample.data?.attributes?.con ?? 0},
      siz: ${currentExample.data?.attributes?.siz ?? 0},
      dex: ${currentExample.data?.attributes?.dex ?? 0},
      app: ${currentExample.data?.attributes?.app ?? 0},
      int: ${currentExample.data?.attributes?.int ?? 0},
      pow: ${currentExample.data?.attributes?.pow ?? 0},
      edu: ${currentExample.data?.attributes?.edu ?? 0},
    }${currentExample.data?.hp ? `,
    hp: { current: ${currentExample.data.hp.current}, max: ${currentExample.data.hp.max} }` : ""}${
              currentExample.data?.sanity
                ? `,
    sanity: { current: ${currentExample.data.sanity.current}, max: ${currentExample.data.sanity.max} }`
                : ""
            }
  }}
/>`}
          </pre>
        </div>

        {/* Features list */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white/50 p-6 rounded-lg border-2 border-amber-200">
            <h3 className="font-bold text-amber-900 font-mono mb-3">特性</h3>
            <ul className="space-y-2 text-sm text-amber-800">
              <li>✓ 机密文件美学设计</li>
              <li>✓ 纸张质感和老化效果</li>
              <li>✓ 等宽打字机字体</li>
              <li>✓ CONFIDENTIAL/CLASSIFIED 印章</li>
              <li>✓ 响应式布局</li>
              <li>✓ 暗色模式支持</li>
              <li>✓ 可编辑模式</li>
              <li>✓ 加载骨架屏</li>
            </ul>
          </div>

          <div className="bg-white/50 p-6 rounded-lg border-2 border-amber-200">
            <h3 className="font-bold text-amber-900 font-mono mb-3">使用场景</h3>
            <ul className="space-y-2 text-sm text-amber-800">
              <li>• 角色创建界面</li>
              <li>• 游戏内角色信息查看</li>
              <li>• 角色选择界面</li>
              <li>• 角色档案管理</li>
              <li>• 打印输出角色卡</li>
              <li>• 移动端/平板适配</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-amber-700/50 font-mono text-xs">
          <p>Monika CoC 7th Edition TRPG Platform</p>
          <p className="mt-1">
            Built with React 19 + TypeScript + Tailwind CSS + shadcn/ui
          </p>
        </div>
      </div>
    </div>
  )
}
