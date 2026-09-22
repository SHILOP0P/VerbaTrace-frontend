import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCreditActivity, creditActivityLevel, creditActivityRange, formatActivityCredits } from "../src/features/tariffs/credit-activity.ts";

const now = new Date("2026-09-03T12:00:00Z");
test("small first spend leaves headroom; growing weekly and total usage grows bars", () => {
  for (const mode of ["day", "week", "total"] as const) {
    const small = buildCreditActivity([{ date: "2026-09-02", credits: 5000 }], mode, now);
    assert.equal(Math.max(...small.cells.map(c => c.level)), 1);
  }
  const source = [{ date: "2026-08-16", credits: 5000 }, { date: "2026-08-23", credits: 200000 }, { date: "2026-08-30", credits: 500000 }];
  for (const mode of ["week", "total"] as const) {
    const chart = buildCreditActivity(source, mode, now);
    const heights = ["2026-08-10", "2026-08-17", "2026-08-24"].map(date => chart.cells.filter(c => c.date === date && c.level > 0).length);
    assert.ok(heights[0] < heights[1] && heights[1] < heights[2]);
  }
});
test("tooltip contains only the credit count with Russian plural forms", () => {
  assert.equal(formatActivityCredits(1), "1 кредит");
  assert.equal(formatActivityCredits(22), "22 кредита");
  assert.equal(formatActivityCredits(100), "100 кредитов");
});
test("one spend yesterday does not highlight today in daily mode", () => {
  const chart = buildCreditActivity([{ date: "2026-09-02", credits: 100 }], "day", now);
  assert.equal(chart.cells.filter(cell => cell.level > 0).length, 1);
  assert.equal(chart.cells.find(cell => cell.date === "2026-09-03")?.credits, 0);
  assert.equal(chart.cells.filter(cell => !cell.placeholder).length, 365);
  assert.equal(chart.cells.length % 7, 0);
  assert.equal(chart.months.at(-1)?.label, "сент.");
});
test("weekly columns aggregate Monday to Sunday, totals accumulate by week", () => {
  const source = [{ date: "2026-08-23", credits: 20 }, { date: "2026-08-24", credits: 10 }, { date: "2026-08-26", credits: 30 }];
  const weekly = buildCreditActivity(source, "week", now);
  const totals = buildCreditActivity(source, "total", now);
  assert.equal(weekly.cells.find(cell => cell.date === "2026-08-24")?.credits, 40);
  assert.equal(weekly.cells.at(-1)?.credits, 0);
  assert.equal(totals.cells.at(-1)?.credits, 60);
  assert.equal(totals.cells.slice(-7).filter(cell => cell.level > 0).length, 1);
  assert.notDeepEqual(weekly.cells.map(c => c.level), totals.cells.map(c => c.level));
});
test("six positive colour levels and a separate zero level", () => {
  assert.deepEqual([5000, 15000, 30000, 50000, 80000, 100000].map(value => creditActivityLevel(value)), [1, 2, 3, 4, 5, 6]);
  assert.equal(creditActivityLevel(0), 0);
  assert.equal(creditActivityLevel(1), 1);
  for (const boundary of [5000, 15000, 30000, 50000, 80000]) assert.equal(creditActivityLevel(boundary + 1), creditActivityLevel(boundary) + 1);
});
test("colour is not rescaled by another day's spend or by chart mode", () => {
  const source = [{ date: "2026-09-02", credits: 5000 }];
  const withOutlier = [...source, { date: "2026-08-01", credits: 9000000 }];
  assert.equal(buildCreditActivity(withOutlier, "day", now).cells.find(c => c.date === "2026-09-02")?.level, 1);
  for (const mode of ["day", "week", "total"] as const) assert.equal(Math.max(...buildCreditActivity(source, mode, now).cells.map(c => c.level)), 1);
});
test("empty data stays empty in every mode, duplicates sum, future data is excluded", () => {
  for (const mode of ["day", "week", "total"] as const) assert.ok(buildCreditActivity([], mode, now).cells.every(c => c.level === 0));
  const chart = buildCreditActivity([{ date: "2026-09-02", credits: 10 }, { date: "2026-09-02", credits: 15 }, { date: "2026-09-04", credits: 99 }], "day", now);
  assert.equal(chart.cells.find(c => c.date === "2026-09-02")?.credits, 25);
  assert.equal(chart.maximum, 25);
});
test("a narrow block shows fewer weeks, ending today, instead of scrolling", () => {
  const source = [{ date: "2026-09-02", credits: 5000 }, { date: "2025-10-06", credits: 7000 }];
  const full = buildCreditActivity(source, "day", now);
  const narrow = buildCreditActivity(source, "day", now, 18);
  assert.equal(narrow.columns, 18);
  assert.equal(narrow.cells.length, 18 * 7);
  // The last day is the same in both: the calendar is cut from the old end.
  assert.equal(narrow.cells.at(-1)?.date, full.cells.at(-1)?.date);
  assert.equal(narrow.cells.find(cell => cell.date === "2026-09-02")?.credits, 5000);
  assert.equal(narrow.cells.some(cell => cell.date === "2025-10-06"), false);
  assert.ok(narrow.months.length > 0 && narrow.months.every(month => month.column >= 1 && month.column <= 18));
  for (let index = 1; index < narrow.months.length; index++) {
    assert.ok(narrow.months[index].column > narrow.months[index - 1].column);
  }
  // A limit wider than the year changes nothing.
  assert.equal(buildCreditActivity(source, "day", now, 999).columns, full.columns);
});
test("weekly and total modes keep whole columns when the block is narrow", () => {
  const source = [{ date: "2026-08-23", credits: 20 }, { date: "2026-08-26", credits: 30 }];
  for (const mode of ["week", "total"] as const) {
    const narrow = buildCreditActivity(source, mode, now, 10);
    assert.equal(narrow.cells.length, 70);
    assert.equal(narrow.cells.length % 7, 0);
  }
});
test("UTC date boundaries, leap years and month labels remain stable", () => {
  assert.equal(creditActivityRange(new Date("2026-09-03T00:30:00+03:00")).to, "2026-09-02");
  const chart = buildCreditActivity([], "day", new Date("2024-03-01T00:00:00Z"));
  assert.ok(chart.cells.some(cell => cell.date === "2024-02-29" && !cell.placeholder));
  for (let index = 1; index < chart.months.length; index++) assert.ok(chart.months[index].column > chart.months[index - 1].column);
});
