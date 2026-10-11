import { useEffect, useState } from "react";
import { api } from "../../api";
import type { CriterionCatalogue } from "../../types";
import { CriterionPicker } from "../instructions/CriterionPicker";

export function AnalysisCriterionPicker({callId,busy,onStart,onClose}:{callId:string;busy:boolean;onStart:(keys:string[])=>void;onClose:()=>void}) {
  const [catalogue,setCatalogue] = useState<CriterionCatalogue>();
  const [selected,setSelected] = useState<string[]>([]);
  const [error,setError] = useState("");
  useEffect(()=>{
    let cancelled=false;
    api.getCriterionCatalogue({call_uuid:callId}).then(value=>{
      if(cancelled)return;
      setCatalogue(value);
      const defaults=value.items.filter(item=>item.active&&item.selected).map(item=>item.criterion.criterion_key);
      if(defaults.length<=40)setSelected(defaults);
      else setError("Набор содержит больше 40 критериев. Измените его в настройках папки или выберите критерии вручную.");
    }).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:"Критерии недоступны.")});
    return()=>{cancelled=true};
  },[callId]);
  return <section className="reference-call-editor" aria-label="Критерии для анализа"><header><h3>Критерии для анализа</h3><button className="ghost-button small" type="button" disabled={busy} onClick={onClose}>Закрыть</button></header>{error&&<p className="field-error" role="alert">{error}</p>}{catalogue?<><CriterionPicker catalogue={catalogue} selected={selected} onChange={setSelected} disabled={busy}/><button className="primary-button small" type="button" disabled={busy||selected.length>40||(catalogue.mandatory&&Boolean(error))} onClick={()=>onStart(selected)}>{busy?"Запускаем…":"Запустить анализ"}</button></>:!error&&<p role="status">Загружаем критерии…</p>}</section>;
}
