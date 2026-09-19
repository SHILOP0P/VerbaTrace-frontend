import type { CreditDashboardResponse } from "../../types";

// The limit runs for 30 days from the day the subscription started, not for a
// calendar month, so the elapsed part of the period is counted the same way.
const creditPeriodDays = 30;

/** A straight-line forecast from the spending so far in the current period. */
export function creditForecast(data: CreditDashboardResponse) {
  const used = Math.max(0, data.allowance_credits - data.allowance_remaining);
  const reset = new Date(data.resets_at);
  const start = new Date(reset.getTime() - creditPeriodDays * 86_400_000);
  const elapsed = Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86_400_000));
  const daily = Math.round(used / elapsed);
  const atReset = Math.max(0, data.allowance_remaining - daily * Math.max(0, data.days_until_reset));
  const daysLeft = daily > 0 ? Math.floor(data.allowance_remaining / daily) : Number.POSITIVE_INFINITY;
  const lastsUntilReset = !Number.isFinite(daysLeft) || daysLeft > data.days_until_reset;
  const depletion = lastsUntilReset ? "до сброса" : `${daysLeft} дн.`;
  return { used, daily, atReset, daysLeft, lastsUntilReset, depletion };
}
