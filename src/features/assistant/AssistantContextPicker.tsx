import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Folder, MessageSquare, Phone, X } from "lucide-react";
import { api } from "../../api";
import { DateTimePicker } from "../../shared/ui/DateTimePicker";
import { ToolButton } from "./AssistantControls";

export type ContextItem={kind:"call"|"folder"|"chat";id:string;label:string;callIds?:string[]};

export function AssistantContextPicker({companyId,searchTerm,onSelect,onClose,onPeriod}:{companyId:string;searchTerm:string;onSelect:(item:ContextItem)=>void;onClose:()=>void;onPeriod:(from:string,to:string)=>void}) {
 const [items,setItems]=useState<ContextItem[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(""),[periodOpen,setPeriodOpen]=useState(false),[from,setFrom]=useState(""),[to,setTo]=useState(""); const root=useRef<HTMLDivElement>(null); const normalized=searchTerm.trim().toLocaleLowerCase();
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))onClose()};document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside)},[onClose]);
 useEffect(()=>{let alive=true;setLoading(true);setError("");const timer=window.setTimeout(async()=>{try{const [callResponse,folderResponse,chatResponse]=await Promise.all([api.listCalls({scope:companyId?["company","department"]:"personal",company_uuid:companyId||undefined,q:searchTerm||undefined,limit:30}),api.listCallFolders({scope:companyId?"company":"personal",company_uuid:companyId||undefined,q:searchTerm||undefined,limit:50}),api.listAssistantChats(companyId)]);const calls=Array.isArray(callResponse)?callResponse:callResponse.items;const matches=(label:string)=>!normalized||label.toLocaleLowerCase().includes(normalized);const values:ContextItem[]=[...calls.map(c=>({kind:"call" as const,id:c.id,label:c.title})),...folderResponse.items.filter(f=>matches(f.name)).map(f=>({kind:"folder" as const,id:f.id,label:f.name})),...chatResponse.items.filter(c=>matches(c.title)).map(c=>({kind:"chat" as const,id:c.id,label:c.title}))];if(alive)setItems(values)}catch{if(alive)setError("Не удалось загрузить подходящие материалы")}finally{if(alive)setLoading(false)}},150);return()=>{alive=false;window.clearTimeout(timer)}},[companyId,searchTerm,normalized]);
 async function choose(item:ContextItem){if(item.kind!=="chat"){onSelect(item);return}setLoading(true);try{const response=await api.listAssistantMessages(item.id);const ids=[...new Set(response.items.flatMap(m=>m.sources?.map(s=>s.call_uuid)??[]))];if(!ids.length){setError("В этом чате пока нет доступных звонков-источников");return}onSelect({...item,callIds:ids})}catch{setError("Источники чата недоступны")}finally{setLoading(false)}}
 const caption=useMemo(()=>searchTerm?`Поиск по «${searchTerm}»`:"Звонки, папки и чаты",[searchTerm]);
 return <div ref={root} className="assistant-context-picker" role="dialog" aria-label="Добавить контекст" onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();onClose()}}}>
  <header><span><strong>Подходящие материалы</strong><small>{caption}</small></span><ToolButton label="Закрыть материалы" onClick={onClose}><X size={16}/></ToolButton></header>
  <button type="button" className="assistant-period-toggle" aria-expanded={periodOpen} onClick={()=>setPeriodOpen(v=>!v)}><CalendarRange size={16}/>Ограничить период</button>
  {periodOpen&&<div className="assistant-period"><label>С даты<DateTimePicker mode="date" placement="below" value={from} onChange={setFrom} ariaLabel="Начальная дата"/></label><label>По дату включительно<DateTimePicker mode="date" placement="below" value={to} onChange={setTo} ariaLabel="Конечная дата"/></label><button type="button" disabled={!from||!to||from>to} onClick={()=>{onPeriod(from,to);onClose()}}>Применить период</button></div>}
  {!periodOpen&&<div className="assistant-picker-results">{loading?<p>Ищем подходящие материалы…</p>:items.length?items.map(item=><button type="button" key={`${item.kind}:${item.id}`} onClick={()=>void choose(item)}>{item.kind==="call"?<Phone size={16}/>:item.kind==="folder"?<Folder size={16}/>:<MessageSquare size={16}/>}<span>{item.label}</span><small>{item.kind==="call"?"Звонок":item.kind==="folder"?"Папка":"Чат"}</small></button>):<p>Подходящие материалы не найдены</p>}</div>}
  {error&&<p className="assistant-error" role="alert">{error}</p>}
 </div>;
}
