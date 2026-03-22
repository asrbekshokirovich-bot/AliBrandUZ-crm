import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  private retryCount = 0;
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_DELAY = 2500;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  public state: State = {
    hasError: false,
    error: null,
  };

  // Must return full State type (not Partial) to satisfy React types
  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);

    this.retryCount++;

    // Auto-retry up to MAX_RETRIES times with delay
    // Shows spinner so user doesn't see error during retry
    if (this.retryCount <= this.MAX_RETRIES) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        this.setState({ hasError: false, error: null });
      }, this.RETRY_DELAY);
    }
  }

  public componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  private handleRetry = () => {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryCount = 0;
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Show loading spinner while auto-retrying (not the error card)
      if (this.retryCount <= this.MAX_RETRIES) {
        return (
          <div className="min-h-[400px] flex items-center justify-center p-4">
            <div className="text-center space-y-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
            </div>
          </div>
        );
      }

      // Only show error card after all retries exhausted
      return (
        <div className="min-h-[400px] flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Xatolik yuz berdi</CardTitle>
              <CardDescription>
                Kutilmagan xatolik. Sahifani yangilang yoki bosh sahifaga qayting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {this.state.error && (
                <pre className="text-xs bg-muted p-2 rounded-md overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              )}
              <div className="flex gap-2">
                <Button onClick={this.handleRetry} className="flex-1" variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Qayta urinish
                </Button>
                <Button onClick={this.handleGoHome} className="flex-1">
                  <Home className="h-4 w-4 mr-2" />
                  Bosh sahifa
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook-based error boundary wrapper
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

// Async error boundary for Suspense
export function AsyncErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <React.Suspense
        fallback={
          <div className="min-h-[200px] flex items-center justify-center p-4">
            <LoadingSkeleton count={3} />
          </div>
        }
      >
        {children}
      </React.Suspense>
    </ErrorBoundary>
  );
}
