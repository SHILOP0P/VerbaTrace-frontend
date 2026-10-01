import { Component, type ReactNode } from "react";

/**
 * Keeps a failure inside the 3D scene from taking the page with it. The
 * landing must always show something: a broken canvas, a missing model or a
 * browser without WebGL falls back to the flat first screen.
 */
export class SceneErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError?: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("landing scene failed", error);
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
