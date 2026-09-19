import { useEffect, useLayoutEffect, useState } from "react";

/**
 * Keeps the window's scroll position of a page across a browser reload. The
 * browser restores it itself only when the page is already tall enough, and a
 * page that loads its data first is not, so the position is put back once the
 * page says its content is ready.
 */
export function useReloadScrollRestoration(key: string, ready: boolean) {
  const storageKey = `verbatrace:scroll-y:${key}`;
  const [restoreY] = useState(() => {
    try {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (navigation?.type !== "reload") return null;
      const saved = Number(sessionStorage.getItem(storageKey));
      return Number.isFinite(saved) && saved > 0 ? saved : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const save = () => {
      try {
        sessionStorage.setItem(storageKey, String(Math.max(0, window.scrollY)));
      } catch {
        // Storage may be unavailable; the position is a convenience only.
      }
    };
    // Arriving at the page from another one starts a new position; the one to
    // restore after a reload was already read above.
    save();
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save);
    };
  }, [storageKey]);

  useLayoutEffect(() => {
    if (!ready || restoreY === null) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => window.scrollTo({ top: restoreY, behavior: "auto" }));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [ready, restoreY]);
}
