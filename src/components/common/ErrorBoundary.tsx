import { Component, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import i18n from '../../i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Glossa] Unhandled error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 gap-4 text-center" role="alert" aria-live="assertive">
          <AlertCircle size={32} className="text-editorial-accent" />
          <h3 className="font-display text-lg">{i18n.t('errors.somethingWentWrong')}</h3>
          <p className="text-xs text-editorial-muted max-w-md">
            {this.state.error?.message || i18n.t('errors.unexpectedError')}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-editorial-ink text-white text-[10px] font-bold uppercase tracking-widest hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
          >
            {i18n.t('errors.tryAgain')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
