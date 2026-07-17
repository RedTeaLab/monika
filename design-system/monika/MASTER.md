# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Monika
**Updated:** 2026-07-18
**Palette:** Neon Dark
**Category:** Developer Tool / IDE

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable | Usage |
|------|-----|-------------|-------|
| Black (base) | `#0c0c0c` | `--surface-root` | App background |
| Gray dark | `#1f252d` | `--surface-card` | Cards, inputs |
| Gray mid | `#6b7280` | `--text-dim` | Dim text, borders |
| **Blue** | `#00b4ff` | `--accent` | Primary CTA, links, focus |
| **Green** | `#00ff88` | `--color-success` | Confirm, connected, pass |
| **Yellow** | `#ffb347` | `--color-warning` | Caution, pending |
| **Peach** | `#f8ad77` | `--color-accent-alt` | Warm alternative accent |
| **Red** | `#ff4757` | `--color-error` | Delete, fail, disconnect |

### Surface Hierarchy (dark-only)

```
#0c0c0c  ── root background
#14171d  ── sidebar / panel chrome
#1f252d  ── cards, inputs, dropdowns
#252b35  ── modals, elevated surfaces
```

### Typography

- **Heading Font:** Inter
- **Body Font:** Inter
- **Mono Font:** Maple Mono NF
- **Mood:** vibrant, technical, high-contrast, neon-accented, developer-focused

### Spacing Scale

`4 / 8 / 16 / 24 / 32 / 48 / 64` (px, mapped to `--sp-xs` through `--sp-3xl`)

---

## Component Specs

### Buttons

```css
/* Primary */
.btn-primary {
  background: #00b4ff;
  color: #0c0c0c;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
.btn-primary:hover { background: #33c3ff; }

/* Destructive */
.btn-destructive {
  background: #ff4757;
  color: #fff;
}
.btn-destructive:hover { background: #ff6b7a; }
```

### Cards

```css
.card {
  background: #1f252d;
  border: 1px solid rgba(107, 114, 128, 0.12);
  border-radius: 8px;
  padding: 16px;
}
```

### Inputs

```css
.input {
  background: #1f252d;
  border: 1px solid rgba(107, 114, 128, 0.20);
  color: #e8eaed;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
}
.input:focus {
  border-color: #00b4ff;
  box-shadow: 0 0 0 2px rgba(0, 180, 255, 0.15);
}
```

---

## Style Guidelines

**Style:** Neon Dark

**Keywords:** deep black, neon accents, high contrast, vibrant, technical, developer, OLED-friendly

**Key Effects:** Blue glow on focus, smooth 150-300ms transitions, visible depth via subtle surface layers

---

## Anti-Patterns (Do NOT Use)

- ❌ Light mode
- ❌ Emojis as icons — use Lucide SVG icons
- ❌ Hardcoded hex colors — use CSS variables
- ❌ Instant state changes — always transition 150-300ms
- ❌ Invisible focus states — `:focus-visible` must show accent ring
- ❌ Missing `cursor-pointer` on clickable elements
- ❌ Tailwind color utility classes (`text-green-400`) — use `var(--green)` etc.

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use Lucide SVG instead)
- [ ] All colors use CSS variables, not raw hex or Tailwind utilities
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] `:focus-visible` shows accent ring for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Text contrast ≥ 4.5:1 against surface backgrounds
