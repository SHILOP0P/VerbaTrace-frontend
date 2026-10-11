import { useEffect, useState } from "react";
import { api } from "../../api";
import type { InstructionScorecard } from "../../types";
import { InstructionCriterionCards, instructionCriterionSummary } from "./InstructionCriterionCards";
import { InstructionPanel } from "./InstructionWorkspace";

export function InstructionScorecardTab({ instructionId, canEdit, focusKey }: { instructionId: string; canEdit: boolean; focusKey?: string }) {
  const [card, setCard] = useState<InstructionScorecard>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { let cancelled = false; api.getInstructionScorecard(instructionId).then(value => { if (!cancelled) setCard(value); }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Критерии недоступны."); }); return () => { cancelled = true; }; }, [instructionId]);
  useEffect(() => { if (card && focusKey) document.getElementById(`criterion-${focusKey}`)?.scrollIntoView({ block: "center" }); }, [card?.scorecard_uuid, focusKey]);
  async function change(key: string, patch: { weight?: number; enabled?: boolean }) {
    if (!card) return; setBusy(true); setError(""); setNotice("");
    try { setCard(await api.editInstructionScorecard(instructionId, { lock_version: card.lock_version, criteria: [{ criterion_key: key, ...patch }] })); setNotice("Настройки сохранены для следующих анализов. Прежние оценки не изменились."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить настройки."); try { setCard(await api.getInstructionScorecard(instructionId)); } catch { /* Keep the last visible card if refresh also fails. */ } }
    finally { setBusy(false); }
  }
  const ready = card?.status === "ready" && card.is_current;
  return <InstructionPanel kind="criteria" title="Критерии оценки" subtitle={ready ? instructionCriterionSummary(card.criteria) : undefined}>
    <div className="iw-criteria-content">{error && <p className="field-error" role="alert">{error}</p>}{notice && <p className="iw-notice" role="status">{notice}</p>}
      {!card ? <p className="muted" role="status">{error || "Загружаем критерии…"}</p> : !ready ? <div className="iw-empty"><h3>Действующие критерии ещё не применены</h3><p>Редактор может подготовить их в черновике и применить.</p></div> : <InstructionCriterionCards criteria={card.criteria} canEdit={canEdit} disabled={busy} focusKey={focusKey} onChange={(key, patch) => void change(key, patch)} />}
    </div>
  </InstructionPanel>;
}
