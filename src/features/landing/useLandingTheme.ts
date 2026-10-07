import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";

type Transition = { finished: Promise<void>; skipTransition(): void };
type TransitionDocument = Document & { startViewTransition?: (callback: () => void) => Transition };
const key = "verbatrace.theme.v1";

export function useLandingTheme(reduced: boolean) {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem(key) ?? localStorage.getItem("verbatrace.concept.theme.v2");
      if (saved === "light" || saved === "dark") return saved;
    } catch { /* The preview also works when storage is unavailable. */ }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const running = useRef<Transition | null>(null);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem(key, theme); } catch { /* The theme also works without storage. */ }
  }, [theme]);

  function toggleTheme(event: MouseEvent<HTMLButtonElement>) {
    const root = document.documentElement;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const apply = () => flushSync(() => setTheme(current => {
      const next = current === "light" ? "dark" : "light";
      try { localStorage.setItem(key, next); } catch { /* State remains usable. */ }
      return next;
    }));
    const doc = document as TransitionDocument;
    running.current?.skipTransition();
    if (reduced || !doc.startViewTransition) { apply(); window.dispatchEvent(new Event("landing-theme-ready")); return; }
    root.style.setProperty("--theme-reveal-x", `${x}px`);
    root.style.setProperty("--theme-reveal-y", `${y}px`);
    root.style.setProperty("--theme-reveal-radius", `${radius}px`);
    root.classList.add("theme-reveal-running");
    const transition = doc.startViewTransition(apply);
    running.current = transition;
    void transition.finished.catch(() => undefined).finally(() => {
      if (running.current !== transition) return;
      running.current = null;
      root.classList.remove("theme-reveal-running");
      window.dispatchEvent(new Event("landing-theme-ready"));
      ["x", "y", "radius"].forEach(name => root.style.removeProperty(`--theme-reveal-${name}`));
    });
  }

  return { theme, toggleTheme };
}
