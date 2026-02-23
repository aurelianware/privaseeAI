import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          fontFamily: 'monospace',
          padding: '2rem',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            border: '1px solid rgba(255,60,60,0.4)',
            borderRadius: 16,
            padding: '2rem',
            background: 'rgba(255,0,0,0.04)',
            boxShadow: '0 0 40px rgba(255,0,0,0.08)',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16, textAlign: 'center' }}>⚠️</div>
          <h2 style={{ color: '#ff4444', textAlign: 'center', marginBottom: 8, fontSize: 18 }}>
            Something went wrong
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontSize: 13, marginBottom: 24 }}>
            An unexpected error occurred. Reload the page to continue.
          </p>
          <details style={{ marginBottom: 24 }}>
            <summary style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer', marginBottom: 8 }}>
              Error details
            </summary>
            <pre
              style={{
                color: 'rgba(255,100,100,0.7)',
                fontSize: 11,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 8,
                padding: '0.75rem',
              }}
            >
              {error.message}
            </pre>
          </details>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: '100%',
              padding: '10px 0',
              borderRadius: 8,
              border: '1px solid rgba(0,255,255,0.4)',
              background: 'rgba(0,255,255,0.1)',
              color: '#00ffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}
