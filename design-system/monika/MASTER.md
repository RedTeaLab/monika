# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Monika
**Updated:** 2026-07-18 (premium polish pass)
**Palette:** Neon Dark — Cinema Mobile variant
**Category:** Developer Tool / IDE

---

## Design Philosophy

Premium feel comes from **layered depth**, not flat colors. Every surface
has three layers: base fill + inner highlight (top edge light leak) +
outer shadow (ambient depth). Accents glow rather than just fill.

## Color Palette

| Role | Hex | CSS Variable | Usage |
|------|-----|-------------|-------|
| Root (near-black) | `#0d0e12` | `--surface-root` | App background — NOT pure black |
| Sidebar | `#121319` | `--surface-sidebar` | Panel chrome |
| Card | `#181a22` | `--surface-card` | Cards, inputs |
| Elevated | `#1f222c` | `--surface-elevated` | Modals, dropdowns |
| Raised | `#262936` | `--surface-raised` | Hovered items |
| **Blue accent** | `#00b4ff` | `--accent` | Primary CTA, focus, links |
| **Green** | `#00ff88` | `--color-success` | Confirm, connected |
| **Yellow** | `#ffb347` | `--color-warning` | Caution, pending |
| **Peach** | `#f8ad77` | `--color-accent-alt` | Warm alternative |
| **Red** | `#ff4757` | `--color-error` | Delete, error |

### Anti-pattern: Pure Black
Never use `#000000`. OLED displays smear pure black, destroying depth
perception. Use `#0d0e12` (near-black with blue undertone) instead.

## Layered Shadow System

```
--shadow-xs:  0 1px 2px rgba(0,0,0,0.4)
--shadow-sm:  0 2px 4px + 0 1px 2px (two layers)
--shadow-md:  0 4px 8px + 0 2px 4px
--shadow-lg:  0 8px 16px + 0 4px 8px
--shadow-xl:  0 16px 32px + 0 8px 16px
```

### Inner Highlights
Every raised surface gets a top-edge light leak:
```
--inner-highlight:        inset 0 1px 0 rgba(255,255,255,0.04)
--inner-highlight-strong: inset 0 1px 0 rgba(255,255,255,0.08)
```

### Accent Glows
Primary CTAs and active states emit a soft halo:
```
--glow-accent-sm: 0 0 0 1px rgba(0,180,255,0.20), 0 2px 8px rgba(0,180,255,0.15)
--glow-accent-md: 0 0 0 1px rgba(0,180,255,0.30), 0 4px 16px rgba(0,180,255,0.25)
```

## Typography

- **Sans:** Inter (UI text)
- **Mono:** Maple Mono NF (code)
- **Mood:** dark, cinematic, technical, precision, premium

## Animation — Premium Easing

All transitions use **expo.out** (`cubic-bezier(0.16, 1, 0.3, 1)`):
fast start, gentle settle. This is the signature "premium" feel.

| Token | Duration | Use |
|-------|----------|-----|
| `--duration-instant` | 100ms | Color-only changes |
| `--duration-fast` | 150ms | Hover, focus |
| `--duration-normal` | 220ms | Panel reveals, toggles |
| `--duration-slow` | 320ms | Modal, dropdown |

### Press Feedback
All interactive elements scale to **0.97** on press, using spring easing
(`cubic-bezier(0.34, 1.56, 0.64, 1)`) for a subtle overshoot.

### Reduced Motion
All animations respect `prefers-reduced-motion: reduce`.

---

## Component Polish Checklist

- [ ] Buttons: press scale 0.97 + glow on primary
- [ ] Inputs: inner highlight + focus glow ring
- [ ] Cards: inner highlight + hover lift (-translate-y-px)
- [ ] Dropdowns: glassmorphism (backdrop-blur) + layered shadow
- [ ] Tabs: glow indicator with shadow halo
- [ ] Switch: track glow when checked + spring thumb
- [ ] All transitions use `--ease-out` (expo.out)
- [ ] No pure black backgrounds
- [ ] No flat single-layer shadows

## Anti-Patterns

- ❌ Pure black `#000000` (OLED smear)
- ❌ Single-layer shadows (flat, plastic feel)
- ❌ Linear/ease timing (mechanical, not organic)
- ❌ Color-only hover states (no depth change)
- ❌ No press feedback (feels dead)
- ❌ Emojis as icons
- ❌ Hardcoded hex colors (use tokens)
