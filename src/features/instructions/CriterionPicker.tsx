import type {CriterionCatalogue,CriterionChoice} from "../../types";
import "./instruction-draft.css";

export function CriterionPicker({catalogue,selected,onChange,disabled=false,editable=false}:{catalogue:CriterionCatalogue;selected:string[];onChange:(keys:string[])=>void;disabled?:boolean;editable?:boolean}){
  const groups=new Map<string,{title:string;items:CriterionChoice[]}>();
  catalogue.items.forEach(item=>{const group=groups.get(item.instruction_uuid)??{title:item.instruction_title,items:[]};group.items.push(item);groups.set(item.instruction_uuid,group)});
  const activeKeys=new Set(catalogue.items.filter(item=>item.active).map(item=>item.criterion.criterion_key));
  const countActive=(keys:string[])=>keys.filter(key=>activeKeys.has(key)).length;
  const selectedCount=countActive(selected);
  const locked=disabled||(!catalogue.can_select&&!editable);
  function toggle(key:string){onChange(selected.includes(key)?selected.filter(value=>value!==key):selectedCount<40?[...selected,key]:selected)}
  function toggleGroup(items:CriterionChoice[]){const keys=items.filter(item=>item.active&&item.criterion.enabled&&!item.inherited&&(!item.protected||editable)).map(item=>item.criterion.criterion_key);const all=keys.every(key=>selected.includes(key));if(all)onChange(selected.filter(key=>!keys.includes(key)));else{const next=Array.from(new Set([...selected,...keys]));if(countActive(next)<=40)onChange(next)}}
  return <div className="criterion-picker"><p className="muted">Выбрано {selectedCount} / 40{catalogue.mandatory?" · обязательный набор папки":!catalogue.can_select?" · набор задан руководителем":""}</p>{Array.from(groups.entries()).map(([id,group])=>{
    const defaults=group.items.filter(item=>item.active&&item.criterion.enabled&&!item.inherited&&(!item.protected||editable)).map(item=>item.criterion.criterion_key);
    const selectedDefaults=defaults.every(key=>selected.includes(key));
    const exceeds=countActive(Array.from(new Set([...selected,...defaults])))>40;
    return <section key={id} className="criterion-picker-group"><header><strong>{group.title}</strong><button className="ghost-button small" type="button" disabled={locked||(!selectedDefaults&&exceeds)||defaults.length===0} onClick={()=>toggleGroup(group.items)}>{selectedDefaults?"Снять выбор":"Выбрать по умолчанию"}</button></header><div className="criterion-picker-list">{group.items.map(item=><label className={`checkbox-row${!item.active?" is-inactive":""}`} key={item.criterion.criterion_key}><input type="checkbox" checked={selected.includes(item.criterion.criterion_key)} disabled={locked||item.inherited||(!editable&&item.protected)||(!item.active&&!selected.includes(item.criterion.criterion_key))||(!selected.includes(item.criterion.criterion_key)&&selectedCount>=40)} onChange={()=>toggle(item.criterion.criterion_key)}/><span><strong>{item.criterion.title}</strong><small>{item.criterion.requirement}{item.inherited?" · унаследован от отдела":item.protected?" · назначено руководителем компании":""}{!item.active?" · неактивен":""}</small></span></label>)}</div></section>})}{!catalogue.items.length&&<p className="muted">Применённых критериев пока нет. Анализ может разобрать фактические вопросы разговора.</p>}</div>;
}
