import { useEffect, useState } from "react";

/**
 * Eased progress from 0 to 1 that restarts whenever the key changes, so a chart
 * draws itself once its data arrives and again only when the data changes.
 */
export function useDrawProgress(key: string, durationMs: number) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }
    let frameId = 0;
    let startedAt = 0;

    setProgress(0);

    const tick = (time: number) => {
      if (!startedAt) startedAt = time;
      const rawProgress = Math.min(1, (time - startedAt) / durationMs);
      setProgress(1 - Math.pow(1 - rawProgress, 3));

      if (rawProgress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [durationMs, key]);

  return progress;
}
