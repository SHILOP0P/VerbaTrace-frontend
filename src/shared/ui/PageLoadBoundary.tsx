import { Component, type ReactNode } from "react";

/** A failed route download leaves the shell usable and offers a fresh HTML
 * request after a deployment or a lost connection, instead of a blank page. */
export class PageLoadBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: unknown) { console.error("workspace page failed", error); }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey?: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" className="empty-panel glass">
      <h2>Не удалось открыть раздел</h2>
      <p>Проверьте соединение и обновите страницу.</p>
      <button type="button" className="primary-button" onClick={() => window.location.reload()}>Обновить страницу</button>
    </section>;
  }
}
