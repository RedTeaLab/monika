/**
 * Combat UI Components
 *
 * This module exports all combat-related UI components for the Monika frontend.
 * These components provide a complete combat interface for CoC 7e gameplay.
 */

// Main overlay component
export { CombatOverlay } from './CombatOverlay'

// Turn and initiative components
export { InitiativeList } from './InitiativeList'

// Action components
export { CombatActionPanel } from './CombatActionPanel'
export { AttackDialog } from './AttackDialog'

// Combatant display
export { CombatantCard } from './CombatantCard'

// Combat log
export { CombatLogPanel } from './CombatLogPanel'

// Damage display
export { DamageNumber, DamageNumberContainer } from './DamageNumber'

// Target selection
export { TargetSelector } from './TargetSelector'
export type { TargetInfo } from './TargetSelector'
