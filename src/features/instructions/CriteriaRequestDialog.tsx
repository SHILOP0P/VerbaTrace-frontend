import {useEffect,useRef,useState} from "react";
import {api} from "../../api";
import type {CriterionCatalogue,FolderCriteriaRequest} from "../../types";

export function CriteriaRequestDialog({id,onClose}:{id:string;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close()},[]);
  const [request,setRequest]=useState<FolderCriteriaRequest>();
  const [catalogue,setCatalogue]=useState<CriterionCatalogue>();
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{let cancelled=false;api.getCriteriaRequest(id).then(async value=>{const choices=value.department_uuid?await api.getDepartmentCriteria(value.department_uuid):await api.getFolderCriteria(value.folder_uuid);if(!cancelled){setRequest(value);setCatalogue(choices)}}).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:"Запрос недоступен.")});return()=>{cancelled=true}},[id]);
  async function decide(approve:boolean){setBusy(true);setError("");try{setRequest(await api.decideCriteriaRequest(id,approve))}catch(cause){setError(cause instanceof Error?cause.message:"Не удалось принять решение.")}finally{setBusy(false)}}
  const labels={pending:"Ожидает решения",approved:"Одобрен",rejected:"Отклонён",outdated:"Настройки изменились — нужен новый запрос"};
  return <dialog ref={dialog} className="criteria-request-dialog" aria-label="Запрос на изменение критериев" onCancel={event=>{event.preventDefault();if(!busy)onClose()}} onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose()}}><header><h2>Изменение критериев {request?.department_uuid?"отдела":"папки"}</h2><button className="ghost-button small" disabled={busy} onClick={onClose}>Закрыть</button></header>{error&&<p className="field-error" role="alert">{error}</p>}{request?<><h3>{request.folder_name}</h3><p>{labels[request.status]}</p><p>Предлагаемый набор · {request.criterion_keys.filter(key=>catalogue?.items.some(item=>item.active&&item.criterion.criterion_key===key)).length} / 40</p><ul>{request.criterion_keys.map(key=><li key={key}>{catalogue?.items.find(item=>item.criterion.criterion_key===key)?.criterion.title||"Критерий больше недоступен"}</li>)}</ul>{request.can_decide&&<footer><button className="ghost-button small" disabled={busy} onClick={()=>void decide(false)}>Отклонить</button><button className="primary-button small" disabled={busy} onClick={()=>void decide(true)}>Одобрить и применить</button></footer>}</>:!error&&<p role="status">Загружаем запрос…</p>}</dialog>;
}
