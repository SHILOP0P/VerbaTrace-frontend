export type CreditActivityPeriod = "day" | "week" | "total";
export type ActivityValue = { date: string; credits: number };
export type ActivityCell = ActivityValue & { endDate: string; placeholder: boolean; level: number };
const DAY = 86_400_000;
const creditPlural = new Intl.PluralRules("ru-RU");

export function formatActivityCredits(value: number) {
  const unit = creditPlural.select(value);
  return `${value.toLocaleString("ru-RU")} ${unit === "one" ? "кредит" : unit === "few" ? "кредита" : "кредитов"}`;
}

// The dashboard API aggregates settlement dates in UTC, not upload dates.
export function creditActivityRange(now = new Date()) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { from: new Date(end - 364 * DAY).toISOString().slice(0, 10), to: new Date(end).toISOString().slice(0, 10) };
}

// Colour encodes an absolute spend, independently of the visible maximum.
// The same boundaries drive the legend and all three chart modes.
export const CREDIT_COLOUR_BOUNDS = [5_000, 15_000, 30_000, 50_000, 80_000] as const;
export const creditActivityLegend = ["0 кредитов", ...CREDIT_COLOUR_BOUNDS.map((upper, index) =>
  `${(index === 0 ? 1 : CREDIT_COLOUR_BOUNDS[index - 1] + 1).toLocaleString("ru-RU")}–${formatActivityCredits(upper)}`), `Больше ${formatActivityCredits(CREDIT_COLOUR_BOUNDS.at(-1)!)}`];

export function creditActivityLevel(credits: number) {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  return 1 + CREDIT_COLOUR_BOUNDS.filter(threshold => credits > threshold).length;
}

/**
 * Builds the calendar. `maxColumns` is how many weeks the block has room for:
 * a narrow screen shows fewer weeks, ending today, instead of hiding the rest
 * behind a sideways scroll nobody notices.
 */
export function buildCreditActivity(source: readonly ActivityValue[], period: CreditActivityPeriod, now = new Date(), maxColumns = Number.POSITIVE_INFINITY) {
  const range = creditActivityRange(now);
  const start = Date.parse(`${range.from}T00:00:00Z`);
  const leading = (new Date(start).getUTCDay() + 6) % 7;
  const byDate = new Map<string, number>();
  for (const item of source) {
    const date = item.date.slice(0, 10);
    if (date < range.from || date > range.to || !Number.isFinite(item.credits) || item.credits < 0) continue;
    byDate.set(date, (byDate.get(date) ?? 0) + item.credits);
  }
  const columns = Math.ceil((365 + leading) / 7);
  const daily: ActivityCell[] = Array.from({ length: columns * 7 }, (_, index) => {
    const offset = index - leading;
    const date = new Date(start + offset * DAY).toISOString().slice(0, 10);
    return { date, endDate: date, credits: byDate.get(date) ?? 0, placeholder: offset < 0 || offset >= 365, level: 0 };
  });
  const weeks = Array.from({ length: columns }, (_, column) => {
    const days = daily.slice(column * 7, column * 7 + 7).filter(day => !day.placeholder);
    return { date: days[0].date, endDate: days.at(-1)!.date, credits: days.reduce((sum, day) => sum + day.credits, 0) };
  });
  let running = 0;
  const totals = weeks.map(week => { running += week.credits; return { ...week, credits: running }; });
  const series = period === "day" ? daily : period === "week" ? weeks : totals;
  const maximum = Math.max(0, ...series.map(item => item.credits));
  const baseline = period === "day" ? 100_000 : period === "week" ? 500_000 : 1_000_000;
  const scaleMaximum = Math.max(baseline, maximum);
  const cells = period === "day"
    ? daily.map(day => ({ ...day, level: day.placeholder ? 0 : creditActivityLevel(day.credits) }))
    : (period === "week" ? weeks : totals).flatMap(week => {
      const height = Math.ceil(7 * week.credits / scaleMaximum);
      return Array.from({ length: 7 }, (_, row) => ({
        ...week, placeholder: false,
        level: row >= 7 - height ? creditActivityLevel(week.credits) : 0,
      }));
    });
  const months: Array<{ label: string; column: number }> = [];
  let previousMonth = "";
  for (let index = 0; index < daily.length; index++) {
    const day = daily[index];
    if (day.placeholder || day.date.slice(0, 7) === previousMonth) continue;
    previousMonth = day.date.slice(0, 7);
    const column = Math.floor(index / 7) + 1;
    const label = new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "UTC" }).format(new Date(`${day.date}T00:00:00Z`));
    // Avoid overlapping labels for the partial first month.
    if (months.length && column - months.at(-1)!.column < 3) months.pop();
    months.push({ label, column });
  }

  const visibleColumns = Math.max(1, Math.min(columns, Math.floor(maxColumns)));
  if (visibleColumns === columns) return { cells, months, columns, maximum, range };

  // The oldest weeks go first; the calendar always ends on today.
  const dropped = columns - visibleColumns;
  const visibleCells = cells.slice(dropped * 7);
  const visibleMonths = months.filter(month => month.column > dropped).map(month => ({ ...month, column: month.column - dropped }));
  // The first visible column starts inside a month whose label was cut away;
  // it is named again only when the next label is far enough not to collide.
  const firstDay = daily[dropped * 7];
  if (firstDay && (visibleMonths[0]?.column ?? Number.POSITIVE_INFINITY) >= 3) {
    const label = new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "UTC" }).format(new Date(`${firstDay.date}T00:00:00Z`));
    visibleMonths.unshift({ label, column: 1 });
  }
  return {
    cells: visibleCells,
    months: visibleMonths,
    columns: visibleColumns,
    maximum,
    range: { from: visibleCells[0]?.date ?? range.from, to: range.to },
  };
}
