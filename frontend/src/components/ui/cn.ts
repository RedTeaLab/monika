/**
 * cn — conditional className composition.
 *
 * Accepts strings, numbers, arrays, and { class: condition } objects.
 * Designed for component libraries that pass className through to DOM nodes.
 *
 * Note: does NOT deduplicate conflicting Tailwind classes (no tailwind-merge dep).
 * Call sites should not pass competing variants to the same slot.
 */

type ClassValue =
  | string
  | number
  | null
  | boolean
  | undefined
  | ClassValue[]
  | { [key: string]: boolean | null | undefined }

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = []

  const walk = (v: ClassValue): void => {
    if (!v && v !== 0) return
    if (typeof v === 'string' || typeof v === 'number') {
      out.push(String(v))
      return
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
      return
    }
    if (typeof v === 'object') {
      for (const k in v) if (v[k]) out.push(k)
    }
  }

  for (const i of inputs) walk(i)
  return out.join(' ')
}
