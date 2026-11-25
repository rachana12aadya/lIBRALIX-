import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed.error) {
        readable = `Unable to ${parsed.operationType || 'complete'} data: ${parsed.error}`;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message: readable };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FFEAF2] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#FFF5F9] border border-[#F5C2D7] rounded-xl p-8">
            <h1 className="text-xl font-semibold text-[#381325]">Something went wrong</h1>
            <p className="mt-3 text-sm text-[#6D3B54] leading-relaxed">{this.state.message}</p>
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm font-semibold text-[#2B0B1B] bg-[#F49AC1] rounded-lg hover:bg-[#EC7FB0] transition-colors cursor-pointer"
              >
                Reload Workspace
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="px-4 py-2 text-sm font-medium text-[#4D1E35] bg-[#FFE0EC] border border-[#EAA3C0] rounded-lg hover:bg-[#FFD1E2] transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
