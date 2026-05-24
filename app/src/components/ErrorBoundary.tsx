import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  private handleReset = () => {
    try {
      localStorage.clear()
    } catch {
      // ignore
    }
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <main className="home-view error-boundary-view" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100svh',
          padding: '2rem',
          textAlign: 'center',
          background: 'var(--bg)',
          color: 'var(--text)'
        }}>
          <div style={{
            maxWidth: '480px',
            background: 'rgba(233, 211, 164, 0.05)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '2.5rem',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}>
            <h1 style={{ color: 'var(--accent)', fontSize: '1.8rem', marginBottom: '1rem', fontWeight: 500 }}>
              起风了，但有些不协调
            </h1>
            <p style={{ fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem', opacity: 0.85 }}>
              运行中发生了一个错误。别担心，你可以尝试重置偏好设置并重新加载。
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                type="button"
                onClick={() => window.location.reload()}
                className="start-button"
                style={{ cursor: 'pointer', padding: '0.75rem 1.5rem', borderRadius: '8px' }}
              >
                重新加载
              </button>
              <button 
                type="button"
                onClick={this.handleReset}
                className="ghost-action"
                style={{ cursor: 'pointer', padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }}
              >
                重置并重新加载
              </button>
            </div>
            {this.state.error && (
              <pre style={{
                marginTop: '2rem',
                padding: '1rem',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                fontSize: '0.75rem',
                textAlign: 'left',
                overflowX: 'auto',
                border: '1px solid rgba(233, 211, 164, 0.08)',
                color: '#cc7a7a',
                maxHeight: '150px'
              }}>
                {this.state.error.toString()}
              </pre>
            )}
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
