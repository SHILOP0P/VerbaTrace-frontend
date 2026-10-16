import { useRef, useState } from "react";
import { Phone, X } from "lucide-react";
import { api } from "../../api";
import type { AssistantRun } from "../../types";
import { ToolButton } from "./AssistantControls";
import { questionText } from "./questionText";

type FormDraft = { answers: Record<string, string>; custom: Record<string, string>; key: string };
type RequestProps = { run: AssistantRun; onChanged: (run: AssistantRun) => void; onError: (error: unknown) => void; onOpenCall?: (id: string) => void };
function readDraft(storageKey: string): FormDraft {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) || "null") as FormDraft | null;
    if (value && typeof value.key === "string" && value.answers && value.custom &&
        Object.values(value.answers).every(answer => typeof answer === "string") &&
        Object.values(value.custom).every(answer => typeof answer === "string")) return value;
  } catch { /* Storage may be unavailable. The form still works in memory. */ }
  return { answers: {}, custom: {}, key: crypto.randomUUID() };
}

export function AssistantRequests({ run, onChanged, onError, onOpenCall }: RequestProps) {
  const request = run.user_request;
  if (!request) return null;
  return <RequestForm key={request.request_uuid} run={run} onChanged={onChanged} onError={onError} onOpenCall={onOpenCall}/>;
}

function RequestForm({ run, onChanged, onError, onOpenCall }: RequestProps) {
  const request = run.user_request!;
  const storageKey = "vt-assistant-answers:" + run.id + ":" + request.request_uuid;
  const [draft, setDraft] = useState<FormDraft>(() => readDraft(storageKey));
  const { answers, custom } = draft;
  const [busy, setBusy] = useState(false), [collapsed, setCollapsed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fields = useRef<Array<HTMLFieldSetElement | null>>([]);
  const groups = new Map<string, typeof request.calls>();
  for (const call of request.calls) { const items = groups.get(call.reason) ?? []; items.push(call); groups.set(call.reason, items); }
  const missing = request.questions.map((question, index) => ({ question, index })).filter(({ question }) => !answers[question.id]?.trim());
  const update = (id: string, answer: string, own: string) => {
    const next = { answers: { ...answers, [id]: answer }, custom: { ...custom, [id]: own }, key: crypto.randomUUID() };
    setDraft(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the in-memory answer. */ }
  };
  const focusQuestion = (index: number) => {
    const field = fields.current[index];
    field?.scrollIntoView({ block: "center", behavior: "instant" });
    field?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")?.focus({ preventScroll: true });
  };
  const send = async (accept?: boolean, autonomous = false) => {
    if (busy) return;
    if (accept === undefined && missing.length && !autonomous) { setSubmitted(true); focusQuestion(missing[0].index); return; }
    setBusy(true);
    try {
      const submittedAnswers = autonomous ? Object.fromEntries(request.questions.map(question => [question.id, answers[question.id]?.trim() || "Продолжи самостоятельно по контексту моего запроса и доступным данным. Выбери подходящий способ разбора; неизвестные факты, числа, участников и критерии не придумывай, укажи ограничения."])) : answers;
      const next = await api.answerAssistantRun(run.id, { request_uuid: request.request_uuid, idempotency_key: accept === undefined ? draft.key + (autonomous ? ":autonomous" : "") : draft.key + ":" + accept, ...(accept === undefined ? { answers: submittedAnswers } : { accept }) });
      try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
      onChanged(next);
    }
    catch (error) { onError(error); }
    finally { setBusy(false); }
  };
  if (collapsed) return <button type="button" className="assistant-awaiting-link" onClick={() => setCollapsed(false)}>Ответить на вопросы — запрос ожидает вашего решения</button>;
  return <section className="assistant-questions" aria-label="Уточнение запроса">
    <header><strong>{request.kind === "clarification" ? "Уточним задачу" : "Нужно ваше решение"}</strong><ToolButton label="Свернуть вопросы" onClick={() => setCollapsed(true)}><X size={16}/></ToolButton></header>
    {request.message && <p>{questionText(request.message)}</p>}
    {request.kind === "clarification" ? <form onSubmit={event => { event.preventDefault(); void send(); }}>
      <p className="assistant-answer-summary" role="status">Заполнено {request.questions.length - missing.length} из {request.questions.length}. Можно выбрать вариант или написать свой ответ.</p>
      {request.questions.map((question, questionIndex) => <fieldset key={question.id} ref={node => { fields.current[questionIndex] = node; }} aria-invalid={submitted && !answers[question.id]?.trim()}><legend>{questionIndex + 1}. {questionText(question.title)}</legend>
        {question.options.map((option,index) => <label key={index} className="assistant-answer-option"><input type="radio" name={request.request_uuid + question.id} checked={answers[question.id] === option && !custom[question.id]} disabled={busy} onChange={() => update(question.id, option, "")}/><span className="assistant-option-number" aria-hidden="true">{index+1}</span><span>{request.artifact_options ? option : questionText(option)}</span></label>)}
        <label className="assistant-free-answer">{question.options.length+1}. Свой ответ<textarea rows={2} maxLength={12000} disabled={busy} value={custom[question.id] ?? ""} onChange={event => update(question.id, event.target.value, event.target.value)}/></label>
        {submitted && !answers[question.id]?.trim() && <p className="assistant-answer-error">Выберите вариант или напишите свой ответ.</p>}
      </fieldset>)}
      <button className="primary-button assistant-answer-submit" type="submit" disabled={busy}>{busy ? "Сохранение…" : "Ответить и продолжить"}</button>
      {!request.artifact_options && <button className="ghost-button assistant-autonomous" type="button" disabled={busy} onClick={() => void send(undefined,true)}>Продолжить самостоятельно</button>}
    </form> : <>
      {[...groups].map(([reason, calls]) => <section className="assistant-problem-group" key={reason}>
        <p>{reason}</p>
        <ul>{calls.filter(call => call.title).map(call => <li key={call.call_uuid}>{onOpenCall && call.call_uuid !== "00000000-0000-0000-0000-000000000000" ? <button type="button" onClick={() => onOpenCall(call.call_uuid)}><Phone size={16}/><span>{call.title}</span></button> : <span>{call.title}</span>}</li>)}</ul>
        {calls.some(call => !call.title) && <p className="assistant-problem-hidden">Записей без доступа: {calls.filter(call => !call.title).length}. Названия скрыты.</p>}
      </section>)}
      <div className="assistant-question-actions">{(request.kind !== "exclusion" || request.remaining_calls !== 0) && <button className="primary-button small" type="button" disabled={busy} onClick={() => void send(true)}>{request.kind === "mode_switch" ? "Переключить и продолжить" : "Исключить и продолжить"}</button>}<button className="ghost-button small" type="button" disabled={busy} onClick={() => void send(false)}>{request.kind === "mode_switch" ? "Оставить режим" : "Оставить на паузе"}</button></div>
    </>}
  </section>;
}
