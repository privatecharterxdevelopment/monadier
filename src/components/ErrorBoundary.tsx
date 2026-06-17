import React from 'react';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen page-shell text-primary flex items-center justify-center p-8">
          <div className="max-w-lg glass-panel p-8">
            <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
            <p className="text-sm text-secondary mb-4">
              See the error below and the browser console (F12 → Console). If it mentions Supabase or
              env vars, fix <code className="text-primary">.env.local</code> (local) or Vercel
              environment variables (deploy).
            </p>
            <pre className="text-xs text-red-300/90 overflow-auto whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
