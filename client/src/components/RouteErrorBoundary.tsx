import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Your Five route failed to render", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="route-error" role="alert">
        <span className="page-eyebrow">PAGE DIDN'T LOAD</span>
        <h1>Let's get you back in the game.</h1>
        <p>The site may have updated while this tab was open.</p>
        <div className="action-row">
          <button className="primary" onClick={() => window.location.reload()}>Reload page</button>
          <button onClick={() => window.location.assign("/")}>Return home</button>
        </div>
      </main>
    );
  }
}
