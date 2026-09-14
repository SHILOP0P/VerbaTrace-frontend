import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AnalysisPreview } from "../../src/shared/ui/analysis";
import { StatusTimeline } from "../../src/shared/ui/call";
import { analysisProgress } from "../../src/shared/lib/analysis";
import type { AnalysisResponse, AnalysisProgress } from "../../src/types";
import "../../src/styles/index.css";

function Fixture() {
  const [stage, setStage] = useState<AnalysisProgress["stage"]>("inventory");
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(false);
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `u${i}`, kind: "question", title: `Вопрос ${i + 1}: как устроена обработка данных?`, topic: "Обработка данных", order: i,
    asked: true, information_status: i < done ? "complete" : null, fulfilled_earlier: i === 1 && done > 1,
    processing_status: i < done ? "ready" : "pending", status: i < done ? "met" : "not_assessed", score: i < done ? 100 : null,
    answer_summary: i < done ? "Участник описал последовательность действий и привёл пример." : null,
    explanation: i < done ? "Ответ раскрывает заданный вопрос. Дополнительные подробности по инструкции не требуются." : "Ответ и оценка появятся после обработки этого вопроса.",
    improvement_kind: "not_needed", strengths: [], gaps: [], evidence: [], instruction_sources: [] }));
  const analysis: AnalysisResponse = { id: "fixture", call_uuid: "fixture", provider: "fixture", created_at: "2026-09-12", updated_at: "2026-09-12",
    status: failed ? "failed" : stage === "complete" ? "done" : "processing",
    result_json: { schema_version: 3, prompt_version: "universal-v3.1", items, summary: "Обсудили обработку данных. Стоит чаще объяснять причины выбранного решения.", overall_score: stage === "complete" ? 100 : null,
      progress: { stage, windows_done: 2, windows_total: 2, items_done: done, items_total: 8, questions_found: 8 },
      coverage: { status: stage === "complete" ? "complete" : "partial", actual_question_count: 8, analyzed_actual_question_count: done, limitations: [] }, recommendations: [], work_on: ["Объяснять причины выбора решения"] } };
  return <div className="app-shell"><main style={{ maxWidth: 1100, padding: 24, margin: "auto" }}><h1>Анализ разговора</h1>
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
      <button onClick={() => {setStage("inventory"); setDone(0); setFailed(false);}}>Вопросы</button>
      <button onClick={() => {setStage("answers"); setDone(3);}}>Три ответа</button>
      <button onClick={() => {setStage("validation"); setDone(8);}}>Проверка</button>
      <button onClick={() => {setStage("complete"); setDone(8);}}>Итог</button>
      <button onClick={() => setFailed(true)}>Ошибка</button>
    </nav>
    <StatusTimeline current={stage === "complete" ? "analyzed" : "transcribed"} analysisStatus={analysis.status} analysisProgress={analysisProgress(analysis)} />
    <AnalysisPreview analysis={analysis} expanded={true} />
  </main></div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
