import assert from "node:assert/strict";
import { test } from "node:test";
import { activeCallProcess, callStatusChip } from "../src/shared/lib/call-status.ts";
import { analysisProgress } from "../src/shared/lib/analysis.ts";
import type { AnalysisResponse } from "../src/types.ts";

test("an outdated analysis after a transcript edit never looks like active processing", () => {
  for (const callStatus of ["transcribed", "analyzed"] as const) {
    assert.equal(activeCallProcess(callStatus, "stale"), null);
    assert.equal(callStatusChip(callStatus, "stale"), "Обновите анализ");
  }
  const stale = { status: "stale", result_json: { progress: { stage: "complete", items_done: 10, items_total: 10 } } } as unknown as AnalysisResponse;
  assert.equal(analysisProgress(stale), undefined);
  assert.equal(analysisProgress({ ...stale, status: "processing" })?.stage, "complete");
  assert.equal(activeCallProcess("analyzed", "processing"), "analysis");
});
