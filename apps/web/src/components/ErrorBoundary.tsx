import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

// Only for render bugs; request errors are handled where they happen.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="state state-error" role="alert">
          <strong>Something went wrong on this page.</strong>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
