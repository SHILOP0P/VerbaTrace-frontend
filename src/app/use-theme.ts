import { cssStyle } from "../shared/lib/css-styles";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  AppTheme,
  getSystemTheme,
  readThemePreference,
  THEME_KEY,
  ThemePreference,
  ThemeToggleEvent,
  ViewTransitionDocument
} from "./runtime";

/** Keeps system-theme tracking and the optional circular transition out of the app composition root. */
export function useTheme() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readThemePreference());
  const [systemTheme, setSystemTheme] = useState<AppTheme>(() => getSystemTheme());
  const theme = themePreference === "system" ? systemTheme : themePreference;
  const running = useRef<ReturnType<NonNullable<ViewTransitionDocument["startViewTransition"]>> | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light");

    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    cssStyle(document.documentElement).colorScheme = theme;
  }, [theme]);

  function toggleTheme(event: ThemeToggleEvent) {
    const rect = event.currentTarget.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    const radius = Math.hypot(
      Math.max(originX, window.innerWidth - originX),
      Math.max(originY, window.innerHeight - originY)
    );
    const root = document.documentElement;
    const transitionDocument = document as ViewTransitionDocument;

    cssStyle(root).setProperty("--theme-reveal-x", `${originX}px`);
    cssStyle(root).setProperty("--theme-reveal-y", `${originY}px`);
    cssStyle(root).setProperty("--theme-reveal-radius", `${radius}px`);

    const applyTheme = () => {
      flushSync(() => {
        setThemePreference((current) => {
          const currentTheme = current === "system" ? systemTheme : current;
          const nextTheme: AppTheme = currentTheme === "dark" ? "light" : "dark";
          localStorage.setItem(THEME_KEY, nextTheme);
          return nextTheme;
        });
      });
    };

    running.current?.skipTransition();
    if (!transitionDocument.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applyTheme();
      return;
    }

    root.classList.add("theme-reveal-running");
    const transition = transitionDocument.startViewTransition(applyTheme);
    running.current = transition;
    void transition.finished.catch(() => undefined).finally(() => {
      if (running.current !== transition) return;
      running.current = null;
      root.classList.remove("theme-reveal-running");
      cssStyle(root).removeProperty("--theme-reveal-x");
      cssStyle(root).removeProperty("--theme-reveal-y");
      cssStyle(root).removeProperty("--theme-reveal-radius");
    });
  }

  return { theme, toggleTheme };
}
