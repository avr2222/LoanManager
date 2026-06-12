import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 max-w-md w-full text-center">
            <p className="text-lg font-semibold text-slate-800">Something went wrong</p>
            <p className="text-sm text-slate-500 mt-2 break-words">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-5 py-2.5 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
