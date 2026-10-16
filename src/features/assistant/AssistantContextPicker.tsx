import { useEffect, useRef, useState } from "react";
import { CalendarRange, Folder, Phone, X } from "lucide-react";
import { api } from "../../api";
import { DateTimePicker } from "../../shared/ui/DateTimePicker";
import { ToolButton } from "./AssistantControls";

export type ContextItem = { kind: "call" | "folder"; id: string; label: string };

export function AssistantContextPicker({ companyId, searchTerm, onSelect, onClose, onPeriod }: {
  companyId: string; searchTerm: string; onSelect: (item: ContextItem) => void;
  onClose: () => void; onPeriod: (from: string, to: string) => void;
}) {
  const [items, setItems] = useState<ContextItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [cursor, setCursor] = useState<string>();
	const [folderOffset, setFolderOffset] = useState<number>();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [onClose]);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(""); setCursor(undefined); setFolderOffset(undefined);
    const timer = window.setTimeout(async () => {
      try {
        const [calls, folders] = await Promise.all([
          api.listCalls({ scope: companyId ? ["company", "department"] : "personal", company_uuid: companyId || undefined, q: searchTerm || undefined, limit: 30 }),
          api.listCallFolders({ scope: companyId ? undefined : "personal", company_uuid: companyId || undefined, q: searchTerm || undefined, limit: 50 })
        ]);
        if (!alive) return;
        const records = Array.isArray(calls) ? calls : calls.items;
        setItems([...records.map(call => ({ kind: "call" as const, id: call.id, label: call.title })), ...folders.items.map(folder => ({ kind: "folder" as const, id: folder.id, label: folder.name }))]);
        setCursor(Array.isArray(calls) ? undefined : calls.next_cursor);
		setFolderOffset(folders.offset + folders.items.length < folders.total ? folders.offset + folders.items.length : undefined);
      } catch { if (alive) setError("Не удалось загрузить материалы"); }
      finally { if (alive) setLoading(false); }
    }, 150);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [companyId, searchTerm]);
  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const response = await api.listCalls({ scope: companyId ? ["company", "department"] : "personal", company_uuid: companyId || undefined, q: searchTerm || undefined, limit: 30, cursor });
      if (!Array.isArray(response)) { setItems(previous => [...previous, ...response.items.map(call => ({ kind: "call" as const, id: call.id, label: call.title }))]); setCursor(response.next_cursor); }
    } catch { setError("Не удалось загрузить следующие звонки"); }
    finally { setLoading(false); }
  }
	async function loadMoreFolders() {
		if (folderOffset === undefined || loading) return;
		setLoading(true);
		try {
			const folders = await api.listCallFolders({ scope: companyId ? undefined : "personal", company_uuid: companyId || undefined, q: searchTerm || undefined, limit: 50, offset: folderOffset });
			setItems(previous => [...new Map([...previous, ...folders.items.map(folder => ({ kind: "folder" as const, id: folder.id, label: folder.name }))].map(item => [item.kind + ":" + item.id, item])).values()]);
			setFolderOffset(folders.offset + folders.items.length < folders.total ? folders.offset + folders.items.length : undefined);
		} catch { setError("Не удалось загрузить следующие папки"); }
		finally { setLoading(false); }
	}
  return <div ref={root} className="assistant-context-picker" role="dialog" aria-label="Добавить материалы" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header><span><strong>Материалы исследования</strong><small>Звонки и папки</small></span><ToolButton label="Закрыть материалы" onClick={onClose}><X size={16}/></ToolButton></header>
    <button type="button" className="assistant-period-toggle" aria-expanded={periodOpen} onClick={() => setPeriodOpen(value => !value)}><CalendarRange size={16}/>Период по дате загрузки</button>
    {periodOpen ? <div className="assistant-period">
      <label>С даты<DateTimePicker mode="date" placement="below" value={from} onChange={setFrom} ariaLabel="Начальная дата"/></label>
      <label>По дату включительно<DateTimePicker mode="date" placement="below" value={to} onChange={setTo} ariaLabel="Конечная дата"/></label>
      <small>Период ограничивает папки; явно добавленные звонки входят независимо от даты.</small>
      <button type="button" disabled={!from || !to || from > to} onClick={() => { onPeriod(from, to); onClose(); }}>Применить период</button>
    </div> : <div className="assistant-picker-results">
      {items.map(item => <button type="button" key={item.kind + ":" + item.id} onClick={() => onSelect(item)}>{item.kind === "call" ? <Phone size={16}/> : <Folder size={16}/>}<span>{item.label}</span><small>{item.kind === "call" ? "Звонок" : "Папка"}</small></button>)}
      {loading && <p role="status">Загрузка материалов…</p>}
      {!loading && !items.length && <p>Подходящие материалы не найдены</p>}
      {cursor && <button type="button" disabled={loading} onClick={() => void loadMore()}>Ещё звонки</button>}
	  {folderOffset !== undefined && <button type="button" disabled={loading} onClick={() => void loadMoreFolders()}>Ещё папки</button>}
    </div>}
    {error && <p className="assistant-error" role="alert">{error}</p>}
  </div>;
}
