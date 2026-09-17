import { useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { TransientAlert } from "./TransientAlert";

/**
 * FrozenRegion makes a piece of the interface look exactly as it does normally
 * while refusing to change anything, and says why on every attempt.
 *
 * It exists for a call that has gone to the bin. Its quality review and its
 * actions keep their whole history and come back untouched if the call is
 * restored, so greying them out or hiding them would be a lie about what
 * happened. What they must not do meanwhile is move.
 *
 * Two details are deliberate. The cursor is left alone: a `not-allowed` cursor
 * would tell people the control is broken, when it is the call that is away.
 * And the click is caught rather than the controls disabled, because a disabled
 * button swallows the click and the person would be left guessing.
 *
 * Anything that only navigates — the way out of the page above all — is marked
 * with `data-frozen-allow` and passes through.
 */
export function FrozenRegion({
  frozen,
  message,
  children,
}: {
  frozen: boolean;
  message: string;
  children: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  function allowed(target: EventTarget | null) {
    return target instanceof Element && target.closest("[data-frozen-allow]") !== null;
  }

  function intercept(event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) {
    if (!frozen || allowed(event.target)) return;
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    event.stopPropagation();
    // A fresh key on every attempt, so a second click re-announces the reason
    // instead of silently doing nothing because the alert is still up.
    setAttempt((current) => current + 1);
  }

  if (!frozen) return <>{children}</>;

  return (
    <div
      ref={containerRef}
      className="frozen-region"
      onClickCapture={intercept}
      onKeyDownCapture={intercept}
      // Screen readers get the same message the click raises.
      aria-describedby="frozen-region-reason"
    >
      <p className="frozen-region-banner" id="frozen-region-reason" role="status">
        {message}
      </p>
      {children}
      {attempt > 0 && <TransientAlert key={attempt} message={message} tone="info" />}
    </div>
  );
}
