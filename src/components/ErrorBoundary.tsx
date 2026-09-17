import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  constructor(props: Props) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught UI error:', error, errorInfo);
    (this as any).setState({ errorInfo });
  }

  private handleReload = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('_v', Date.now().toString());
      window.location.href = url.toString();
    } catch {
      window.location.reload();
    }
  };

  private handleResetToHome = () => {
    window.location.hash = '';
    (this as any).setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto text-amber-400 border border-amber-500/20">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold font-display tracking-tight text-slate-100">
                Application Error
              </h2>
              <p className="text-slate-400 text-sm">
                An unexpected interface issue occurred. You can safely reload the application to restore state.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-950/80 p-4 rounded-xl text-left border border-slate-800/80 overflow-auto max-h-40">
                <p className="text-xs font-mono text-rose-400 font-semibold mb-1">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[10px] font-mono text-slate-500 leading-tight whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack.slice(0, 300)}
                  </pre>
                )}
              </div>
            )}

            <div className="space-y-2.5">
              <button
                onClick={this.handleReload}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all shadow-lg shadow-emerald-900/30 cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
                Reload Application
              </button>
              <button
                onClick={this.handleResetToHome}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-all cursor-pointer"
              >
                Return to Main Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
