import type { Step, Target } from "../scenario";
import { focusPortraitMonitor } from "../monitor-viewport";

const employeesTab: Target = { selector: ".analytics-tabs button", text: "Сотрудники" };
const olgaRow: Target = { selector: ".data-table-row.is-clickable", text: "Ольга Тимофеева" };
const mariaRow: Target = { selector: ".data-table-row.is-clickable", text: "Мария Волкова" };
const weakCriterionRow: Target = { selector: ".data-table-row.is-clickable", text: "Договорённость о следующем шаге" };
const qaSection: Target = { selector: ".app-sidebar-menu button", text: "QA-проверка" };
const analyticsSection: Target = { selector: ".app-sidebar-menu button", text: "Аналитика" };
const closePanel: Target = ".analytics-panel header .icon-button";

/**
 * What the department leader does on their monitor while the camera watches:
 * reads the month of the department, opens one employee's profile, glances at
 * the QA queue and finishes on the criterion the team keeps failing. The
 * caption ids are the ones the landing shows beside the monitor.
 *
 * Every click names its target: a bare click would fire wherever the cursor
 * happens to be, and a target below the fold moves under it while the page is
 * still scrolling towards it.
 */
export const leaderScenario: Step[] = [
  { kind: "caption", id: null },
  { kind: "run", fn: () => { if (!focusPortraitMonitor("leader", "smooth")) window.scrollTo({ top: 0, behavior: "smooth" }); } },
  { kind: "wait", ms: 700 },

  // The month of the whole department: score, its change, the trend.
  { kind: "caption", id: "team" },
  { kind: "move", target: ".analytics-summary .analytics-score-card", at: [0.3, 0.55] },
  { kind: "wait", ms: 700 },
  { kind: "move", target: { selector: ".analytics-summary > div", text: "Мой отдел / компания" } },
  { kind: "wait", ms: 800 },
  { kind: "move", target: { selector: ".analytics-trend-card .trend-chart-hit", index: 9 }, duration: 1 },
  { kind: "wait", ms: 900 },

  // One employee out of the table, opened as a profile against the department.
  { kind: "caption", id: "employee" },
  { kind: "move", target: employeesTab },
  { kind: "wait", ms: 500 },
  { kind: "click", target: employeesTab },
  { kind: "wait", ms: 700 },
  { kind: "move", target: olgaRow, at: [0.3, 0.5] },
  { kind: "wait", ms: 500 },
  { kind: "move", target: mariaRow, at: [0.3, 0.5] },
  { kind: "wait", ms: 400 },
  { kind: "click", target: mariaRow },
  { kind: "wait", ms: 1000 },
  { kind: "move", target: { selector: ".analytics-profile .analytics-block h2", text: "Критерии" }, at: [0.4, 0.5] },
  { kind: "wait", ms: 900 },
  { kind: "move", target: { selector: ".mistakes-profile h3", text: "Открытые ошибки" } },
  { kind: "wait", ms: 900 },

  // The queue of calls waiting for a human check.
  { kind: "caption", id: "qa" },
  { kind: "move", target: qaSection },
  { kind: "wait", ms: 400 },
  { kind: "click", target: qaSection },
  { kind: "wait", ms: 900 },
  { kind: "move", target: { selector: ".quality-list-row", index: 0 }, at: [0.35, 0.5] },
  { kind: "wait", ms: 800 },
  { kind: "move", target: { selector: ".quality-list-row", index: 2 }, at: [0.35, 0.5] },
  { kind: "wait", ms: 700 },

  // Back to the criteria, into the one the department keeps failing.
  { kind: "caption", id: "criteria" },
  { kind: "move", target: analyticsSection },
  { kind: "wait", ms: 400 },
  { kind: "click", target: analyticsSection },
  { kind: "wait", ms: 900 },
  { kind: "move", target: weakCriterionRow, at: [0.25, 0.5] },
  { kind: "wait", ms: 600 },
  { kind: "click", target: weakCriterionRow },
  { kind: "wait", ms: 1100 },
  { kind: "move", target: { selector: ".analytics-panel-calls li button", index: 0 }, at: [0.4, 0.5] },
  { kind: "wait", ms: 1100 },
  { kind: "move", target: closePanel },
  { kind: "click", target: closePanel },

  { kind: "caption", id: null },
  { kind: "run", fn: () => { if (!focusPortraitMonitor("leader", "smooth")) window.scrollTo({ top: 0, behavior: "smooth" }); } },
  { kind: "wait", ms: 700 }
];
