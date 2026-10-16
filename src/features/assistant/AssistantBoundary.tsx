import { Component, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = { open: boolean; onClose: () => void; children: ReactNode };

/** A failed chat must never replace the application's navigation or page. */
export class AssistantBoundary extends Component<Props, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error("assistant view failed", error); }
  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.open && !this.props.open) this.setState({ failed: false, attempt: this.state.attempt + 1 });
  }
  render() {
    if (!this.state.failed) return <div className="assistant-boundary" key={this.state.attempt}>{this.props.children}</div>;
    if (!this.props.open) return null;
    return <section className="assistant-workspace assistant-load-error" role="alert" aria-label="Ошибка открытия чата">
      <header><strong>Не удалось открыть чат</strong><button type="button" aria-label="Закрыть сообщение об ошибке" onClick={this.props.onClose}><X size={17}/></button></header>
      <p>Попробуйте открыть чат повторно. Если ошибка сохранится, обновите страницу.</p>
      <button className="primary-button small" type="button" onClick={() => this.setState({ failed: false, attempt: this.state.attempt + 1 })}>Повторить открытие</button>
    </section>;
  }
}
