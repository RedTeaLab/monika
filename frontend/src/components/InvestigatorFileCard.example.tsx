/**
 * InvestigatorFileCard Component - Usage Examples
 *
 * This file demonstrates various ways to use the InvestigatorFileCard component
 */

import * as React from "react"
import { InvestigatorFileCard, InvestigatorFileCardSkeleton } from "./InvestigatorFileCard"
import type { InvestigatorData } from "@/types/investigator"

/**
 * Example 1: Minimal card with basic info only
 */
export function ExampleMinimal() {
  return (
    <InvestigatorFileCard
      data={{
        name: "艾丽丝·威廉姆斯",
        age: 28,
        gender: "female",
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
      }}
    />
  )
}

/**
 * Example 2: Full card with all data
 */
export function ExampleFull() {
  const data: InvestigatorData = {
    name: "亨利·卡特赖特",
    age: 35,
    gender: "male",
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
    hp: {
      current: 11,
      max: 11,
    },
    mp: {
      current: 12,
      max: 12,
    },
    sanity: {
      current: 58,
      max: 60,
    },
    luck: {
      current: 45,
      max: 50,
    },
    derived: {
      move: 8,
      build: 0,
      damageBonus: "+0",
    },
    skills: [
      { name: "侦查", value: 70 },
      { name: "图书馆使用", value: 75 },
      { name: "神秘学", value: 45 },
      { name: "心理学", value: 60 },
      { name: "手枪", value: 30 },
    ],
  }

  return <InvestigatorFileCard data={data} />
}

/**
 * Example 3: Compact view
 */
export function ExampleCompact() {
  return (
    <InvestigatorFileCard
      compact
      data={{
        name: "莎拉·康纳",
        age: 24,
        gender: "female",
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
        hp: {
          current: 9,
          max: 9,
        },
        sanity: {
          current: 55,
          max: 60,
        },
      }}
    />
  )
}

/**
 * Example 4: Editable mode
 */
export function ExampleEditable() {
  const [data, setData] = React.useState<Partial<InvestigatorData>>({
    name: "调查员",
    age: 25,
    gender: "other",
    occupation: "待定",
    attributes: {
      str: 50,
      con: 50,
      siz: 50,
      dex: 50,
      app: 50,
      int: 50,
      pow: 50,
      edu: 50,
    },
  })

  return (
    <div className="space-y-4">
      <InvestigatorFileCard
        editable
        data={data}
        onDataChange={setData}
      />
      <pre className="text-xs text-muted-foreground">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

/**
 * Example 5: Loading skeleton
 */
export function ExampleLoading() {
  return <InvestigatorFileCardSkeleton />
}

/**
 * Example 6: Multiple cards grid
 */
export function ExampleGrid() {
  const investigators = [
    {
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
    },
    {
      name: "亨利·卡特赖特",
      age: 35,
      gender: "male" as const,
      occupation: "考古学家",
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
    },
    {
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
    },
  ]

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {investigators.map((investigator, index) => (
        <InvestigatorFileCard key={index} data={investigator} />
      ))}
    </div>
  )
}

/**
 * Example 7: With custom styling
 */
export function ExampleCustomStyle() {
  return (
    <div className="p-8 bg-stone-900 min-h-screen">
      <InvestigatorFileCard
        className="scale-110"
        data={{
          name: "神秘调查员",
          age: 30,
          gender: "other",
          occupation: "神秘主义者",
          portrait: "https://i.pravatar.cc/300?img=68",
          attributes: {
            str: 40,
            con: 45,
            siz: 50,
            dex: 55,
            app: 50,
            int: 85,
            pow: 75,
            edu: 70,
          },
        }}
      />
    </div>
  )
}
