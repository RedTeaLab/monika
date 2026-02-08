# Responsive Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement responsive layout for GameConsole supporting desktop (≥1024px), tablet (768-1023px), and mobile (<768px) with touch optimization.

**Architecture:**
- Use Tailwind CSS breakpoints (sm: 640px, md: 768px, lg: 1024px, xl: 1280px)
- GameConsole detects breakpoint and conditionally renders appropriate layout
- Tablet uses bottom tab navigation (TabView + BottomTabBar)
- Mobile shows observer mode with prompt to switch to desktop
- Touch optimization includes gesture support and haptic feedback

**Tech Stack:**
- React 19 with TypeScript
- Tailwind CSS (already configured)
- @use-gesture/react for gesture handling
- Lucide React for icons

---

## Task 1: Create useBreakpoint Hook

**Files:**
- Create: `frontend/src/hooks/useBreakpoint.ts`
- Test: `frontend/src/hooks/__tests__/useBreakwind.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/hooks/__tests__/useBreakpoint.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { useBreakpoint } from '../useBreakwind'

describe('useBreakpoint', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1200)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns correct breakpoint for desktop', () => {
    vi.stubGlobal('innerWidth', 1200)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toEqual({
      isMobile: false,
      isTablet: false,
      isDesktop: true
    })
  })

  it('returns correct breakpoint for tablet', () => {
    vi.stubGlobal('innerWidth', 900)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toEqual({
      isMobile: false,
      isTablet: true,
      isDesktop: false
    })
  })

  it('returns correct breakpoint for mobile', () => {
    vi.stubGlobal('innerWidth', 600)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toEqual({
      isMobile: true,
      isTablet: false,
      isDesktop: false
    })
  })

  it('updates on window resize', () => {
    const { result } = renderHook(() => useBreakpoint())

    act(() => {
      vi.stubGlobal('innerWidth', 800)
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.isTablet).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npm test useBreakpoint`
Expected: FAIL with "useBreakpoint not found"

**Step 3: Write minimal implementation**

Create `frontend/src/hooks/useBreakpoint.ts`:

```typescript
import { useState, useEffect } from 'react'

export interface BreakpointResult {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

const BREAKPOINTS = {
  mobile: 768,
  desktop: 1024
}

export function useBreakpoint(): BreakpointResult {
  const [breakpoint, setBreakpoint] = useState<BreakpointResult>(() => {
    const width = window.innerWidth
    return {
      isMobile: width < BREAKPOINTS.mobile,
      isTablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.desktop,
      isDesktop: width >= BREAKPOINTS.desktop
    }
  })

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      setBreakpoint({
        isMobile: width < BREAKPOINTS.mobile,
        isTablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.desktop,
        isDesktop: width >= BREAKPOINTS.desktop
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return breakpoint
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npm test useBreakpoint`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add frontend/src/hooks/useBreakpoint.ts frontend/src/hooks/__tests__/useBreakpoint.test.ts
git commit -m "feat(M1-109): add useBreakpoint hook for responsive layout"
```

---

## Task 2: Create TabView Component

**Files:**
- Create: `frontend/src/components/TabView.tsx`
- Modify: `frontend/src/components/StatePanel.tsx` (add fullWidth prop)

**Step 1: Create TabView component**

Create `frontend/src/components/TabView.tsx`:

```typescript
import { useState } from 'react'
import { MessageList } from '@/components/MessageList'
import { StatePanel } from '@/components/StatePanel'
import { RuleSearch } from '@/components/rules/RuleSearch'
import { Footer } from '@/components/Footer'
import type { Message } from '@/components/GameConsole'

interface TabViewProps {
  messages: Message[]
  onSendMessage: (content: string) => void
  character: {
    id: number
    name: string
    hp: number
    maxHp: number
    mp: number
    maxMp: number
    san: number
    maxSan: number
    luck: number
  }
}

type TabId = 'messages' | 'state' | 'rules'

interface Tab {
  id: TabId
  label: string
  icon: string
}

const TABS: Tab[] = [
  { id: 'messages', label: '消息', icon: '💬' },
  { id: 'state', label: '状态', icon: '❤️' },
  { id: 'rules', label: '规则', icon: '📖' }
]

export function TabView({ messages, onSendMessage, character }: TabViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('messages')

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">
        {activeTab === 'messages' && (
          <div className="flex flex-col h-full">
            <MessageList messages={messages} />
          </div>
        )}
        {activeTab === 'state' && (
          <div className="h-full overflow-y-auto">
            <StatePanel {...character} fullWidth />
          </div>
        )}
        {activeTab === 'rules' && (
          <div className="h-full overflow-y-auto p-4">
            <RuleSearch />
          </div>
        )}
      </div>
      {activeTab === 'messages' && (
        <Footer onSendMessage={onSendMessage} />
      )}
    </div>
  )
}

export { TABS }
export type { TabId }
```

**Step 2: Update StatePanel to accept fullWidth prop**

Modify `frontend/src/components/StatePanel.tsx`:

```typescript
// Add fullWidth prop to interface
interface StatePanelProps {
  // ... existing props
  fullWidth?: boolean
}

// Update the container div className
export function StatePanel({ ..., fullWidth = false }: StatePanelProps) {
  return (
    <div className={fullWidth ? "w-full" : "w-64"}>
      {/* existing content */}
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/TabView.tsx frontend/src/components/StatePanel.tsx
git commit -m "feat(M1-110): add TabView component for tablet layout"
```

---

## Task 3: Create BottomTabBar Component

**Files:**
- Create: `frontend/src/components/BottomTabBar.tsx`

**Step 1: Create BottomTabBar component**

Create `frontend/src/components/BottomTabBar.tsx`:

```typescript
import { MessageSquare, HeartPulse, BookOpen } from 'lucide-react'
import type { TabId, TABS } from './TabView'

interface BottomTabBarProps {
  activeTab: TabId
  onChange: (tabId: TabId) => void
}

const tabConfig = [
  { id: 'messages' as const, label: '消息', icon: MessageSquare },
  { id: 'state' as const, label: '状态', icon: HeartPulse },
  { id: 'rules' as const, label: '规则', icon: BookOpen },
]

export function BottomTabBar({ activeTab, onChange }: BottomTabBarProps) {
  return (
    <nav className="md:lg:hidden flex border-t bg-background safe-area-bottom">
      {tabConfig.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              flex-1 flex flex-col items-center justify-center py-3 min-h-[56px]
              transition-colors duration-200
              ${isActive ? 'text-primary bg-primary/5' : 'text-muted-foreground'}
            `}
            aria-label={tab.label}
            aria-selected={isActive}
            role="tab"
          >
            <Icon className="h-6 w-6" />
            <span className="text-xs mt-1">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
```

**Step 2: Add safe-area-bottom utility to Tailwind config**

Check if `frontend/tailwind.config.ts` has theme.extend:

```typescript
// Add to theme.extend if not exists
theme: {
  extend: {
    // ... existing extends
    spacing: {
      'safe-area-bottom': 'env(safe-area-inset-bottom)',
    }
  }
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/BottomTabBar.tsx frontend/tailwind.config.ts
git commit -m "feat(M1-110): add BottomTabBar component with 56px min touch target"
```

---

## Task 4: Create MobileFooter Component

**Files:**
- Create: `frontend/src/components/MobileFooter.tsx`

**Step 1: Create MobileFooter component**

Create `frontend/src/components/MobileFooter.tsx`:

```typescript
import { Button } from '@/components/ui/button'
import { Monitor } from 'lucide-react'

export function MobileFooter() {
  return (
    <div className="border-t bg-muted/30 p-4 text-center">
      <p className="text-sm text-muted-foreground mb-3">
        移动端为观察者模式
      </p>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => {
          // Could show a modal or redirect
          alert('请在桌面端浏览器继续游戏以获得完整体验')
        }}
      >
        <Monitor className="h-4 w-4" />
        请在桌面端继续游戏
      </Button>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/MobileFooter.tsx
git commit -m "feat(M1-111): add MobileFooter component for observer mode"
```

---

## Task 5: Update GameConsole with Responsive Layout

**Files:**
- Modify: `frontend/src/components/GameConsole.tsx`

**Step 1: Update GameConsole imports**

Add to imports:

```typescript
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { TabView } from '@/components/TabView'
import { BottomTabBar } from '@/components/BottomTabBar'
import { MobileFooter } from '@/components/MobileFooter'
import { useState, useCallback, useEffect } from "react"
```

**Step 2: Add breakpoint and tab state**

Add after existing state declarations:

```typescript
// Responsive breakpoint detection
const { isMobile, isTablet, isDesktop } = useBreakpoint()

// Tab state for tablet layout
const [activeTab, setActiveTab] = useState<'messages' | 'state' | 'rules'>('messages')
```

**Step 3: Update main content rendering**

Replace the main content area (around line 388-433):

```typescript
<div className="flex-1 flex overflow-hidden">
  {isMobile ? (
    // Mobile: Observer mode
    <>
      <div className="flex-1 flex flex-col min-w-0">
        <MessageList messages={messages} />
      </div>
      <StatePanel
        character={{
          id: 1,
          name: user?.username || "调查员",
          hp: character.hp,
          maxHp: character.hpMax,
          mp: character.mp,
          maxMp: character.mpMax,
          san: character.san,
          maxSan: character.sanMax,
          luck: character.luck,
        }}
      />
      <MobileFooter />
    </>
  ) : isTablet ? (
    // Tablet: Tab navigation
    <TabView
      messages={messages}
      onSendMessage={handleSendMessage}
      character={{
        id: 1,
        name: user?.username || "调查员",
        hp: character.hp,
        maxHp: character.hpMax,
        mp: character.mp,
        maxMp: character.mpMax,
        san: character.san,
        maxSan: character.sanMax,
        luck: character.luck,
      }}
    />
  ) : (
    // Desktop: Original three-column layout
    <>
      <div className="flex-1 flex flex-col min-w-0">
        <MessageList messages={messages} />
        <Footer onSendMessage={handleSendMessage} />
      </div>
      <StatePanel
        character={{
          id: 1,
          name: user?.username || "调查员",
          hp: character.hp,
          maxHp: character.hpMax,
          mp: character.mp,
          maxMp: character.mpMax,
          san: character.san,
          maxSan: character.sanMax,
          luck: character.luck,
        }}
      />
      {showRules && (
        <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Rules</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRules(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <RuleSearch />
            <div className="text-xs text-gray-500 mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="font-medium mb-1">Quick Tips:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Search for rules like "pushing", "sanity"</li>
                <li>Click results to see full details</li>
                <li>Use keywords like "combat", "chase"</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  )}
</div>
```

**Step 4: Add BottomTabBar for tablet**

Add before the closing `</div>` of GameConsole (after the Chase Overlay section):

```typescript
{isTablet && (
  <BottomTabBar
    activeTab={activeTab}
    onChange={setActiveTab}
  />
)}
```

**Step 5: Update TabView to be controlled**

Update `frontend/src/components/TabView.tsx` to accept activeTab and onChange as props:

```typescript
interface TabViewProps {
  messages: Message[]
  onSendMessage: (content: string) => void
  character: { /* ... */ }
  activeTab: TabId
  onChange: (tabId: TabId) => void
}

export function TabView({ messages, onSendMessage, character, activeTab, onChange }: TabViewProps) {
  // Remove internal useState, use props instead
  // ... rest of component
}
```

**Step 6: Commit**

```bash
git add frontend/src/components/GameConsole.tsx frontend/src/components/TabView.tsx
git commit -m "feat(M1-109~111): integrate responsive layout into GameConsole"
```

---

## Task 6: Install Gesture Library

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install @use-gesture/react**

Run: `cd frontend && npm install @use-gesture/react`

**Step 2: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat(M1-112): install @use-gesture/react for touch gestures"
```

---

## Task 7: Create useTouchOptimizer Hook

**Files:**
- Create: `frontend/src/hooks/useTouchOptimizer.ts`

**Step 1: Create touch optimizer hook**

Create `frontend/src/hooks/useTouchOptimizer.ts`:

```typescript
import { useEffect } from 'react'

export function useTouchOptimizer() {
  useEffect(() => {
    // Prevent double-tap zoom
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }

    // Prevent context menu on long press (except inputs)
    const handleContextMenu = (e: Event) => {
      const target = e.target as HTMLElement
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault()
      }
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: false })
    document.addEventListener('contextmenu', handleContextMenu)

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])
}

/**
 * Haptic feedback utility
 */
export function hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light') {
  if ('vibrate' in navigator) {
    const duration = { light: 10, medium: 20, heavy: 40 }[type]
    navigator.vibrate(duration)
  }
}
```

**Step 2: Commit**

```bash
git add frontend/src/hooks/useTouchOptimizer.ts
git commit -m "feat(M1-112): add useTouchOptimizer hook with haptic feedback"
```

---

## Task 8: Create useGestures Hook

**Files:**
- Create: `frontend/src/hooks/useGestures.ts`

**Step 1: Create gestures hook**

Create `frontend/src/hooks/useGestures.ts`:

```typescript
import { useDrag } from '@use-gesture/react'
import { useRef, useCallback } from 'react'

export function usePullToRefresh(onRefresh: () => void) {
  const ref = useRef<HTMLDivElement>(null)

  const bind = useDrag(({ down, movement: [, my] }) => {
    if (!ref.current) return

    const threshold = 80

    if (!down) {
      ref.current.style.transform = ''
      if (my > threshold) {
        onRefresh()
      }
      return
    }

    // Visual feedback with resistance
    const translateY = Math.min(my * 0.5, 120)
    ref.current.style.transform = `translateY(${translateY}px)`
  })

  return { ref, bind }
}

export function useSwipeToSwipe(onSwipe: (direction: 'left' | 'right') => void) {
  const bind = useDrag(({ swipe: [swipeX] }) => {
    if (swipeX < 0) {
      onSwipe('left')
    } else if (swipeX > 0) {
      onSwipe('right')
    }
  })

  return bind
}
```

**Step 2: Commit**

```bash
git add frontend/src/hooks/useGestures.ts
git commit -m "feat(M1-112): add gesture hooks for pull-to-refresh and swipe"
```

---

## Task 9: Integrate Touch Optimization

**Files:**
- Modify: `frontend/src/components/GameConsole.tsx`
- Modify: `frontend/src/components/BottomTabBar.tsx`

**Step 1: Add touch optimizer to GameConsole**

Add to GameConsole:

```typescript
import { useTouchOptimizer, hapticFeedback } from '@/hooks/useTouchOptimizer'
import { useSwipeToSwipe } from '@/hooks/useGestures'

// In GameConsole component:
useTouchOptimizer()

// Add haptic feedback to tab changes
useEffect(() => {
  hapticFeedback('light')
}, [activeTab])

// Add swipe gesture for tablet tab switching
const swipeBind = useSwipeToSwipe((direction) => {
  if (!isTablet) return

  const tabs = ['messages', 'state', 'rules'] as const
  const currentIndex = tabs.indexOf(activeTab)

  if (direction === 'left' && currentIndex < tabs.length - 1) {
    setActiveTab(tabs[currentIndex + 1])
    hapticFeedback('light')
  } else if (direction === 'right' && currentIndex > 0) {
    setActiveTab(tabs[currentIndex - 1])
    hapticFeedback('light')
  }
})
```

**Step 2: Apply swipe binding to content area**

Wrap the main content div with the swipe binding:

```typescript
<div {...swipeBind()} className="flex-1 flex overflow-hidden">
  {/* existing content */}
</div>
```

**Step 3: Add haptic feedback to BottomTabBar**

Update `frontend/src/components/BottomTabBar.tsx`:

```typescript
import { hapticFeedback } from '@/hooks/useTouchOptimizer'

// In onClick handler:
onClick={() => {
  hapticFeedback('light')
  onChange(tab.id)
}}
```

**Step 4: Commit**

```bash
git add frontend/src/components/GameConsole.tsx frontend/src/components/BottomTabBar.tsx
git commit -m "feat(M1-112): integrate touch optimization with gestures and haptics"
```

---

## Task 10: Add Responsive Utilities

**Files:**
- Create: `frontend/src/utils/responsive.ts`

**Step 1: Create responsive utility functions**

Create `frontend/src/utils/responsive.ts`:

```typescript
/**
 * Check if device supports touch
 */
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

/**
 * Get safe area inset for iOS
 */
export function getSafeAreaInset(): {
  top: string
  right: string
  bottom: string
  left: string
} {
  return {
    top: 'env(safe-area-inset-top)',
    right: 'env(safe-area-inset-right)',
    bottom: 'env(safe-area-inset-bottom)',
    left: 'env(safe-area-inset-left)',
  }
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
```

**Step 2: Commit**

```bash
git add frontend/src/utils/responsive.ts
git commit -m "feat(M1-112): add responsive utility functions"
```

---

## Task 11: Update Tailwind Config

**Files:**
- Modify: `frontend/tailwind.config.ts`

**Step 1: Add touch-friendly utilities**

Add to `tailwind.config.ts` theme.extend:

```typescript
theme: {
  extend: {
    // ... existing extends
    spacing: {
      'safe-area-bottom': 'env(safe-area-inset-bottom)',
      'safe-area-top': 'env(safe-area-inset-top)',
    },
    minWidth: {
      'touch': '44px',  // WCAG 2.5.5 minimum touch target
    },
    minHeight: {
      'touch': '44px',
    },
  }
}
```

**Step 2: Commit**

```bash
git add frontend/tailwind.config.ts
git commit -m "feat(M1-112): add touch-friendly spacing utilities to Tailwind"
```

---

## Task 12: Visual Testing and Manual Verification

**Files:**
- Create: `docs/plans/2025-02-08-responsive-layout-testing.md`

**Step 1: Create testing checklist**

Create `docs/plans/2025-02-08-responsive-layout-testing.md`:

```markdown
# Responsive Layout Testing Checklist

## Desktop (≥1024px)

- [ ] Three-column layout visible
- [ ] MessageList + Footer on left
- [ ] StatePanel on right
- [ ] Rules panel toggles correctly
- [ ] All interactions work

## Tablet (768-1023px)

- [ ] Bottom tab bar visible
- [ ] Tab switching works
- [ ] Active tab highlighted
- [ ] StatePanel takes full width
- [ ] Swipe gestures work between tabs
- [ ] Haptic feedback on tab change
- [ ] Footer only shows on messages tab

## Mobile (<768px)

- [ ] Single column layout
- [ ] MobileFooter shows observer message
- [ ] "Continue on desktop" button shows alert
- [ ] StatePanel visible below messages
- [ ] No interactive elements blocked

## Touch Targets

- [ ] All buttons ≥44×44px
- [ ] Tab items ≥56×56px
- [ ] Icon buttons ≥48×48px

## Gestures

- [ ] Pull-to-refresh works on tablet
- [ ] Swipe left/right switches tabs
- [ ] Double-tap zoom prevented
- [ ] Long-press context menu prevented (except inputs)

## iOS Safe Areas

- [ ] Content not hidden by notch
- [ ] Bottom tab bar above home indicator
- [ ] No horizontal scrolling
```

**Step 2: Manual testing in browser**

1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Test each breakpoint:
   - Responsive: 375×667 (iPhone SE)
   - Tablet: 768×1024 (iPad)
   - Desktop: 1280×720

**Step 3: Commit testing documentation**

```bash
git add docs/plans/2025-02-08-responsive-layout-testing.md
git commit -m "docs(M1-109~112): add responsive layout testing checklist"
```

---

## Task 13: Update Documentation

**Files:**
- Modify: `docs/tasks/02-m1-single-player-web.md`
- Modify: `CLAUDE.md`

**Step 1: Mark tasks as complete**

Update `docs/tasks/02-m1-single-player-web.md`:

```markdown
| M1-109 | [x] 实现桌面端布局 (1200px+) | [x] |
| M1-110 | [x] 实现平板端布局 (768px-1199px) | [x] |
| M1-111 | [x] 实现移动端只读模式 (<768px) | [x] |
| M1-112 | [x] 触控操作优化 | [x] |
```

Also update acceptance criteria:

```markdown
- [x] 响应式布局 (桌面 + 平板)
```

**Step 2: Update CLAUDE.md with responsive components**

Add to frontend components section:

```markdown
- **TabView**: Tab navigation for tablet layout
- **BottomTabBar**: Bottom navigation with 56px touch targets
- **MobileFooter**: Observer mode prompt for mobile
- **useBreakpoint**: Custom hook for breakpoint detection
- **useTouchOptimizer**: Touch optimization and haptic feedback
- **useGestures**: Gesture handling with @use-gesture/react
```

**Step 3: Commit**

```bash
git add docs/tasks/02-m1-single-player-web.md CLAUDE.md
git commit -m "docs(M1-109~112): mark responsive layout tasks as complete"
```

---

## Final Verification

**Step 1: Run type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors

**Step 2: Build production bundle**

```bash
cd frontend && npm run build
```

Expected: Build succeeds

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(M1-109~112): complete responsive layout implementation

- Desktop: Three-column layout with MessageList, StatePanel, Rules
- Tablet: Bottom tab navigation with gesture support
- Mobile: Observer mode with desktop prompt
- Touch: 44px minimum targets, haptic feedback, gestures
- Gestures: Pull-to-refresh, swipe to switch tabs
- Safe areas: iOS notch and home indicator support"
```

---

## Summary

**Tasks Completed:** 13
**New Components:** 4 (TabView, BottomTabBar, MobileFooter, TabView)
**New Hooks:** 4 (useBreakpoint, useTouchOptimizer, useGestures)
**Modified Components:** 3 (GameConsole, StatePanel, BottomTabBar)
**Testing:** Manual checklist for all breakpoints

**Total Estimated Time:** ~14 hours
