import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { buildCreditActivity, creditActivityLegend, formatActivityCredits } from "./credit-activity";
import type { ActivityValue, CreditActivityPeriod } from "./credit-activity";

const modes = { day: "За день", week: "За неделю", total: "Суммарно" };
// Matches the square and the gap in auth-app.css; a phone shows at least a
// quarter of a year, which is still a calendar and not a stripe.
const CELL_SIZE = 13, CELL_GAP = 4, WEEKS_IN_YEAR = 53, MIN_WEEKS = 13;
const descriptions = {
  day: "Каждый квадрат — расход за день. Даты списаний в UTC, не даты загрузки звонков.",
  week: "Каждый столбец — расход за календарную неделю, с понедельника. Даты в UTC.",
  total: "Каждый столбец — накопленный расход с начала показанного периода к концу недели.",
};

export const CreditActivityChart = memo(function CreditActivityChart({ activity, today = new Date().toISOString().slice(0, 10) }: { activity: readonly ActivityValue[]; today?: string }) {
  const [period, setPeriod] = useState<CreditActivityPeriod>("day");
  const [focused, setFocused] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ index: number; legend: boolean; left: number; top: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const descriptionId = useId();
  const [columnsFit, setColumnsFit] = useState(WEEKS_IN_YEAR);
  const chart = useMemo(() => buildCreditActivity(activity, period, new Date(`${today}T00:00:00Z`), columnsFit), [activity, period, today, columnsFit]);
  const lastIndex = chart.cells.reduce((last, cell, index) => cell.placeholder ? last : index, 0);

  // The calendar fits the block instead of scrolling sideways: as the block
  // narrows it shows fewer weeks, always the most recent ones, and the month
  // labels under it say which ones are on screen.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const fit = () => {
      const width = container.clientWidth;
      if (!width) return;
      setColumnsFit(Math.max(MIN_WEEKS, Math.min(WEEKS_IN_YEAR, Math.floor((width + CELL_GAP) / (CELL_SIZE + CELL_GAP)))));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);
  useEffect(() => {
    if (!tooltip) return;
    const hide = () => setTooltip(null);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => { document.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, [tooltip !== null]);

  function showTooltip(element: HTMLElement, index: number, legend = false) {
    const rect = element.getBoundingClientRect();
    setTooltip({ index, legend, left: Math.max(140, Math.min(window.innerWidth - 140, rect.left + rect.width / 2)), top: rect.top >= 48 ? rect.top - 42 : rect.bottom + 8 });
  }

  return <div className="credit-activity-block">
    <div className="credit-activity-toolbar"><strong>Активность кредитов</strong><div role="group" aria-label="Период графика">
      {(Object.keys(modes) as CreditActivityPeriod[]).map(mode => <button type="button" key={mode} className={period === mode ? "active" : ""} aria-pressed={period === mode} onClick={() => { setPeriod(mode); setFocused(null); setTooltip(null); }}>{modes[mode]}</button>)}
    </div></div>
    <p className="credit-activity-description" id={descriptionId}>{descriptions[period]}</p>
    <div className="credit-heatmap-scroll" ref={scrollRef} onMouseLeave={() => setTooltip(null)}>
      <div className="credit-heatmap-canvas" style={{ "--calendar-columns": chart.columns } as CSSProperties}>
        <div className="credit-heatmap" ref={gridRef} role="group" aria-label={`Активность кредитов: ${modes[period]}`} aria-describedby={descriptionId}>
          {chart.cells.map((cell, index) => <button type="button" key={`${period}-${index}`} className={`credit-activity-cell${cell.placeholder ? " is-placeholder" : ""}`} data-level={cell.level} data-credits={cell.credits} data-date={cell.date} disabled={cell.placeholder} tabIndex={index === (focused ?? lastIndex) ? 0 : -1}
            aria-label={`${cell.date}${cell.endDate !== cell.date ? ` — ${cell.endDate}` : ""}: ${formatActivityCredits(cell.credits)}`}
            style={{ "--wave-delay": `${Math.floor(index / 7) * 5 + index % 7 * 12}ms` } as CSSProperties}
            aria-describedby={!tooltip?.legend && tooltip?.index === index ? tooltipId : undefined}
            onMouseEnter={event => showTooltip(event.currentTarget, index)} onFocus={event => { setFocused(index); showTooltip(event.currentTarget, index); }} onBlur={() => setTooltip(null)}
            onKeyDown={event => {
              if (event.key === "Escape") { setTooltip(null); return; }
              const shift = { ArrowDown: 1, ArrowUp: -1, ArrowRight: 7, ArrowLeft: -7 }[event.key];
              if (shift === undefined) return;
              event.preventDefault();
              let next = index + shift;
              while (next >= 0 && next < chart.cells.length && chart.cells[next].placeholder) next += shift;
              if (next >= 0 && next < chart.cells.length) gridRef.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
            }} />)}
        </div>
        <div className="credit-heatmap-months">{chart.months.map((month, index) => <span key={month.column} className={index === chart.months.length - 1 ? "is-last" : ""} style={{ gridColumn: `${month.column} / ${chart.months[index + 1]?.column ?? chart.columns + 1}` }}>{month.label}</span>)}</div>
      </div>
    </div>
    <div className="credit-activity-legend" aria-label="Диапазоны расхода кредитов" onMouseLeave={() => setTooltip(null)}><span>Меньше</span>{creditActivityLegend.map((label, level) => <button type="button" className="credit-activity-cell" data-level={level} key={level} aria-label={label} aria-describedby={tooltip?.legend && tooltip.index === level ? tooltipId : undefined} onMouseEnter={event => showTooltip(event.currentTarget, level, true)} onFocus={event => showTooltip(event.currentTarget, level, true)} onBlur={() => setTooltip(null)} onKeyDown={event => { if (event.key === "Escape") setTooltip(null); }} />)}<span>Больше</span></div>
    {tooltip && createPortal(<div role="tooltip" id={tooltipId} className="credit-activity-tooltip" style={{ left: tooltip.left, top: tooltip.top }}>{tooltip.legend ? creditActivityLegend[tooltip.index] : formatActivityCredits(chart.cells[tooltip.index]?.credits ?? 0)}</div>, document.body)}
  </div>;
});
