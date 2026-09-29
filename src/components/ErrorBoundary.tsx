import { Component, type ReactNode } from 'react';
import { ErrorNotice, errorDetail } from './ErrorNotice';
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main>
        <h1>Studio could not display this view</h1>
        <ErrorNotice
          message="An application error occurred. Restart after checking any unsaved work."
          detail={errorDetail(this.state.error)}
        />
      </main>
    ) : (
      this.props.children
    );
  }
}
