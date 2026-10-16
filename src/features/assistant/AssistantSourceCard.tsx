import { useState } from "react";
import { api } from "../../api";
import type { AssistantSource, TranscriptionWordResponse } from "../../types";

export function AssistantSourceCard({ source, messageId, highlighted, onOpen, onError }: { source: AssistantSource; messageId: string; highlighted: boolean; onOpen: () => void; onError: (error: unknown) => void }) {
  const [content, setContent] = useState<{ text: string; words: TranscriptionWordResponse[] }>();
  const [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false);
  async function showVersion() {
    if (expanded) { setExpanded(false); return; }
    setBusy(true);
    try { setContent(await api.getAssistantSourceContent(messageId, source.id)); setExpanded(true); }
    catch (error) { setContent(undefined); setExpanded(false); onError(error); }
    finally { setBusy(false); }
  }
  return <article id={"assistant-source-" + source.id} className={"assistant-source " + (highlighted ? "is-highlighted" : "")}>
    <b>{source.call_title}</b><span>{source.quote}</span>
    <small>{source.source_kind === "analysis" ? "Сохранённый анализ и поправки QA" : "Расшифровка"} · Использованная версия {source.transcription_revision}</small>
    <div className="assistant-source-actions"><button type="button" onClick={onOpen}>Открыть звонок</button>{source.origin === "snapshot" && <button type="button" disabled={busy} onClick={() => void showVersion()}>{expanded ? "Скрыть материал" : busy ? "Загрузка…" : "Использованный материал"}</button>}</div>
    {expanded && content && <div className="assistant-source-content" tabIndex={0} aria-label="Сохранённый материал исследования">
      {content.words.length ? content.words.map((word, index) => <span key={index} className={index >= (source.word_start_index ?? -1) && index <= (source.word_end_index ?? -1) ? "is-evidence" : undefined}>{word.text} </span>) : content.text}
    </div>}
  </article>;
}
