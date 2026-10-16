import DOMPurify from "dompurify";
import { Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { AssistantContentCase, AssistantDataRow, AssistantGraphic } from "../../types";
import { AssistantContentCases } from "./AssistantContentCases";
import { AssistantPlot, type AssistantPlotData } from "./AssistantPlot";

export function AssistantGraphicPanel({ graphic, onRevise, onOpenCall, onError }: { graphic: AssistantGraphic; onRevise: (graphic: AssistantGraphic) => void; onOpenCall: (id: string) => void; onError: (error: unknown) => void }) {
  const [loaded, setLoaded] = useState<AssistantGraphic & {plot?:AssistantPlotData}>();
  const [rows, setRows] = useState<AssistantDataRow[]>([]), [cursor, setCursor] = useState<string>();
  const [cases,setCases]=useState<AssistantContentCase[]>([]);
  const [dataOpen, setDataOpen] = useState(false), [busy, setBusy] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const viewer = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = viewer.current; if (!dialog) return; if (enlarged && !dialog.open) dialog.showModal(); else if (!enlarged && dialog.open) dialog.close(); }, [enlarged]);
  useEffect(() => { let alive = true; setLoaded(undefined); setRows([]); setCases([]); setCursor(undefined); setDataOpen(false); api.getAssistantGraphic(graphic.id).then(value => { if (alive) setLoaded(value); }).catch(error => { if (alive) onError(error); }); return () => { alive = false; }; }, [graphic.id, graphic.version_uuid, onError]);
  async function showData() {
    setBusy(true);
    try { if(graphic.content_binding){const value=await api.getAssistantContentCases(graphic.id,dataOpen?cursor:undefined);setCases(previous=>dataOpen?[...previous,...value.items]:value.items);setCursor(value.next_cursor||undefined);}else{const value = await api.getAssistantCalculationCalls(graphic.calculation_id, dataOpen ? cursor : undefined); setRows(previous => dataOpen ? [...previous, ...value.items] : value.items); setCursor(value.next_cursor || undefined);} setDataOpen(true); }
    catch (error) { onError(error); }
    finally { setBusy(false); }
  }
  return <article className="assistant-graphic" id={"assistant-graphic-" + graphic.id}>
    <header><h3>{loaded?.title ?? graphic.title}</h3><button className="assistant-tool" type="button" aria-label="Изменить диаграмму через чат" title="Изменить диаграмму через чат" onClick={() => onRevise(loaded ?? graphic)}><Pencil size={17}/></button>{!graphic.content_binding&&<small>{graphic.calculation.period}</small>}</header>
    <p>{loaded?.description ?? graphic.description}</p>
    {loaded?.svg ? <button type="button" className="assistant-graphic-preview" aria-label={"Открыть диаграмму «"+(loaded?.title ?? graphic.title)+"»"} onClick={() => setEnlarged(true)}>{loaded.plot&&["bar","pie","table","histogram"].includes(loaded.plot.kind)?<AssistantPlot plot={loaded.plot} color={loaded.view.color} compact/>:<div className="assistant-graphic-canvas" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(loaded.svg, { USE_PROFILES: { svg: true, svgFilters: true } }) }}/>}</button> : <p role="status">Подготовка изображения…</p>}
    <div className="assistant-graphic-actions"><button className="ghost-button small" type="button" disabled={busy} onClick={() => dataOpen ? setDataOpen(false) : void showData()}>{dataOpen ? "Скрыть данные" : "Проверить данные"}</button></div>
    <dialog ref={viewer} className="assistant-graphic-viewer" aria-label={loaded?.title ?? graphic.title} onClick={event => {if(event.target===event.currentTarget || (event.target instanceof HTMLElement && event.target.classList.contains("assistant-graphic-full")))setEnlarged(false);}} onClose={() => setEnlarged(false)} onCancel={() => setEnlarged(false)}><header><strong>{loaded?.title ?? graphic.title}</strong><button className="assistant-tool" type="button" aria-label="Закрыть диаграмму" onClick={() => setEnlarged(false)}><X size={20}/></button></header>{enlarged && loaded?.svg && (loaded.plot&&["bar","pie","table","histogram"].includes(loaded.plot.kind)?<div className="assistant-graphic-full"><AssistantPlot plot={loaded.plot} color={loaded.view.color}/></div>:<div className="assistant-graphic-full" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(loaded.svg, { USE_PROFILES: { svg: true, svgFilters: true } }) }}/>)}</dialog>
    {dataOpen && (graphic.content_binding?<><AssistantContentCases items={cases} graphic={loaded??graphic} onOpenCall={onOpenCall}/>{cursor&&<button type="button" disabled={busy} onClick={()=>void showData()}>Ещё эпизоды</button>}</>:<div className="assistant-artifact-table"><table><thead><tr><th>Запись</th><th>Группа</th><th>Значение</th><th>Исход</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.call_uuid + index}><td><button type="button" onClick={() => onOpenCall(row.call_uuid)}>{row.label}</button></td><td>{row.group}</td><td>{row.y === null ? "—" : row.y.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</td><td>{({ matched: "Подтверждено", not_matched: "Не обнаружено", uncertain: "Неопределённо", not_applicable: "Неприменимо" } as Record<string, string>)[row.outcome] ?? row.outcome}</td></tr>)}</tbody></table>{cursor && <button type="button" disabled={busy} onClick={() => void showData()}>Ещё записи</button>}</div>)}
  </article>;
}
