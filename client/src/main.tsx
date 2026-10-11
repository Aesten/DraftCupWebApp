import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import App from '@/App'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    const { error } = this.state
    if (error) {
      return (
        <div style={{ background: '#0c0b09', color: '#c8a24a', fontFamily: 'monospace', padding: '2rem', minHeight: '100vh' }}>
          <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8f8570' }}>
            Runtime error
          </div>
          <pre style={{ color: '#d06a62', whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
            {error.message}
            {'\n\n'}
            {error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)