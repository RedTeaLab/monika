import { useEffect, useRef } from 'react'
import { IDockviewPanelHeaderProps } from 'dockview'

export function SessionTab(_props: IDockviewPanelHeaderProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current?.closest('.dv-tabs-and-actions-container') as HTMLElement | null
    if (el) {
      el.style.display = 'none'
      return () => { el.style.display = '' }
    }
  }, [])

  return <div ref={ref} style={{ display: 'none' }} />
}
