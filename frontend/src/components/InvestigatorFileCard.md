# InvestigatorFileCard Component

A React component for displaying Call of Cthulhu 7th Edition investigator (character) information with a classified file card aesthetic.

## Features

- **Authentic file card design**: Simulates confidential government documents with paper texture, aging effects, and classification stamps
- **Typewriter aesthetic**: Uses monospace fonts and typewriter styling
- **Responsive layout**: Single-column vertical layout with portrait on left, data on right
- **Editable mode**: Optional edit mode for character creation/customization
- **Skeleton loading**: Built-in loading skeleton
- **Theme support**: Works with light/dark mode
- **Accessible**: Proper ARIA labels and semantic HTML

## Installation

The component is already part of the Monika project. Import it from the components index:

```tsx
import { InvestigatorFileCard } from "@/components"
```

## Basic Usage

```tsx
import { InvestigatorFileCard } from "@/components"

function App() {
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
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `Partial<InvestigatorData>` | `undefined` | Investigator data to display |
| `className` | `string` | `undefined` | Additional CSS classes |
| `compact` | `boolean` | `false` | Show compact view without derived stats |
| `editable` | `boolean` | `false` | Enable edit mode |
| `onDataChange` | `(data: Partial<InvestigatorData>) => void` | `undefined` | Callback when data changes (editable mode) |

## Data Structure

```tsx
interface InvestigatorData {
  // Basic Info
  name: string
  age: number
  gender: "male" | "female" | "other"
  occupation: string
  portrait?: string  // URL or base64
  birthYear?: number
  nationality?: string
  residence?: string

  // Attributes
  attributes: {
    str: number  // Strength
    con: number  // Constitution
    siz: number  // Size
    dex: number  // Dexterity
    app: number  // Appearance
    int: number  // Intelligence
    pow: number  // Power
    edu: number  // Education
  }

  // Optional Stats
  hp?: { current: number; max: number }
  mp?: { current: number; max: number }
  sanity?: { current: number; max: number }
  luck?: { current: number; max: number }

  // Derived Stats
  derived?: {
    move: number
    build: number
    damageBonus: string
  }

  // Skills
  skills?: Array<{ name: string; value: number }>
}
```

## Examples

### With Portrait

```tsx
<InvestigatorFileCard
  data={{
    name: "亨利·卡特赖特",
    age: 35,
    gender: "male",
    occupation: "考古学家",
    portrait: "https://i.pravatar.cc/300?img=12",
    attributes: { str: 60, con: 55, siz: 60, dex: 50, app: 40, int: 80, pow: 60, edu: 85 },
  }}
/>
```

### With HP/MP/SAN Display

```tsx
<InvestigatorFileCard
  data={{
    name: "莎拉·康纳",
    age: 24,
    gender: "female",
    occupation: "新闻记者",
    attributes: { str: 45, con: 50, siz: 45, dex: 65, app: 70, int: 75, pow: 55, edu: 70 },
    hp: { current: 9, max: 9 },
    mp: { current: 10, max: 10 },
    sanity: { current: 55, max: 60 },
  }}
/>
```

### Editable Mode

```tsx
import { useState } from "react"

function EditableInvestigator() {
  const [data, setData] = useState({
    name: "调查员",
    age: 25,
    gender: "other" as const,
    occupation: "待定",
    attributes: { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50 },
  })

  return <InvestigatorFileCard editable data={data} onDataChange={setData} />
}
```

### Loading Skeleton

```tsx
import { InvestigatorFileCardSkeleton } from "@/components"

function LoadingState() {
  return <InvestigatorFileCardSkeleton />
}
```

### Grid Layout

```tsx
function InvestigatorGrid({ investigators }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {investigators.map((investigator, index) => (
        <InvestigatorFileCard key={index} data={investigator} />
      ))}
    </div>
  )
}
```

## Styling

The component uses Tailwind CSS classes and includes:

### Paper Texture
- `repeating-linear-gradient` for lined paper effect
- Radial gradients for aging/stain effects
- Amber/stone color palette

### Typography
- `font-mono` for typewriter effect
- Various opacity levels for aged text
- Text shadows for stamped text effect

### Visual Effects
- Binding holes (left side)
- Photo corner markers
- Classification stamps (CONFIDENTIAL, CLASSIFIED)
- Coffee stain overlay
- Dashed separators

## Customization

### Custom Styling

```tsx
<InvestigatorFileCard
  className="scale-110"
  data={data}
/>
```

### Custom Background

```tsx
<div className="p-8 bg-stone-900">
  <InvestigatorFileCard data={data} />
</div>
```

## Dependencies

- `@/components/ui/card` - shadcn/ui Card component
- `@/components/ui/badge` - shadcn/ui Badge component
- `@/components/ui/separator` - shadcn/ui Separator component
- `@/components/ui/avatar` - shadcn/ui Avatar component
- `@/components/ui/input` - shadcn/ui Input component
- `@/lib/utils` - Utility functions
- Tailwind CSS - Styling

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## File Structure

```
frontend/src/
├── components/
│   ├── InvestigatorFileCard.tsx          # Main component
│   ├── InvestigatorFileCard.example.tsx   # Usage examples
│   ├── index.ts                          # Component exports
│   └── ui/
│       ├── avatar.tsx                     # Avatar component
│       ├── badge.tsx                      # Badge component
│       ├── card.tsx                       # Card component
│       ├── input.tsx                       # Input component
│       └── separator.tsx                   # Separator component
├── types/
│   └── investigator.ts                    # Type definitions
└── index.css                             # Global styles + animations
```

## License

MIT License - Part of the Monika project
