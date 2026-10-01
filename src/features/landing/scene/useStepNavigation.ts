import { useEffect, useRef } from "react";

type Options = {
  /** Failed/disabled WebGL leaves an ordinary scrollable landing. */
  enabled?: boolean;
  stepCount: number;
  step: number;
  /** A camera flight is in progress: every input is ignored until it lands. */
  locked: boolean;
  onStep: (next: number) => void;
};

/**
 * Step navigation for the 3D block: one wheel tick, key press or swipe moves
 * the camera to the next scene, nothing happens during the flight, and after
 * the last scene the page is handed back to the browser. Scrolling back to the
 * top of the page captures the block again on its last scene.
 */
export function useStepNavigation({ enabled = true, stepCount, step, locked, onStep }: Options) {
  const state = useRef({ captured: true, accumulated: 0, cooldownUntil: 0, touchY: 0, step, locked, stepCount, onStep });
  state.current.step = step;
  state.current.locked = locked;
  state.current.stepCount = stepCount;
  state.current.onStep = onStep;

  useEffect(() => {
    if (!enabled) {
      state.current.captured = false;
      state.current.accumulated = 0;
      return;
    }
    const WHEEL_THRESHOLD = 60;
    const SWIPE_THRESHOLD = 48;
    // Trackpads keep sending momentum after a step; it must not become a second one.
    const COOLDOWN_MS = 700;
    const RECAPTURE_COOLDOWN_MS = 500;
    const current = state.current;
    const now = () => performance.now();
    const atTop = () => window.scrollY <= 1;
    current.captured = atTop();

    const busy = () => current.locked || now() < current.cooldownUntil;

    /** Returns what happened: a step, a release to the page, or nothing. */
    const attempt = (direction: 1 | -1): "stepped" | "release" | "ignored" => {
      if (busy()) return "ignored";
      const next = current.step + direction;
      if (next < 0) return "ignored";
      if (next >= current.stepCount) return "release";
      current.cooldownUntil = now() + COOLDOWN_MS;
      current.accumulated = 0;
      current.onStep(next);
      return "stepped";
    };

    const release = () => {
      current.captured = false;
      current.accumulated = 0;
      // Leave the office in one deliberate scroll. A native wheel delta can
      // otherwise stop a few pixels below it and expose an empty story gutter.
      document.querySelector(".landing-story")?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"
      });
    };

    const onWheel = (event: WheelEvent) => {
      if (!current.captured) return;
      const lastStep = current.step === current.stepCount - 1;
      if (event.deltaY > 0 && lastStep && !busy()) {
        event.preventDefault();
        release();
        return;
      }
      event.preventDefault();
      if (busy()) {
        current.accumulated = 0;
        return;
      }
      current.accumulated += event.deltaY;
      if (Math.abs(current.accumulated) < WHEEL_THRESHOLD) return;
      const result = attempt(current.accumulated > 0 ? 1 : -1);
      current.accumulated = 0;
      if (result === "release") release();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!current.captured || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
        const result = attempt(1);
        if (result === "release") {
          event.preventDefault();
          release();
          return;
        }
        event.preventDefault();
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        attempt(-1);
        event.preventDefault();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      current.touchY = event.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!current.captured) return;
      const y = event.touches[0]?.clientY ?? current.touchY;
      const delta = current.touchY - y;
      const lastStep = current.step === current.stepCount - 1;
      if (delta > 0 && lastStep && !busy()) {
        event.preventDefault();
        release();
        return;
      }
      event.preventDefault();
      if (Math.abs(delta) < SWIPE_THRESHOLD) return;
      current.touchY = y;
      const result = attempt(delta > 0 ? 1 : -1);
      if (result === "release") release();
    };

    const onScroll = () => {
      if (current.captured) {
        // Focus changes and residual wheel momentum must not uncover the next
        // section while one of the office scenes still owns the viewport.
        if (!atTop()) window.scrollTo({ top: 0, behavior: "instant" });
        return;
      }
      if (!atTop()) return;
      current.captured = true;
      current.accumulated = 0;
      current.cooldownUntil = now() + RECAPTURE_COOLDOWN_MS;
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, [enabled]);
}
