import {useEffect,useState} from "react";
import {api} from "../../api";
import type {ReferenceAssignment,ReferenceAssignmentsResponse,ReferenceTarget} from "../../types";

function key(target:ReferenceTarget|ReferenceAssignment){return [target.scope,target.user_uuid,target.company_uuid,target.department_uuid,target.folder_uuid].join("/")}
const labels={personal:"Личная подборка",company:"Компания",department:"Отдел",folder:"Папка"};
export function ReferenceCallEditor({callId,onClose}:{callId:string;onClose:()=>void}){
  const [data,setData]=useState<ReferenceAssignmentsResponse>();
  const [selected,setSelected]=useState<string[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{let cancelled=false;api.getReferenceAssignments(callId).then(value=>{if(!cancelled){setData(value);setSelected(value.assignments.map(key))}}).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:"Подборки недоступны.")});return()=>{cancelled=true}},[callId]);
  const targets=new Map<string,ReferenceTarget>();data?.targets.forEach(target=>targets.set(key(target),target));data?.assignments.forEach(assignment=>{if(!targets.has(key(assignment)))targets.set(key(assignment),{...assignment,available:assignment.can_edit})});
  async function save(){if(!data)return;setBusy(true);setError("");try{const values=selected.flatMap(value=>targets.get(value)??[]);await api.replaceReferences(callId,values.map(({scope,user_uuid,company_uuid,department_uuid,folder_uuid})=>({scope,user_uuid,company_uuid,department_uuid,folder_uuid})));onClose()}catch(cause){setError(cause instanceof Error?cause.message:"Не удалось сохранить метку.")}finally{setBusy(false)}}
  return <section className="reference-call-editor"><header><h3>Эталонный звонок</h3><button className="ghost-button small" onClick={onClose}>Закрыть</button></header><p>Образец хорошей работы. Участники выбранных подборок получат доступ к звонку.</p>{error&&<p className="field-error" role="alert">{error}</p>}{!data?!error&&<p role="status">Загружаем подборки…</p>:<><div className="reference-call-targets">{Array.from(targets.entries()).map(([id,target])=><label className="checkbox-row" key={id}><input type="checkbox" checked={selected.includes(id)} disabled={busy||(!target.available&&!data.assignments.some(item=>key(item)===id&&item.can_edit))} onChange={()=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])}/><span>{labels[target.scope]} · {target.name}{!target.available&&!selected.includes(id)?" · недоступно на текущем тарифе или по роли":""}</span></label>)}</div>{data.targets.some(target=>target.available)||data.assignments.some(item=>item.can_edit)?<button className="primary-button small" disabled={busy} onClick={()=>void save()}>{busy?"Сохраняем…":"Сохранить метку"}</button>:<p className="muted">Метка доступна для просмотра. Изменять её может руководитель с соответствующими правами.</p>}</>}</section>;
}
