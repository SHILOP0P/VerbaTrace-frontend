import type { CSSProperties } from "react";
import { useDrawProgress } from "../lib/use-draw-progress";
import { formatScore } from "../lib/analysis";

const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// A 270° arc with the gap at the bottom reads as a meter, not as a pie.
const ARC = CIRCUMFERENCE * 0.75;

export type ScoreTone = "good" | "warning" | "danger" | "none";

// The same thresholds as scoreTone everywhere else: 75 and 50.
export function gaugeTone(value: number | null): ScoreTone {
  if (value === null) return "none";
  return value >= 75 ? "good" : value >= 50 ? "warning" : "danger";
}

/**
 * The one visual model for a 0–100 score: the overview average and the call
 * score use it alike. The arc fills and the number counts up once per value.
 */
export function ScoreGauge({
  value,
  size = 160,
  caption = "из 100",
  loading = false,
  label
}: {
  value: number | null;
  size?: number;
  caption?: string;
  loading?: boolean;
  label?: string;
}) {
  const progress = useDrawProgress(loading ? "loading" : String(value), 900);
  const tone = gaugeTone(value);
  const clamped = value === null ? 0 : Math.max(0, Math.min(100, value));
  const drawn = (ARC * clamped) / 100 * (loading ? 0 : progress);
  const shown = value === null ? null : Number.isInteger(value) ? Math.round(value * progress) : Math.round(value * progress * 10) / 10;
  const ariaLabel = label ?? (value === null ? "Оценки нет" : `Оценка ${formatScore(value)} из 100`);

  return (
    <div className={`score-gauge tone-${tone}${loading ? " is-loading" : ""}`} style={{ width: size, height: size, "--gauge-size": `${size}px` } as CSSProperties} role="img" aria-label={loading ? "Оценка загружается" : ariaLabel}>
      <svg viewBox="0 0 220 220" width={size} height={size} aria-hidden="true">
        <circle className="score-gauge-track" cx="110" cy="110" r={RADIUS} strokeDasharray={`${ARC} ${CIRCUMFERENCE}`} transform="rotate(135 110 110)" />
        {value !== null && !loading && <circle className="score-gauge-value" cx="110" cy="110" r={RADIUS} strokeDasharray={`${drawn} ${CIRCUMFERENCE}`} transform="rotate(135 110 110)" />}
        <line className="score-gauge-tick" x1="110" y1="12" x2="110" y2="4" />
        <line className="score-gauge-tick" x1="200.5" y1="72.5" x2="207.9" y2="69.4" />
      </svg>
      <span className="score-gauge-center" aria-hidden="true">
        {loading ? <span className="skeleton-line score-gauge-skeleton" /> : <strong>{shown === null ? "—" : formatScore(shown)}</strong>}
        {!loading && caption && <small>{caption}</small>}
      </span>
    </div>
  );
}
