import { Check, MessageSquareText, Pencil, X } from "lucide-react";
import { useState } from "react";
import { api } from "../../api";
import type { AnalysisComment } from "../../types";
import { formatDate } from "../../shared/lib/formatters";
import { SelectControl } from "../../shared/ui/primitives";

type CriterionOption = { key: string; title: string };
type Props = { callId: string; analysisId: string; comments: AnalysisComment[]; canComment: boolean; onChange: (comments: AnalysisComment[]) => void; title?: string; subtitle?: string; placeholder?: string; criteria?: CriterionOption[]; /** Names of criteria a comment may point at, without offering them for new comments. */ criterionTitles?: ReadonlyMap<string, string> };

export function AnalysisComments({ callId, analysisId, comments, canComment, onChange, title = "Обсуждение анализа", subtitle = "Комментарии не изменяют официальную оценку", placeholder = "Оставьте комментарий к анализу…", criteria = [], criterionTitles }: Props) {
  const [body,setBody] = useState("");
  const [editing,setEditing] = useState<string>();
  const [editBody,setEditBody] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [criterionKey,setCriterionKey] = useState("");
  const criteriaByKey = new Map([...(criterionTitles ?? new Map<string, string>()), ...criteria.map((criterion): [string, string] => [criterion.key, criterion.title])]);

  async function create() {
    const value=body.trim(); if (!value || busy) return;
    setBusy(true); setError("");
    try { const item=await api.createAnalysisComment(callId,analysisId,value,criterionKey || undefined); onChange([...comments,item]); setBody(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось опубликовать комментарий"); }
    finally { setBusy(false); }
  }
  async function save(item: AnalysisComment) {
    const value=editBody.trim(); if (!value || busy) return;
    setBusy(true); setError("");
    try { const updated=await api.updateAnalysisComment(item.comment_uuid,item.lock_version,value); onChange(comments.map((entry)=>entry.comment_uuid===updated.comment_uuid?updated:entry)); setEditing(undefined); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось изменить комментарий"); }
    finally { setBusy(false); }
  }
  return <section className="analysis-comments" aria-labelledby="analysis-comments-title">
    <header><span><MessageSquareText size={20}/><span><strong id="analysis-comments-title">{title}</strong><small>{subtitle}</small></span></span><b>{comments.length}</b></header>
    {comments.length>0 ? <div className="analysis-comments-list">{comments.map((item)=><article key={item.comment_uuid}>
      <div className="analysis-comment-head"><span><strong>{item.author_name}</strong><small>{item.criterion_key ? `Критерий: ${criteriaByKey.get(item.criterion_key) ?? "из анализа"} · ` : ""}{formatDate(item.created_at)}{item.edited_at ? ` · изменено ${formatDate(item.edited_at)}` : ""}</small></span>{item.can_edit && editing!==item.comment_uuid && <button className="icon-button" type="button" aria-label="Изменить свой комментарий" onClick={()=>{setEditing(item.comment_uuid);setEditBody(item.body);setError("");}}><Pencil size={16}/></button>}</div>
      {editing===item.comment_uuid ? <div className="analysis-comment-editor"><textarea autoFocus maxLength={4000} value={editBody} onChange={(e)=>setEditBody(e.target.value)}/><div><small>{editBody.length}/4000</small><button className="icon-button" type="button" aria-label="Отменить редактирование" onClick={()=>setEditing(undefined)}><X size={17}/></button><button className="primary-button small" type="button" disabled={busy||!editBody.trim()} onClick={()=>void save(item)}><Check size={16}/>Сохранить</button></div></div> : <p>{item.body}</p>}
    </article>)}</div> : <p className="analysis-comments-empty">Комментариев пока нет.</p>}
    {canComment && <div className="analysis-comment-composer">{criteria.length > 0 && <label><span>Критерий</span><SelectControl aria-label="Критерий комментария" value={criterionKey} onChange={(event)=>setCriterionKey(event.currentTarget.value)}><option value="">Общий комментарий</option>{criteria.map((criterion)=><option key={criterion.key} value={criterion.key}>{criterion.title}</option>)}</SelectControl></label>}<textarea maxLength={4000} value={body} placeholder={placeholder} onChange={(e)=>setBody(e.target.value)}/><div><small>{body.length}/4000</small><button className="primary-button" type="button" disabled={busy||!body.trim()} onClick={()=>void create()}>{busy?"Сохраняю…":"Опубликовать"}</button></div></div>}
    {error && <div className="form-error is-dismissible" role="alert">{error}</div>}
  </section>;
}
