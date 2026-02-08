# Responsive Layout Design

**Date**: 2025-02-08
**Tasks**: M1-109, M1-110, M1-111, M1-112
**Status**: Design Approved

---

## Overview

Implement responsive layout for the Monika game console, supporting desktop (≥1024px), tablet (768-1023px), and mobile (<768px) form factors with full touch optimization.

---

## Breakpoint Strategy

Using Tailwind CSS default breakpoints:

| Breakpoint | Size | Layout Mode | Interaction |
|------------|------|-------------|-------------|
| `lg` | ≥1024px | Three-column desktop | Full feature access |
| `md` | 768-1023px | Tab-based | Full feature access |
| `<md` | <768px | Single-column read-only | Observer mode |

---

## Layout Architecture

```
GameConsole (h-screen, flex-col)
├── Header (fixed height)
├── MainContent (flex-1, flex)
│   ├── Desktop (≥lg): Horizontal layout
│   │   ├── MessageList + Footer (flex-1)
│   │   ├── StatePanel (fixed width)
│   │   └── RulesPanel (conditional, w-80)
│   ├── Tablet (md-<lg): Tab navigation
│   │   └── TabView (current tab content)
│   │       ├── Tab1: MessageList + Footer
│   │       ├── Tab2: StatePanel (full width)
│   │       └── Tab3: RulesPanel
│   └── Mobile (<md): Observer mode
│       └── MessageList (Footer shows prompt)
└── BottomTabBar (md-<lg only)
```

---

## Components

### New Components

1. **TabView** (`frontend/src/components/TabView.tsx`)
   - Manages tab switching state
   - Renders active tab content
   - Passes `fullWidth` prop to StatePanel

2. **BottomTabBar** (`frontend/src/components/BottomTabBar.tsx`)
   - Navigation bar with 3 tabs
   - Min touch target: 56×56px
   - Icons: MessageSquare, HeartPulse, BookOpen
   - Hidden on desktop, visible on tablet

3. **MobileFooter** (`frontend/src/components/MobileFooter.tsx`)
   - Observer mode prompt
   - "Continue on desktop" CTA button
   - Replaces Footer on mobile

4. **TouchOptimizer** (`frontend/src/hooks/useTouchOptimizer.ts`)
   - Prevents double-tap zoom
   - Disables text selection (except inputs)
   - Haptic feedback utility

5. **useGestures** (`frontend/src/hooks/useGestures.ts`)
   - Pull-to-refresh gesture
   - Swipe between tabs

### Modified Components

1. **GameConsole** - Add breakpoint detection and conditional rendering
2. **StatePanel** - Add `fullWidth` prop for tablet layout
3. **Header** - Ensure responsive sizing

---

## Touch Optimization

### Button Sizing (WCAG 2.5.5)

| Element | Min Size | Tailwind |
|---------|----------|----------|
| Button | 44×44px | `min-h-11 min-w-11` |
| Icon button | 48×48px | `h-12 w-12` |
| Tab item | 56×56px | `min-h-14` |
| Clickable card | 12px padding | `p-3` |

### Gestures

- **Pull-to-refresh**: Reload messages on drag down
- **Swipe navigation**: Switch between tabs with horizontal swipe
- **Haptic feedback**: Vibrate on interactions (10-40ms)

### Prevention

- Disable double-tap zoom
- Prevent long-press context menu (except inputs)
- Safe area padding for iOS

---

## Data Flow

```typescript
// GameConsole state
const [activeTab, setActiveTab] = useState('messages')
const [isMobile, setIsMobile] = useState(false)
const [isTablet, setIsTablet] = useState(false)

// Breakpoint detection
useEffect(() => {
  const updateBreakpoint = () => {
    setIsMobile(window.innerWidth < 768)
    setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024)
  }
  updateBreakpoint()
  window.addEventListener('resize', updateBreakpoint)
  return () => window.removeEventListener('resize', updateBreakpoint)
}, [])
```

### Component Communication

- GameConsole owns all state (messages, combat, chase, tabs)
- Props flow down to child components
- BottomTabBar calls `setActiveTab` to switch views
- No additional state management needed

---

## Mobile Observer Mode

Mobile users can view all content but cannot interact:

```tsx
{isMobile ? (
  <>
    <MessageList messages={messages} />
    <MobileFooter />
  </>
) : isTablet ? (
  <TabView activeTab={activeTab} onChange={setActiveTab} />
) : (
  // Desktop layout...
)}
```

MobileFooter displays:
- "Mobile is observer mode" message
- "Continue on desktop" button

---

## Error Handling

### ResponsiveErrorBoundary

Catches layout errors and provides recovery:

```tsx
<ResponsiveErrorBoundary>
  <GameConsole />
</ResponsiveErrorBoundary>
```

Fallback UI offers page reload option.

---

## Testing Strategy

| Type | Tool | Coverage |
|------|------|----------|
| Unit | Vitest | Hook logic, breakpoint calculation |
| Visual | Playwright | Screenshot regression per breakpoint |
| Touch | Device Simulator | iOS/Android emulation |
| E2E | Playwright | Tab switching, gestures, orientation |

---

## Implementation Tasks

| ID | Task | Estimate |
|----|------|----------|
| M1-109 | Implement desktop layout (≥1024px) | 4h |
| M1-110 | Implement tablet layout (768-1023px) | 4h |
| M1-111 | Implement mobile read-only (<768px) | 4h |
| M1-112 | Touch optimization | 2h |

---

## Dependencies

- `@use-gesture/react` - Gesture handling
- Existing components: Header, MessageList, StatePanel, Footer
- Tailwind CSS (already configured)

---

## Acceptance Criteria

- [ ] Layout adapts to lg/md/sm breakpoints
- [ ] Tablet uses bottom tab navigation
- [ ] Mobile shows observer mode prompt
- [ ] All touch targets ≥44×44px
- [ ] Pull-to-refresh works on tablet
- [ ] Swipe switches tabs
- [ ] Safe areas respected on iOS
- [ ] Visual tests pass for all breakpoints

---

## Notes

- Use CSS container queries if needed for complex components
- Consider adding landscape mode optimization for tablets
- Haptic feedback should respect user's vibration settings
