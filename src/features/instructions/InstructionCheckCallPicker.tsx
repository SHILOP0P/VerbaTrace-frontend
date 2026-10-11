import { PhoneCall, Search, Star, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../api";
import type { CallResponse } from "../../types";
import { formatDate, formatDuration } from "../../shared/lib/formatters";

const ready = (call: CallResponse) => call.transcription_available === true || call.status === "transcribed" || call.status === "analyzed" || call.has_analysis;
const title = (call: CallResponse) => call.title || call.original_filename;
function Highlight({ text, query }: { text: string; query: string }) {
  const index = text.toLocaleLowerCase("ru-RU").indexOf(query.trim().toLocaleLowerCase("ru-RU"));
  if (!query.trim() || index < 0) return <>{text}</>;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + query.trim().length)}</mark>{text.slice(index + query.trim().length)}</>;
}

export function InstructionCheckCallPicker({ selected, onChange, disabled }: { selected?: CallResponse; onChange: (call: CallResponse | undefined) => void; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const [references, setReferences] = useState(false);
  const [selectedReference, setSelectedReference] = useState(false);
  const [open, setOpen] = useState(false);
  const [calls, setCalls] = useState<CallResponse[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(""); setCalls([]); setCursor(undefined);
    const timer = window.setTimeout(() => {
      api.listCalls({ q: query.trim() || undefined, reference_only: references || undefined, limit: 100 }, controller.signal).then(value => {
        if (controller.signal.aborted) return;
        setCalls((Array.isArray(value) ? value : value.items).filter(ready));
        setCursor(Array.isArray(value) ? undefined : value.next_cursor);
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Поиск недоступен."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, query, references]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss); return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  async function loadMore() {
    const controller = request.current;
    if (!cursor || !controller || loading) return;
    setLoading(true);
    try {
      const value = await api.listCalls({ q: query.trim() || undefined, reference_only: references || undefined, limit: 100, cursor }, controller.signal);
      if (controller.signal.aborted) return;
      const items = (Array.isArray(value) ? value : value.items).filter(ready);
      setCalls(current => [...current, ...items.filter(call => !current.some(item => item.id === call.id))]);
      setCursor(Array.isArray(value) ? undefined : value.next_cursor);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось загрузить звонки."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  function choose(call: CallResponse) { onChange(call); setSelectedReference(references); setQuery(""); input.current?.focus(); setOpen(false); }
  return <div className="iw-call-picker" ref={root} onKeyDown={event => {
    if (event.key === "Escape") { setOpen(false); input.current?.focus(); }
    if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault(); const options = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      options[(current + (event.key === "ArrowDown" ? 1 : options.length - 1) + options.length) % options.length]?.focus();
    }
  }}>
    <label className="iw-field-title" htmlFor={id}>Звонок для проверки</label><div className="iw-call-search"><Search size={17} /><input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} value={query} disabled={disabled} placeholder="Найти звонок…" onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} /><button type="button" aria-label="Очистить поиск звонка" disabled={disabled} onClick={() => { setQuery(""); setOpen(true); input.current?.focus(); }}><X size={15} /></button></div>
    <label className="checkbox-row iw-reference-filter"><input type="checkbox" checked={references} disabled={disabled} onChange={event => { setReferences(event.target.checked); setOpen(true); }} />Только эталонные звонки</label>
    {open && <div className="iw-call-results" id={`${id}-results`} role="listbox" aria-label="Звонки с готовой расшифровкой"><div className="iw-results-heading"><span>{query.trim() ? "Результаты поиска" : "Доступные расшифровки"}</span><small>{calls.length}</small></div>
      {error && <p role="alert" className="field-error">{error}</p>}{loading && !calls.length ? <p role="status">Ищем звонки…</p> : !calls.length && !error ? <p>Подходящих звонков с готовой расшифровкой нет.</p> : calls.map(call => <button type="button" role="option" aria-selected={selected?.id === call.id} key={call.id} onClick={() => choose(call)}><span className="iw-call-icon"><PhoneCall size={18} /></span><span><strong><Highlight text={title(call)} query={query} /></strong><small>{formatDate(call.display_time || call.occurred_at || call.created_at)} · {formatDuration(call.duration_seconds)} · {call.visibility_scope === "personal" ? "Личный звонок" : call.visibility_scope === "company" ? "Компания" : "Отдел"}</small></span>{references && <span className="iw-badge is-current"><Star size={12} />Эталон</span>}</button>)}
      {cursor && <button className="iw-more-results" type="button" disabled={loading} onClick={() => void loadMore()}>{loading ? "Загружаем…" : "Показать ещё"}</button>}
    </div>}
    {selected && <div className="iw-selected-call"><PhoneCall size={19} /><div><strong>{title(selected)}</strong><small>{formatDate(selected.display_time || selected.occurred_at || selected.created_at)} · {formatDuration(selected.duration_seconds)}{selectedReference && " · Эталонный"}</small></div><button type="button" aria-label="Убрать выбранный звонок" disabled={disabled} onClick={() => { onChange(undefined); setSelectedReference(false); }}><X size={16} /></button></div>}
  </div>;
}
