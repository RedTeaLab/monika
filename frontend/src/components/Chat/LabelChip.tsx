export interface LabelRegion {
  type: 'command' | 'file' | 'paste'
  label: string
  start: number
  end: number
}

export default function LabelChip({ type, children }: { type: LabelRegion['type']; children: React.ReactNode }) {
  return (
    <span
      className="select-none"
      style={{
        background: 'var(--bg-elevated)',
        outline: '1px solid var(--border)',
        color: 'var(--text-primary)',
        borderRadius: 'var(--radius-md, 6px)',
        display: 'inline',
        whiteSpace: 'nowrap',
        fontSize: 'inherit',
        lineHeight: 'inherit',
        fontFamily: 'inherit',
        padding: '0 4px',
        margin: '0 -4px',
      }}
    >
      {children}
    </span>
  )
}

/** Parse raw text and find label-able regions */
export function findLabels(text: string): LabelRegion[] {
  const regions: LabelRegion[] = []

  // 1. Commands at line start: /command-name
  const cmdRe = /^\/([\w][\w-]*)(?:\s|$)/gm
  let m: RegExpExecArray | null
  while ((m = cmdRe.exec(text)) !== null) {
    regions.push({ type: 'command', label: m[1], start: m.index, end: m.index + m[0].length })
  }

  // 2. @ file paths (contains / or \ or has extension)
  const atRe = /@(\S+?)(?:\s|$)/g
  while ((m = atRe.exec(text)) !== null) {
    const raw = m[1]
    const name = raw.replace(/^.*[/\\]/, '')
    // Only treat as file if it looks like a path
    if (raw.includes('/') || raw.includes('\\') || /\.[a-zA-Z0-9]{1,8}$/.test(raw)) {
      regions.push({ type: 'file', label: name, start: m.index, end: m.index + m[0].length })
    }
  }

  // 3. Paste markers: [Paste N]
  const pasteRe = /\[Paste (\d+)\]/g
  while ((m = pasteRe.exec(text)) !== null) {
    regions.push({ type: 'paste', label: `Paste ${m[1]}`, start: m.index, end: m.index + m[0].length })
  }

  // 4. File markers: [filename.ext] or [filename.ext START~END] or [path/to/file.ext START~END]
  const fileRe = /\[([^\]]+?\.\w{1,8}(?:\s+\d+~\d+)?)\]/g
  while ((m = fileRe.exec(text)) !== null) {
    regions.push({ type: 'file', label: m[1], start: m.index, end: m.index + m[0].length })
  }

  // Sort by start position and remove overlaps
  regions.sort((a, b) => a.start - b.start)
  const filtered: LabelRegion[] = []
  for (const r of regions) {
    if (filtered.length === 0 || r.start >= filtered[filtered.length - 1].end) {
      filtered.push(r)
    }
  }

  return filtered
}

/** Split text into segments — plain text vs label chips */
export function segmentText(text: string, labels: LabelRegion[]) {
  if (!text) return []
  if (labels.length === 0) return [{ text, type: 'text' as const }]

  const segments: Array<{ type: 'text' | 'label'; text?: string; labelRegion?: LabelRegion }> = []
  let lastEnd = 0

  for (const label of labels) {
    if (label.start > lastEnd) {
      segments.push({ type: 'text', text: text.slice(lastEnd, label.start) })
    }
    segments.push({ type: 'label', labelRegion: label })
    lastEnd = label.end
  }

  if (lastEnd < text.length) {
    segments.push({ type: 'text', text: text.slice(lastEnd) })
  }

  return segments
}
