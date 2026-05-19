import { DockviewDefaultTab, IDockviewDefaultTabProps } from 'dockview'

export function DefaultTab(props: IDockviewDefaultTabProps) {
  return (
    <DockviewDefaultTab
      hideClose
      {...props}
      style={{
        ...(props.style || {}),
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        padding: '0 10px',
      }}
    />
  )
}
