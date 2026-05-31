import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { TrayPopup } from './components/TrayPopup/TrayPopup'
import { setupWailsEvents, initProject } from './store'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#d4d4dc', background: '#08090d', height: '100%', overflow: 'auto' }}>
          <h2 style={{ color: '#cd5454' }}>Render Error</h2>
          <pre style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.error?.stack || this.state.error?.message || 'Unknown error'}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

try {
  setupWailsEvents()
} catch (e) {
  document.getElementById('root')!.innerHTML = `<pre style="color:#d4d4dc;background:#08090d;padding:40px;height:100%">setupWailsEvents error: ${String(e)}\n${(e as Error).stack || ''}</pre>`
  throw e
}

const isTrayPopup = window.location.hash === '#/tray-popup'

if (isTrayPopup) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <React.StrictMode>
        <TrayPopup />
      </React.StrictMode>
    </ErrorBoundary>,
  )
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </ErrorBoundary>,
  )
  initProject()
}
