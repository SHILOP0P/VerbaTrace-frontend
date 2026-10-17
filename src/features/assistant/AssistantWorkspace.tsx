import { useAssistantPanelWidths } from "./useAssistantPanelWidths";
import { cssClass, cssStyle } from "../../shared/lib/css-styles";
import { BarChart3, CalendarRange, ChevronDown, Copy, Check, Pencil, Expand, FileText, Folder, Link2, MessageSquare, Minimize2, PanelLeft, PanelRightOpen, Paperclip, Phone, Plus, Search, SearchCheck, Send, Pause, Trash2, X } from "lucide-react";
import "../../styles/assistant.css";
import { FormEvent, ReactNode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SafeMarkdown as ReactMarkdown } from "../../shared/ui/SafeMarkdown";
import remarkGfm from "remark-gfm";
import { ApiError, api } from "../../api";
import type { AssistantChat, AssistantExport, AssistantGraphic, AssistantMessage, AssistantMode, AssistantRun, AssistantSource, ContentSearchResponse } from "../../types";
import { AssistantCollapse, AssistantModeSwitch, AssistantPanelIndicator, ChoiceMenu, ToolButton } from "./AssistantControls";
import { AssistantContextPicker, ContextItem } from "./AssistantContextPicker";
import { AssistantRequests } from "./AssistantRequests";
import { AssistantGraphicPanel } from "./AssistantGraphicPanel";
import { AssistantExportLink } from "./AssistantExportLink";
import { AssistantSourceCard } from "./AssistantSourceCard";
import { useAssistantComposerDraft, type DraftStore } from "./useAssistantComposerDraft";
import { AssistantExportMenu, assistantExportFormats } from "./AssistantExportMenu";
import { AssistantResearchSummary } from "./AssistantResearchSummary";

type Detail = "brief" | "auto" | "detailed";
type Panel = "sources" | "attachments" | "graphics";
const terminal = new Set(["completed", "failed", "cancelled", "access_revoked"]);
const panelOptions = [{ id: "sources" as const, Icon: Link2, label: "Источники" }, { id: "attachments" as const, Icon: Paperclip, label: "Вложения и результаты" }, { id: "graphics" as const, Icon: BarChart3, label: "Диаграммы" }];
const progressLabel = (run:AssistantRun) => run.pause_requested && run.state !== "paused" ? "Завершаю текущие проверки и ставлю на паузу" : ({status_unknown:"Получаю статус исследования",queued:"Запрос принят",preparing:"Подготовка материалов",processing:"Изучаю записи",retrieving:"Ищу звонки",validating:"Проверяю результат",generating:"Готовлю ответ",awaiting_user:"Ожидаю вашего ответа",paused:"Запрос приостановлен"} as Record<string,string>)[run.state] ?? "Обрабатываю запрос";
const time = (value: string) => new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const mentionTerm = (value: string) => /(?:^|\s)@([^\s]*)$/.exec(value)?.[1] ?? "";
const exportPreferenceKey = "vt-assistant-export-format:v1";
const resourcesPreferenceKey = "vt-assistant-resources-open:v1";
function savedResourcesOpen() {
  try { return localStorage.getItem(resourcesPreferenceKey) !== "false"; } catch { return true; }
}
function savedExportFormat() {
  try { const value = localStorage.getItem(exportPreferenceKey); if (assistantExportFormats.some(item => item.value === value)) return value!; } catch { /* Keep an in-memory preference when storage is unavailable. */ }
  return "pdf";
}
function chatDate(value: string) {
  const date = new Date(value), today = new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toDateString() === today.toDateString() ? time(value) : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
const errorLabels: Record<string, string> = {
  provider_unavailable: "Провайдер ИИ недоступен. Запрос можно продолжить после восстановления.",
  provider_response_truncated: "ИИ исчерпал лимит ответа до завершения результата. Исследование остановлено; выполненные проверки сохранены.",
  quality_validation_failed: "Не удалось подтвердить результат проверки. Непроверенный ответ не опубликован.",
  source_evidence_invalid: "Исследование остановлено: ИИ сослался на неподтверждённую цитату или источник. Итоговый анализ не опубликован; выполненные этапы сохранены.",
  billing_reconciliation_required: "Нужно завершить проверку расхода предыдущего запроса. Повторная платная операция не запущена.",
  insufficient_credits: "Недостаточно доступных кредитов. Прогресс сохранён.",
  provider_budget_exceeded: "Исследование приостановлено на установленном лимите расходов. Проверенные этапы сохранены.",
  user_paused: "Исследование на паузе. Выполненные проверки сохранены; можно продолжить с этого места.",
  material_unavailable: "Часть материалов больше недоступна."
  ,search_calibration_required: "Для выбранного профиля ещё не настроена проверка релевантности поиска."
};

export function AssistantWorkspace({ companyId, companies, allowedScopes, onAccessRefresh, onOpenCall, open, setOpen }: {
  companyId: string; companies: { id: string; name: string }[]; allowedScopes: string[];
  onAccessRefresh: () => void; onOpenCall: (id: string) => void; open: boolean; setOpen: (value: boolean) => void;
}) {
  const [chosen, setChosen] = useState(companyId);
  const [scope, setScope] = useState<"personal" | "company">("personal");
  const [expanded, setExpanded] = useState(false);
  const draftStore = useRef<DraftStore>(new Map());
  const personalAllowed = allowedScopes.includes("");
  const availableCompanies = companies.filter(company => allowedScopes.includes(company.id));
  const desired = scope === "personal" ? "" : chosen;
  const activeCompany = allowedScopes.includes(desired) ? desired : allowedScopes[0];
  if (activeCompany === undefined) return null;
  const scopeControl = <div className="assistant-scope-bar">
    {personalAllowed && availableCompanies.length > 0 ? <div className={"assistant-scope-switch " + (activeCompany ? "is-company" : "")} role="group" aria-label="Контекст и плательщик">
      <span className="assistant-scope-thumb" aria-hidden="true"/>
      <button type="button" aria-pressed={!activeCompany} onClick={() => setScope("personal")}>Личные звонки</button>
      <button type="button" aria-pressed={!!activeCompany} onClick={() => { setScope("company"); if (!availableCompanies.some(company => company.id === chosen)) setChosen(availableCompanies[0].id); }}>Компания</button>
    </div> : <small>{activeCompany ? availableCompanies.find(company => company.id === activeCompany)?.name : "Личные звонки"}</small>}
    {activeCompany && availableCompanies.length > 1 && <ChoiceMenu label="Компания" value={activeCompany} options={availableCompanies.map(company => ({ value: company.id, label: company.name }))} onChange={setChosen}/>}
  </div>;
  return <ScopedAssistantWorkspace key={activeCompany || "personal"} companyId={activeCompany} onAccessRefresh={onAccessRefresh} onOpenCall={onOpenCall} open={open} setOpen={setOpen} expanded={expanded} setExpanded={setExpanded} scopeControl={scopeControl} draftStore={draftStore.current}/>;
}

function ScopedAssistantWorkspace({ companyId, onAccessRefresh, onOpenCall, open, setOpen, expanded, setExpanded, scopeControl, draftStore }: {
  companyId: string; onAccessRefresh: () => void; onOpenCall: (id: string) => void; open: boolean; setOpen: (value: boolean) => void;
  expanded: boolean; setExpanded: (value: boolean) => void; scopeControl: ReactNode; draftStore: DraftStore;
}) {
  const [chats, setChats] = useState<AssistantChat[]>([]), [chat, setChat] = useState<AssistantChat | null>(null);
  const receiveChats = useCallback((items: AssistantChat[]) => setChats(previous => items.map(item => {
    const current = previous.find(value => value.id === item.id);
    return current && Date.parse(current.updated_at) > Date.parse(item.updated_at) ? current : item;
  })), []);
  const selectionKey = "vt-assistant-selected-chat:v1:" + (companyId || "personal");
  const selectedExplicitly = useRef(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]), [run, setRun] = useState<AssistantRun | null>(null);
  const [detail, setDetail] = useState<Detail>("auto");
  const [historyOpen, setHistoryOpen] = useState(false), [pickerOpen, setPickerOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; title: string }>();
  const [renameBusy, setRenameBusy] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(savedResourcesOpen);
  const resourcesId = useId();
  const [exportFormat, setExportFormat] = useState(savedExportFormat);
  const [panel, setPanel] = useState<Panel | null>(null), [selectedGraphic, setSelectedGraphic] = useState<string>();
  const [sourceMessageId, setSourceMessageId] = useState<string>(), [highlightedSource, setHighlightedSource] = useState<string>();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [editing, setEditing] = useState<{message:AssistantMessage;text:string;key:string;clientId:string}>();
  const [copied, setCopied] = useState<string>();
  const sending = useRef(false);
  const [target, setTarget] = useState<AssistantGraphic>(), [exports, setExports] = useState<AssistantExport[]>([]), [exportOpen, setExportOpen] = useState<"conversation" | "graphics_report" | null>(null);
  const [newCounts, setNewCounts] = useState<Record<string, number>>({});
  const textarea = useRef<HTMLTextAreaElement>(null), scroll = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const panelTabs = useRef<HTMLElement>(null);
  const panelWidths = useAssistantPanelWidths(workspace, { open, expanded, historyOpen, inspectorOpen: !!panel });
  const retry = useRef<{ signature: string; chatId: string; key: string; clientId: string } | null>(null);
	const viewedChat = useRef(chat?.id); viewedChat.current = chat?.id;
  const openRef = useRef(open), animated = useRef(new Set<string>());
  const [animateMessage, setAnimateMessage] = useState<string>();
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const handleError = useCallback((failure: unknown) => {
    if (failure instanceof ApiError && (failure.status === 403 || failure.status === 401)) { setMessages([]); setRun(null); setSelectedGraphic(undefined); onAccessRefresh(); }
    setError(failure instanceof ApiError ? failure.message : "Не удалось завершить действие. Попробуйте ещё раз.");
  }, [onAccessRefresh]);
  const draft = useAssistantComposerDraft(companyId, chat?.id, chat?.mode ?? "search", draftStore, handleError);
  const query = draft.data.text, mode = draft.data.context.mode ?? "search";
  const context = draft.data.context.items ?? [], period = draft.data.context.period ?? null;
  const setQuery = (text:string) => draft.update(previous => ({...previous,text}));
  const setMode = (value:AssistantMode) => draft.update(previous => ({...previous,context:{...previous.context,mode:value}}));
  const setContext = (value:ContextItem[]|((items:ContextItem[])=>ContextItem[])) => draft.update(previous => ({...previous,context:{...previous.context,items:typeof value === "function" ? value(previous.context.items ?? []) : value}}));
  const setPeriod = (value:{from:string;to:string}|null) => draft.update(previous => ({...previous,context:{...previous.context,period:value}}));
  const refreshMessages = useCallback(async (chatId: string) => {
    const response = await api.listAssistantMessages(chatId);
	if (viewedChat.current !== chatId) return;
    setMessages(response.items);
    const fresh = response.items.find(message => message.role === "assistant" && !animated.current.has(message.id));
    if (fresh) { response.items.filter(message => message.role === "assistant").forEach(message => animated.current.add(message.id)); if (openRef.current && document.visibilityState === "visible") setAnimateMessage(fresh.id); }
  }, []);
  useEffect(() => { openRef.current = open; if (!open) setAnimateMessage(undefined); }, [open]);
  useEffect(() => {
    let alive = true;
    api.listAssistantChats(companyId).then(value => {
      if (!alive) return; receiveChats(value.items);
      if (!selectedExplicitly.current) {
        try { const saved=sessionStorage.getItem(selectionKey);const existing=value.items.find(item=>item.id===saved);if(existing) {viewedChat.current=existing.id;setChat(existing);} else if(saved)sessionStorage.removeItem(selectionKey); } catch { /* Selection still works if storage is unavailable. */ }
      }
    }).catch(handleError);
    return () => { alive = false; };
  }, [companyId, handleError, receiveChats]);
  useEffect(() => { if(chat)try {sessionStorage.setItem(selectionKey,chat.id);} catch { /* Keep in-memory selection. */ } },[chat?.id,selectionKey]);
  useEffect(() => {
    if (!chat) return;
    let alive = true;
    api.listAssistantMessages(chat.id).then(value => { if (!alive) return; setMessages(value.items); value.items.filter(message => message.role === "assistant").forEach(message => animated.current.add(message.id)); }).catch(handleError);
    if (chat.active_run_uuid) {
      setRun({ id:chat.active_run_uuid,chat_uuid:chat.id,mode:chat.mode,state:"status_unknown",request_received_at:chat.created_at });
      setStatusUnavailable(false);
      api.getAssistantRun(chat.active_run_uuid).then(value => { if (alive) {setRun(value);setStatusUnavailable(false);} }).catch(failure => {
        if (!alive) return;
        if (failure instanceof ApiError && [401,403,404].includes(failure.status)) { setRun(null);handleError(failure); }
        else setStatusUnavailable(true);
      });
    }
    else setRun(null);
    return () => { alive = false; };
  }, [chat?.id, chat?.active_run_uuid, handleError]);
  useEffect(() => {
    if (!run || terminal.has(run.state) || run.state === "awaiting_user" || run.state === "paused") return;
    let alive = true;
    let shouldPoll = true;
    let failures = 0;
    let timer: number;
    const runId = run.id;
    const poll = async () => {
      try {
        const next = await api.getAssistantRun(runId);
        if (!alive) return;
        failures = 0; setStatusUnavailable(false);
        setRun(next);
        if (terminal.has(next.state) || next.state === "awaiting_user" || next.state === "paused") shouldPoll = false;
        if (next.state === "completed") {
          retry.current = null;
          if (next.assistant_message && viewedChat.current === next.chat_uuid) { const message = next.assistant_message; setMessages(previous => previous.some(item => item.id === message.id) ? previous : [...previous, message]); }
          const results = await Promise.allSettled([refreshMessages(next.chat_uuid), api.listAssistantChats(companyId)]);
          if (results[0].status === "rejected") handleError(results[0].reason);
          if (results[1].status === "fulfilled" && viewedChat.current === next.chat_uuid) receiveChats(results[1].value.items);
          else if (results[1].status === "rejected") handleError(results[1].reason);
        }
        if (next.state === "awaiting_user" && next.user_request?.delivery === "chat") await refreshMessages(next.chat_uuid);
      } catch (failure) {
        if (!alive) return;
        if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403 || failure.status === 404)) { alive = false; setRun(null);handleError(failure); }
        else { failures++; setStatusUnavailable(true); }
      } finally {
        if (alive && shouldPoll) timer = window.setTimeout(() => void poll(), Math.min(12000, 1200 * 2 ** failures));
      }
    };
    timer = window.setTimeout(() => void poll(), 1200);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [run?.id, run?.state, companyId, refreshMessages, handleError, receiveChats]);
  useEffect(() => {
    if (!open || !messages.length) return;
    let alive = true;
    const parents = [...new Set(messages.flatMap(message => message.research?.selection?.run_uuid ? [message.research.selection.run_uuid] : []))];
    Promise.allSettled(parents.map(async id => ({ id, value: await api.getAssistantNewCalls(id) }))).then(values => {
      if (!alive) return; const counts: Record<string, number> = {};
      values.forEach(value => { if (value.status === "fulfilled") counts[value.value.id] = value.value.value.count; }); setNewCounts(counts);
    });
    return () => { alive = false; };
  }, [open, messages]);
  const fitComposer = useCallback(() => {
    const node = textarea.current; if (!node) return;
    cssStyle(node).height = "auto"; cssStyle(node).height = Math.min(176, Math.max(38, node.scrollHeight)) + "px";
  }, []);
  useLayoutEffect(fitComposer, [query, open, expanded, fitComposer]);
  useEffect(() => {
    const node = textarea.current?.closest(".assistant-workspace"); if (!node) return;
    const observer = new ResizeObserver(fitComposer); observer.observe(node);
    return () => observer.disconnect();
  }, [open, expanded, fitComposer]);
  useEffect(() => {
    const node = scroll.current; if (!node || !open) return;
    if (run?.state === "awaiting_user") {
      const target = node.querySelector<HTMLElement>(".assistant-questions") ?? (run.user_request?.delivery === "chat" ? [...node.querySelectorAll<HTMLElement>(".assistant-message")].at(-1) : undefined);
      if (target) { node.scrollTop += target.getBoundingClientRect().top-node.getBoundingClientRect().top-12; return; }
    }
    node.scrollTop = node.scrollHeight;
  }, [messages, run?.state, open]);
  useEffect(() => { if (!open) return; const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented && !pickerOpen && !exportOpen && !renaming && !document.querySelector("dialog[open]")) setOpen(false); }; document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape); }, [open, pickerOpen, exportOpen, renaming, setOpen]);
  useEffect(() => {
    if(!open || !expanded)return;
    document.documentElement.classList.add("vt-assistant-expanded");
    const node=workspace.current;
    const containWheel=(event:WheelEvent)=>{
      let element=event.target instanceof Element?event.target:null;
      while(element && element!==node){
        if(element instanceof HTMLElement){
          const css=getComputedStyle(element);
          const vertical=/(auto|scroll)/.test(css.overflowY)&&element.scrollHeight>element.clientHeight&&(event.deltaY<0?element.scrollTop>0:element.scrollTop+element.clientHeight<element.scrollHeight-1);
          const horizontal=/(auto|scroll)/.test(css.overflowX)&&element.scrollWidth>element.clientWidth&&(event.deltaX<0?element.scrollLeft>0:element.scrollLeft+element.clientWidth<element.scrollWidth-1);
          if((event.deltaY && vertical)||(event.deltaX && horizontal))return;
        }
        element=element.parentElement;
      }
      event.preventDefault();
    };
    node?.addEventListener("wheel",containWheel,{passive:false});
    return ()=>{node?.removeEventListener("wheel",containWheel);document.documentElement.classList.remove("vt-assistant-expanded");};
  },[open,expanded]);
  const sources = useMemo(() => {
    const selected = sourceMessageId ? messages.filter(message => message.id === sourceMessageId) : messages;
    return [...new Map(selected.flatMap(message => message.sources ?? []).map(source => [source.id, source])).values()];
  }, [messages, sourceMessageId]);
  const visibleMessages = useMemo(()=>messages.filter(message=>{const parent=message.research?.selection?.run_uuid;return !parent||!messages.some(other=>other.sequence>message.sequence&&other.research?.selection?.run_uuid===parent);}),[messages]);
  const latestReportMessage = useMemo(() => [...visibleMessages].reverse().find(message => message.role === "assistant" && message.status === "completed" && message.research?.calculations.some(item => item.content?.complete)), [visibleMessages]);
  const latestAnswer = [...visibleMessages].reverse().find(message => message.role === "assistant");
  const answerSources = latestAnswer?.sources ?? [];
  const filteredChats = chats.filter(item => item.title.toLocaleLowerCase("ru-RU").includes(historyQuery.trim().toLocaleLowerCase("ru-RU")));
  const graphics = useMemo(() => [...new Map(visibleMessages.flatMap(message => message.research?.graphics ?? []).filter(graphic=>graphic.calculation.method!=="semantic"||(graphic.content_binding&&graphic.content_binding.metric!=="cases")).map(graphic => [graphic.id, graphic])).values()], [visibleMessages]);
  const answerGraphics = graphics.filter(item => latestAnswer?.research?.graphics.some(value => value.id === item.id));
  const graphic = graphics.find(item => item.id === selectedGraphic) ?? answerGraphics[0];
  const inspectedAnswer = graphic ? visibleMessages.find(message => message.research?.graphics.some(item => item.id === graphic.id)) ?? latestAnswer : latestAnswer;
  const inspectedSources = [...new Map((inspectedAnswer?.sources ?? []).map(source => [source.id, source])).values()];
  const hasResources = !!latestAnswer && (answerSources.length > 0 || answerGraphics.length > 0 || latestReportMessage?.id === latestAnswer.id || !!latestAnswer.text);
  function toggleResources() {
    const next = !resourcesOpen;
    setResourcesOpen(next);
    try { localStorage.setItem(resourcesPreferenceKey, String(next)); } catch { /* Preserve the in-memory choice when storage is unavailable. */ }
    setExportOpen(null);
  }
  const active = !!run && !terminal.has(run.state);
  const working = !!run && ["queued","preparing","retrieving","processing","validating","generating"].includes(run.state);
  async function pauseRun() {
    if(!run || !working || run.pause_requested || busy) return;
    setBusy(true);setError("");
    try {setRun(await api.pauseAssistantRun(run.id));} catch(failure) {handleError(failure);} finally {setBusy(false);}
  }
  const chatAnswer = run?.state === "awaiting_user" && run.user_request?.delivery === "chat";
  const filters = useMemo(() => {
    let from: string | undefined, to: string | undefined;
    if (period) { from = new Date(period.from + "T00:00:00").toISOString(); const end = new Date(period.to + "T00:00:00"); end.setDate(end.getDate() + 1); to = end.toISOString(); }
    return { call_uuids: context.filter(item => item.kind === "call").map(item => item.id), folder_uuids: context.filter(item => item.kind === "folder").map(item => item.id), from, to, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow" };
  }, [context, period]);
  function closeHistoryOnPhone() { if (window.matchMedia("(max-width:900px)").matches) setHistoryOpen(false); }
  function chooseChat(item:AssistantChat|null) { if (busy || renameBusy) return; selectedExplicitly.current=true;if(!item)try{sessionStorage.removeItem(selectionKey);}catch{/* Keep in-memory selection. */} if (item && item.id === chat?.id) { closeHistoryOnPhone(); return; } void draft.flush(); viewedChat.current = item?.id; setChat(item); setMessages([]); setRun(null); setStatusUnavailable(false); setTarget(undefined); setEditing(undefined); setRenaming(undefined); setExports([]); setSelectedGraphic(undefined); setPanel(null); setSourceMessageId(undefined); setExportOpen(null); setError(""); retry.current = null; closeHistoryOnPhone(); }
  function newChat() { chooseChat(null); }
  async function changeMode(value:AssistantMode) {
    if (value === mode || busy) return;
    setBusy(true);
    try {
      const updated = chat ? await api.setAssistantChatMode(chat.id,value) : {mode:value,run:null};
      setMode(updated.mode); if (chat) setChat({...chat,mode:updated.mode,active_run_uuid:updated.run?.id});
      if (updated.run || run?.state === "awaiting_user" || run?.state === "paused") setRun(updated.run);
    } catch(failure) { handleError(failure); } finally { setBusy(false); }
  }
  async function copyMessage(message:AssistantMessage) {
	let text = message.text;
	if (!text) { const result = message.blocks?.find(block => block.type === "search_results")?.data as ContentSearchResponse|undefined; text = result ? [...new Map(result.items.map(item => [item.call_uuid,item.title])).values()].join("\n") : message.blocks?.map(block => block.text ?? "").filter(Boolean).join("\n\n") ?? ""; }
	try {
		try { await navigator.clipboard.writeText(text); }
		catch { const node = document.createElement("textarea"); node.value = text; node.className="assistant-clipboard-helper"; document.body.appendChild(node); const previous = document.activeElement; try { node.select(); if (!document.execCommand("copy")) throw new Error("Clipboard unavailable"); } finally { node.remove(); if (previous instanceof HTMLElement) previous.focus(); } }
		setCopied(message.id); window.setTimeout(() => setCopied(undefined),2000);
	} catch { setError("Не удалось скопировать текст сообщения."); }
  }
  async function saveMessageEdit() {
    if (!editing || busy || !editing.text.trim() || editing.text.trim() === editing.message.text.trim()) return;
    setBusy(true); setError("");
    try { const next = await api.editAssistantMessage(editing.message.id,{text:editing.text,expected_text:editing.message.text,mode,idempotency_key:editing.key,client_message_id:editing.clientId}); setRun(next); setEditing(undefined); setTarget(undefined); setExports([]); await refreshMessages(next.chat_uuid); }
    catch(failure) { handleError(failure); } finally { setBusy(false); }
  }
  async function removeChat(id: string) { try { await api.deleteAssistantChat(id); setChats(previous => previous.filter(item => item.id !== id)); if (chat?.id === id) newChat(); } catch (failure) { handleError(failure); } }
  async function renameChat() {
    if (!renaming || renameBusy || !renaming.title.trim()) return;
    const original = chats.find(item => item.id === renaming.id);
    if (original?.title === renaming.title.trim()) { setRenaming(undefined); return; }
    setRenameBusy(true); setError("");
    try {
      const updated = await api.updateAssistantChatTitle(renaming.id, renaming.title.trim());
      setChats(previous => previous.map(item => item.id === updated.id ? updated : item));
      setChat(previous => previous?.id === updated.id ? { ...previous, title: updated.title, updated_at: updated.updated_at } : previous);
      setRenaming(undefined);
    } catch (failure) { handleError(failure); } finally { setRenameBusy(false); }
  }
  function chooseExportFormat(value: string) {
    setExportFormat(value);
    try { localStorage.setItem(exportPreferenceKey, value); } catch { /* Export remains available without persistence. */ }
  }
  function showSource(messageId: string, id: string) { setSourceMessageId(messageId); setHighlightedSource(id); setPanel("sources"); if (!expanded) setExpanded(true); window.setTimeout(() => document.getElementById("assistant-source-" + id)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 100); }
  function showGraphic(id: string) { setSelectedGraphic(id); setPanel("graphics"); if (!expanded) setExpanded(true); }
  function revise(item: AssistantGraphic) { setTarget(item); setMode("research"); setQuery("Измени диаграмму «" + item.title + "»: "); if (window.matchMedia("(max-width:760px)").matches) setPanel(null); window.requestAnimationFrame(() => textarea.current?.focus()); }
  async function openSource(source: AssistantSource) {
    try {
      const ownerMessage = messages.find(message => message.sources?.some(item => item.id === source.id));
      const validated = ownerMessage ? await api.getAssistantSource(ownerMessage.id, source.id) : source;
      onOpenCall(validated.call_uuid);
      const url = new URL(window.location.href);
      if (typeof validated.start_seconds === "number") url.searchParams.set("evidence_time", String(validated.start_seconds));
      url.searchParams.set("source_revision", String(validated.transcription_revision));
      window.history.replaceState({}, "", url); window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (failure) { handleError(failure); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); const text = query.trim(); if (!text || busy || sending.current || !draft.loaded || (active && !chatAnswer)) return;
    sending.current = true;
    setBusy(true); setError("");
    try {
      if (chatAnswer && run?.user_request) { const next = await api.answerAssistantRun(run.id, { request_uuid: run.user_request.request_uuid, idempotency_key: "chat-answer:" + run.user_request.request_uuid, chat_text: text }); if (next.mode) setMode(next.mode); setRun(next); setQuery(""); await refreshMessages(next.chat_uuid); return; }
      let current = chat;
      if (!current) {
        await draft.flush();
        current = await api.createAssistantChat(companyId, detail,draft.data.context.creation_key);
        draft.replaceFor(current.id,draft.data);
        viewedChat.current = current.id; setChat({ ...current, mode }); setChats(previous => [{ ...current!, mode }, ...previous]);
      }
      const command = target ? "revise_artifact" : "ask";
      const signature = JSON.stringify({ text, mode, command, target: target?.id, filters });
      if (!retry.current || retry.current.signature !== signature || retry.current.chatId !== current.id) retry.current = { signature, chatId: current.id, key: crypto.randomUUID(), clientId: crypto.randomUUID() };
      const attempt = retry.current;
      const next = await api.createAssistantMessage(current.id, { schema_version: 2, mode, command, company_uuid: companyId, text, response_detail: detail, context: filters, target_artifact_uuid: target?.id, context_labels: [...context.map(item => item.label), ...(period ? [period.from + " — " + period.to] : [])], idempotency_key: attempt.key, client_message_id: attempt.clientId });
      setRun(next); draft.replaceFor(current.id,{...draft.data,text:""}); if (!chat) draft.clearNew(); setTarget(undefined); await refreshMessages(current.id);
    } catch (failure) { handleError(failure); }
    finally { sending.current = false; setBusy(false); }
  }
  async function exportFile(format: string, content: "conversation" | "graphics_report") {
    if (!chat) return;
    setBusy(true);
    try { const job = await api.createAssistantExport(chat.id, { format, content, idempotency_key: crypto.randomUUID() }); setExports(previous => [...previous, job]); setExportOpen(null); }
    catch (failure) { handleError(failure); }
    finally { setBusy(false); }
  }
  if (!open) return null;
  return <section ref={workspace} className={["assistant-workspace", expanded ? "is-expanded" : "", historyOpen ? "has-history-open" : "",panelWidths.resizing?"is-resizing":"",cssClass({"--assistant-history-width":panelWidths.widths.left+"px","--assistant-inspector-width":panelWidths.widths.right+"px"})].join(" ")} aria-label="Поиск и исследование звонков">
    <aside id={panelWidths.ids.left} className={"assistant-history " + (historyOpen ? "is-open" : "")} aria-hidden={!historyOpen}>{historyOpen&&expanded&&<div className="assistant-sidebar-resizer is-left" {...panelWidths.separator("left")}/> }<header><strong>Чаты</strong><ToolButton label="Новый чат" onClick={newChat} disabled={!historyOpen || busy || renameBusy}><Plus size={17}/></ToolButton><ToolButton className="assistant-history-close" label="Закрыть список чатов" onClick={() => setHistoryOpen(false)} disabled={!historyOpen}><X size={17}/></ToolButton></header>
      <label className="assistant-history-search"><Search size={15}/><input type="search" aria-label="Поиск в чатах" placeholder="Поиск в чатах…" value={historyQuery} onChange={event => setHistoryQuery(event.target.value)} disabled={!historyOpen} tabIndex={historyOpen ? 0 : -1}/></label>
      <div className="assistant-history-list">{filteredChats.map(item => <div className={"assistant-chat-row " + (chat?.id === item.id ? "active" : "")} key={item.id}>
        {renaming?.id === item.id ? <form className="assistant-chat-rename" onSubmit={event => { event.preventDefault(); void renameChat(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!renameBusy) setRenaming(undefined); } }}><input autoFocus aria-label="Название чата" maxLength={120} value={renaming.title} disabled={renameBusy} onChange={event => setRenaming({id:item.id,title:event.target.value})}/><button type="submit" aria-label="Сохранить название чата" disabled={renameBusy || !renaming.title.trim()}><Check size={15}/></button><button type="button" aria-label="Отменить переименование" disabled={renameBusy} onClick={() => setRenaming(undefined)}><X size={15}/></button></form> : <><button type="button" aria-label={item.title} aria-current={chat?.id === item.id ? "true" : undefined} tabIndex={historyOpen ? 0 : -1} disabled={!historyOpen || busy || renameBusy} onClick={() => chooseChat(item)}><MessageSquare size={17}/><span className="assistant-chat-row-copy"><strong>{item.title}</strong><small>{item.preview || (item.mode === "research" ? "Исследование звонков" : "Поиск по разговорам")}</small></span><time className="assistant-chat-time" dateTime={item.updated_at || item.created_at}>{chatDate(item.updated_at || item.created_at)}</time></button><div className="assistant-chat-actions"><ToolButton label={"Переименовать чат «" + item.title + "»"} disabled={!historyOpen || busy || renameBusy} onClick={() => setRenaming({id:item.id,title:item.title})}><Pencil size={14}/></ToolButton><ToolButton label={"Удалить чат «" + item.title + "»"} disabled={!historyOpen || busy || renameBusy} onClick={() => void removeChat(item.id)}><Trash2 size={14}/></ToolButton></div></>}
      </div>)}{!filteredChats.length && <p>{historyQuery.trim() ? "Чаты не найдены. Попробуйте другое название." : "Здесь появятся ваши исследования."}</p>}</div>
    </aside>
    <header className="assistant-header"><ToolButton label={historyOpen ? "Скрыть историю" : "История чатов"} aria-pressed={historyOpen} onClick={() => setHistoryOpen(value => !value)}><PanelLeft size={17}/></ToolButton>
      <div className="assistant-brand"><SearchCheck size={21}/><div><strong>Работа со звонками</strong><small>Поиск и исследование</small></div></div>{scopeControl}
      <div className="assistant-head-actions">{chat && <AssistantExportMenu label="Экспорт" open={exportOpen === "conversation"} onOpenChange={value => setExportOpen(value ? "conversation" : null)} format={exportFormat} onFormatChange={chooseExportFormat} onExport={() => void exportFile(exportFormat,"conversation")} disabled={busy}/>}
        <ToolButton className="assistant-expand-action" label={expanded ? "Компактный вид" : "Развернуть"} onClick={() => {setExpanded(!expanded); if (!expanded && !window.matchMedia("(max-width:900px)").matches) {setHistoryOpen(true);if(latestAnswer)setPanel("attachments");}}}>{expanded ? <Minimize2 size={17}/> : <Expand size={17}/>}</ToolButton><ToolButton label="Свернуть помощника" onClick={() => setOpen(false)}><X size={17}/></ToolButton></div>
    </header>
    <div className="assistant-body"><main className="assistant-conversation">
      <div className="assistant-context"><AssistantModeSwitch value={mode} disabled={busy || !draft.loaded || (active && !["awaiting_user","paused"].includes(run?.state ?? ""))} onChange={value => void changeMode(value)}/><div className="assistant-context-actions">{mode === "research" && <ChoiceMenu label="Размер ответа" value={detail} options={[{ value: "brief", label: "Кратко" }, { value: "auto", label: "Автоматически" }, { value: "detailed", label: "Подробно" }]} onChange={value => setDetail(value as Detail)}/>}<ToolButton label="Новый чат" disabled={busy} onClick={newChat}><Plus size={16}/></ToolButton></div></div>
      <div ref={scroll} className="assistant-scroll" aria-live="polite">
        {!messages.length && !run && <div className="assistant-empty"><Search size={28}/><strong>Найдите ответ в разговорах</strong><p>Выберите режим и добавьте звонки или папки через + и @.</p></div>}
        {visibleMessages.map(message => {
          const labels = message.blocks?.find(block => block.type === "context")?.data?.labels ?? [];
          const grounded = message.blocks?.filter(block => block.type === "grounded_text") ?? [];
          const search = message.blocks?.find(block => block.type === "search_results")?.data as ContentSearchResponse | undefined;
          const exported = message.blocks?.find(block => block.type === "export_job")?.data as AssistantExport | undefined;
          const parentId = message.research?.selection?.run_uuid;
          const messageSources = [...new Map((message.sources ?? []).map(source => [source.id, source])).values()];
          const messageGraphics = graphics.filter(graphic => message.research?.graphics?.some(item => item.id === graphic.id) || grounded.some(block => block.data?.artifact_ids?.includes(graphic.id)));
          return <article key={message.id} className={"assistant-message " + message.role + (animateMessage === message.id ? " is-new" : "")}>
            {editing?.message.id === message.id && <form className="assistant-message-editor" onSubmit={event => {event.preventDefault();void saveMessageEdit();}}><label>Редактирование сообщения<textarea aria-label="Текст сообщения" autoFocus rows={4} maxLength={12000} value={editing.text} onChange={event => setEditing({...editing,text:event.target.value})}/></label><small>Ответ и последующие сообщения будут сформированы заново по исправленному запросу.</small><div><button className="primary-button small" disabled={busy || !editing.text.trim() || editing.text.trim() === editing.message.text.trim()} type="submit">Сохранить и отправить</button><button className="ghost-button small" disabled={busy} type="button" onClick={() => setEditing(undefined)}>Не изменять</button></div></form>}
            {labels.length > 0 && <div className="assistant-message-context" aria-label="Вложения сообщения">{labels.map((label, index) => <span key={label + index}><Paperclip size={12}/>{label}</span>)}</div>}
            {search ? <SearchResults result={search} companyId={companyId} onOpen={onOpenCall} onError={handleError}/> : <div className="assistant-prose">{grounded.length ? grounded.map((block, index) => <div className="assistant-answer-part" key={index}><ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text ?? ""}</ReactMarkdown></div>) : <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>}</div>}
            {exported && <AssistantExportLink initial={exported} onError={handleError}/>}
            <footer>
              {resourcesOpen && message.id !== latestAnswer?.id && (messageSources.length > 0 || messageGraphics.length > 0 || message.id === latestReportMessage?.id) && <div className="assistant-message-resources assistant-evidence-links" aria-label="Материалы ответа">
                {messageSources.length > 0 && <button type="button" onClick={() => showSource(message.id, messageSources[0].id)}><Link2 size={15} aria-hidden="true"/>Источники · {messageSources.length}</button>}
                {message.role === "assistant" && messageGraphics.length > 0 && <button type="button" onClick={() => showGraphic(messageGraphics[0].id)}><Paperclip size={15} aria-hidden="true"/>Диаграммы · {messageGraphics.length}</button>}
                {message.id === latestReportMessage?.id && <AssistantExportMenu label="Скачать отчёт" ariaLabel="Скачать отчёт по исследованию" open={exportOpen === "graphics_report"} onOpenChange={value => setExportOpen(value ? "graphics_report" : null)} format={exportFormat} onFormatChange={chooseExportFormat} onExport={() => void exportFile(exportFormat,"graphics_report")} disabled={busy}/>}
              </div>}
              {resourcesOpen && message.id !== latestAnswer?.id && parentId && message.research?.calculations.some(item => item.method === "semantic") && !messages.some(item => item.sequence > message.sequence && item.research?.selection?.run_uuid === parentId) && <button type="button" className="assistant-previous-refresh" disabled={active || busy} onClick={() => api.rebuildAssistantContent(parentId).then(setRun).catch(handleError)}>Обновить анализ</button>}
              <div className="assistant-message-meta"><time dateTime={message.created_at}>{time(message.created_at)}</time>{message.id !== latestAnswer?.id && <ToolButton label={copied === message.id ? "Текст скопирован" : "Копировать текст сообщения"} onClick={() => void copyMessage(message)}>{copied === message.id ? <Check size={14}/> : <Copy size={14}/>}</ToolButton>}{message.editable && <ToolButton label="Редактировать сообщение" disabled={busy} onClick={() => setEditing({message,text:message.text,key:crypto.randomUUID(),clientId:crypto.randomUUID()})}><Pencil size={14}/></ToolButton>}{parentId && newCounts[parentId] > 0 && <span className="assistant-new-calls" tabIndex={0} title={"Новых записей в выбранных материалах: " + newCounts[parentId] + ". Содержание ещё не проверено."} aria-label={"Новых записей: " + newCounts[parentId]}>· новые записи</span>}</div>
            </footer>
          </article>;
        })}
        {run && !terminal.has(run.state) && <div className="assistant-run-status"><p className="assistant-progress"><span className={"assistant-processing-mark " + (run.state === "awaiting_user" || run.state === "paused" ? "is-waiting" : "")} aria-hidden="true"><i/><i/><i/></span>{statusUnavailable ? "Связь с сервером прервана. Обновление статуса повторится автоматически." : progressLabel(run)}{!statusUnavailable && run.progress?.selected_calls ? " · Проверено " + run.progress.checked_calls + " из " + run.progress.selected_calls : ""}{!statusUnavailable && run.state === "processing" && run.progress?.total_parts ? " · Часть материала " + Math.min((run.progress.checked_parts ?? 0) + 1, run.progress.total_parts) + " из " + run.progress.total_parts : ""}</p>
          {run.state === "awaiting_user" && run.user_request?.delivery !== "chat" && <AssistantRequests run={run} onChanged={value => { setRun(value); if (value.mode) setMode(value.mode); if (value.state === "completed") void refreshMessages(value.chat_uuid); }} onError={handleError} onOpenCall={onOpenCall}/>}
          {run.state === "paused" && <p className="assistant-notice">{errorLabels[run.error_code ?? ""] ?? "Запрос приостановлен. Выполненные проверки сохранены."}</p>}
          <div className="assistant-run-actions">{run.state === "paused" && <button type="button" className="ghost-button small" onClick={() => api.resumeAssistantRun(run.id).then(setRun).catch(handleError)}>Продолжить</button>}</div>
        </div>}
        {run && (run.state === "cancelled" || run.state === "failed") && <div className="assistant-run-status"><p className="assistant-notice">{run.state === "cancelled" ? "Запрос отменён. Завершённые проверки сохранены." : errorLabels[run.error_code ?? ""] ?? "Запрос не завершён. Непроверенный ответ не опубликован."}{run.progress?.selected_calls ? " Проверено " + run.progress.checked_calls + " из " + run.progress.selected_calls + " записей." : ""}</p><button type="button" className="ghost-button small" onClick={() => api.resumeAssistantRun(run.id).then(setRun).catch(handleError)}>Продолжить</button></div>}
        {exports.map(job => <AssistantExportLink initial={job} key={job.id} onError={handleError}/>)}
        {error && <p className="assistant-error" role="alert">{error}</p>}
      </div>
      <form onSubmit={submit} className="assistant-compose-area">
        {hasResources && <AssistantCollapse open={resourcesOpen} id={resourcesId}><div className="assistant-resources-panel" aria-label="Материалы последнего ответа">
          <div className="assistant-message-resources assistant-evidence-links">
            {answerSources.length > 0 && <button type="button" onClick={() => showSource(latestAnswer!.id,answerSources[0].id)}><Link2 size={15}/>Источники · {new Set(answerSources.map(source => source.id)).size}</button>}
            {answerGraphics.length > 0 && <button type="button" onClick={() => showGraphic(answerGraphics[0].id)}><Paperclip size={15}/>Диаграммы · {answerGraphics.length}</button>}
            {latestReportMessage?.id === latestAnswer?.id && <AssistantExportMenu label="Скачать отчёт" ariaLabel="Скачать отчёт по исследованию" open={exportOpen === "graphics_report"} onOpenChange={value => setExportOpen(value ? "graphics_report" : null)} format={exportFormat} onFormatChange={chooseExportFormat} onExport={() => void exportFile(exportFormat,"graphics_report")} disabled={busy}/>}
          </div>
          <div className="assistant-message-meta"><ToolButton label={copied === latestAnswer!.id ? "Текст скопирован" : "Копировать текст сообщения"} onClick={() => void copyMessage(latestAnswer!)}>{copied === latestAnswer!.id ? <Check size={14}/> : <Copy size={14}/>}</ToolButton>{latestAnswer?.research?.selection?.run_uuid && latestAnswer.research.calculations.some(item => item.method === "semantic") && <button type="button" disabled={active || busy} onClick={() => api.rebuildAssistantContent(latestAnswer.research!.selection!.run_uuid!).then(setRun).catch(handleError)}>Обновить анализ</button>}</div>
        </div></AssistantCollapse>}
        <div className="assistant-context-row"><div className="assistant-context-chips">{context.map(item => <span key={item.kind + ":" + item.id}>{item.kind === "call" ? <Phone size={13}/> : <Folder size={13}/>}<span>{item.label}</span><button type="button" aria-label={"Убрать " + item.label} onClick={() => setContext(previous => previous.filter(value => value !== item))}><X size={12}/></button></span>)}{period ? <span><CalendarRange size={13}/>{period.from + " — " + period.to}<button type="button" aria-label="Убрать период" onClick={() => setPeriod(null)}><X size={12}/></button></span> : <button className="assistant-period-control" type="button" onClick={() => setPickerOpen(value => !value)}>Весь период<ChevronDown size={13}/></button>}</div>{hasResources && <button className="assistant-resources-toggle" type="button" aria-label={resourcesOpen ? "Скрыть источники и результаты" : "Показать источники и результаты"} aria-expanded={resourcesOpen} aria-controls={resourcesId} onClick={toggleResources}><ChevronDown size={17}/></button>}</div>
        {target && <div className="assistant-revision-target">Корректировка: {target.title}<button type="button" aria-label="Отменить выбор диаграммы" onClick={() => setTarget(undefined)}><X size={13}/></button></div>}
        {pickerOpen && <AssistantContextPicker companyId={companyId} searchTerm={mentionTerm(query)} onClose={closePicker} onSelect={item => { setContext(previous => previous.some(value => value.kind === item.kind && value.id === item.id) ? previous : [...previous, item]); setQuery(query.replace(/(?:^|\s)@[^\s]*$/, "").trimEnd()); setPickerOpen(false); }} onPeriod={(from, to) => setPeriod({ from, to })}/>}
        <div className="assistant-composer"><ToolButton label="Добавить материалы (@)" aria-expanded={pickerOpen} onClick={() => setPickerOpen(value => !value)}><Plus size={20}/></ToolButton>
          <textarea ref={textarea} aria-label="Запрос по звонкам" value={query} disabled={!draft.loaded || busy} onChange={event => { const value = event.target.value; setQuery(value); setPickerOpen(/(?:^|\s)@[^\s]*$/.test(value)); }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !pickerOpen) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={chatAnswer ? "Ответьте на вопросы в чате…" : "Спросите о звонках…"} rows={1} maxLength={12000}/>
          {working ? <button type="button" className="assistant-send" disabled={busy || run?.pause_requested} onClick={() => void pauseRun()} aria-label={run?.pause_requested ? "Приостанавливаю исследование" : "Приостановить исследование"}><Pause size={18}/></button> : <button type="submit" className="assistant-send" disabled={busy || !draft.loaded || !query.trim() || (active && !chatAnswer)} aria-label="Отправить запрос"><Send size={18}/></button>}
        </div>
        <small className="assistant-compose-hint">+ или @ — добавить звонки и папки</small>
      </form>
    </main>
    {(expanded || panel) && <aside id={panelWidths.ids.right} className={"assistant-inspector " + (panel ? "" : "is-collapsed")}>{panel&&expanded&&<div className="assistant-sidebar-resizer is-right" {...panelWidths.separator("right")}/> }<nav ref={panelTabs} className="assistant-inspector-tabs" aria-label="Материалы исследования"><AssistantPanelIndicator root={panelTabs} value={panel}/>{panelOptions.map(({ id, Icon, label }) => <ToolButton key={id} label={label} aria-pressed={panel === id} onClick={() => setPanel(value => value === id ? null : id)}><Icon size={17}/>{panel && id !== "sources" && <span>{label}</span>}</ToolButton>)}<ToolButton label={panel ? "Свернуть панель" : "Развернуть правую панель"} onClick={() => setPanel(value => value ? null : "attachments")}>{panel ? <X size={17}/> : <PanelRightOpen size={17}/>}</ToolButton></nav>
      {panel && <div className="assistant-inspector-content">{panel === "sources" && <header><strong>Источники</strong></header>}
        {panel === "sources" ? sources.length ? sources.map(source => <AssistantSourceCard key={source.id} source={source} messageId={messages.find(message => message.sources?.some(item => item.id === source.id))?.id ?? ""} highlighted={highlightedSource === source.id} onOpen={() => void openSource(source)} onError={handleError}/>) : <p>Здесь появятся основания конкретного ответа.</p> : <>
          {panel === "attachments" && <AssistantResearchSummary message={inspectedAnswer}/>}
          {panel === "attachments" && inspectedSources.length > 0 && <section className="assistant-summary-sources" aria-label="Использованные источники"><h3>Использованные источники</h3><div className="assistant-summary-source-list">{inspectedSources.slice(0, 3).map(source => <button type="button" className="assistant-summary-source" key={source.id} onClick={() => showSource(inspectedAnswer!.id, source.id)}><FileText size={17}/><span>{source.call_title || "Источник разговора"}</span></button>)}</div>{inspectedSources.length > 3 && <button type="button" className="assistant-summary-more" onClick={() => showSource(inspectedAnswer!.id, inspectedSources[3].id)}>+{inspectedSources.length - 3} источников</button>}</section>}
          {panel === "graphics" && graphics.length > 0 && <div className="assistant-graphics-list">{graphics.map(item => <button type="button" key={item.id} aria-pressed={graphic?.id === item.id} onClick={() => setSelectedGraphic(item.id)}>{item.title}</button>)}</div>}
          {panel === "graphics" && graphic && <AssistantGraphicPanel graphic={graphic} onRevise={revise} onOpenCall={onOpenCall} onError={handleError}/>}
          {panel === "attachments" && context.map(item => <div className="assistant-attached-item" key={item.id}><Paperclip size={15}/>{item.label}</div>)}
          {!graphics.length && <p>{panel === "graphics" ? "В этом ответе нет диаграмм. Они появятся, когда в исследовании будут данные для сравнения." : !latestAnswer?.research ? "Здесь появятся итоги исследования и использованные материалы." : "Итог исследования приведён выше. Диаграмм для этого ответа нет."}</p>}
        </>}
      </div>}
    </aside>}
    </div>
  </section>;
}

function SearchResults({ result, companyId, onOpen, onError }: { result: ContentSearchResponse; companyId: string; onOpen: (id: string) => void; onError: (error: unknown) => void }) {
  const [page, setPage] = useState(result), [loading, setLoading] = useState(false);
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());
  useEffect(() => { setPage(result); setExpandedCalls(new Set()); }, [result]);
  const calls = useMemo(() => {
    const grouped = new Map<string, ContentSearchResponse["items"]>();
    for (const item of page.items) {
      const items = grouped.get(item.call_uuid) ?? [];
      if (!items.some(existing => existing.chunk_uuid === item.chunk_uuid)) items.push(item);
      grouped.set(item.call_uuid,items);
    }
    return [...grouped.entries()];
  }, [page.items]);
  async function more() { if (!page.next_cursor || loading) return; setLoading(true); try { const next = await api.contentSearch(companyId, "", { cursor: page.next_cursor }); setPage(previous => ({ ...next, items: [...previous.items, ...next.items] })); } catch (failure) { onError(failure); } finally { setLoading(false); } }
  function openMoment(item:ContentSearchResponse["items"][number]) {
    onOpen(item.call_uuid); const url = new URL(window.location.href);
    url.searchParams.set("source_revision",String(item.transcription_revision));
    if (typeof item.start_seconds === "number") url.searchParams.set("evidence_time",String(item.start_seconds)); else url.searchParams.delete("evidence_time");
    window.history.replaceState({}, "", url); window.dispatchEvent(new PopStateEvent("popstate"));
  }
  return <div className="assistant-search-results">{calls.map(([id,items]) => {
    const item = items[0], expanded = expandedCalls.has(id);
    return <article className="assistant-result-call" key={id}><header><button className="assistant-call-link" type="button" onClick={() => onOpen(id)}><Phone size={17}/><strong>{item.title}</strong></button><button className="assistant-result-expand" type="button" aria-expanded={expanded} aria-label={(expanded ? "Скрыть совпадения: " : "Раскрыть звонок: ")+item.title} onClick={() => setExpandedCalls(previous => {const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;})}>{expanded ? "Скрыть" : "Подробнее"}</button></header>
      {item.created_at && <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString("ru-RU")}</time>}
      {expanded && <div className="assistant-call-matches">{items.map(match => <div key={match.chunk_uuid}><blockquote>{match.quote}</blockquote><button type="button" onClick={() => openMoment(match)}>{typeof match.start_seconds === "number" ? "Открыть момент · "+Math.floor(match.start_seconds/60)+":"+String(Math.floor(match.start_seconds%60)).padStart(2,"0") : "Открыть звонок"}</button></div>)}</div>}
    </article>;
  })}{page.warnings?.map(warning => <p className="assistant-notice" key={warning}>{warning}</p>)}{page.next_cursor && <button className="ghost-button small" type="button" disabled={loading} onClick={() => void more()}>{loading ? "Загрузка…" : "Ещё звонки"}</button>}{page.items.length === 0 && <p className="assistant-notice">{page.evaluated_calls === 0 ? "В выбранном контексте нет доступных звонков." : page.index_ready_calls === 0 ? "Выбранные звонки ещё не готовы к поиску." : "Подходящие звонки не найдены."}</p>}</div>;
}
