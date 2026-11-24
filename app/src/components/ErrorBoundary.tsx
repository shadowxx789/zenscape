import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '../i18n/I18nContext'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const { t } = useI18n()

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
      color: 'var(--text)',
    }}>
      <div style={{
        maxWidth: '480px',
        background: 'rgba(233, 211, 164, 0.05)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '2.5rem',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      }}>
        <h1 style={{ color: 'var(--accent)', fontSize: '1.8rem', marginBottom: '1rem', fontWeight: 500 }}>
          {t.error.title}
        </h1>
        <p style={{ fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem', opacity: 0.85 }}>
          {t.error.body}
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="start-button"
            style={{ cursor: 'pointer', padding: '0.75rem 1.5rem', borderRadius: '8px' }}
          >
            {t.error.reload}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="ghost-action"
            style={{ cursor: 'pointer', padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }}
          >
            {t.error.resetReload}
          </button>
        </div>
        {error && (
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
            maxHeight: '150px',
          }}>
            {error.toString()}
          </pre>
        )}
      </div>
    </main>
  )
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
      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />
    }

    return this.props.children
  }
}
