import { memo } from "react";
import type { CSSProperties } from "react";

// Animate just the SVG stroke. No frame-by-frame React state updates or
// rerenders of the calendar, wallet history and the rest of the dashboard.
export const CreditLimitRing = memo(function CreditLimitRing({ percent }: { percent: number }) {
  const remaining = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null;
  return <div className="credit-limit-ring" role="img" aria-label={remaining === null ? "Остаток лимита неизвестен" : `Осталось ${Math.round(remaining)}% лимита за период подписки`}>
    <svg viewBox="0 0 112 112" aria-hidden="true" focusable="false">
      <circle className="credit-ring-track" cx="56" cy="56" r="49" />
      <circle className="credit-ring-value" cx="56" cy="56" r="49" pathLength="100" strokeDasharray="100" style={{ "--credit-ring-offset": 100 - (remaining ?? 0) } as CSSProperties} />
    </svg>
    <strong aria-hidden="true">{remaining === null ? "—" : `${Math.round(remaining)}%`}</strong>
    <span aria-hidden="true">осталось</span>
  </div>;
});
