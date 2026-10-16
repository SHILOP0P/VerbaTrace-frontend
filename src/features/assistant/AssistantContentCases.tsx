import type { AssistantContentCase, AssistantGraphic } from "../../types";

const statuses:Record<string,string>={correct:"Верно",incorrect:"Ошибка",deviation:"Отклонение",uncertain:"Недостаточно данных"};
const bases:Record<string,string>={transcript_correction:"Исправление в разговоре",published_qa:"Опубликованная проверка",criterion:"Заданный критерий",subject_matter:"Предметная оценка ИИ",external_reference:"Авторитетный внешний источник",insufficient:"Недостаточно оснований"};
const stamp=(seconds?:number)=>seconds===undefined?"":Math.floor(seconds/60)+":"+String(Math.floor(seconds%60)).padStart(2,"0");

export function AssistantContentCases({items,graphic,onOpenCall}:{items:AssistantContentCase[];graphic:AssistantGraphic;onOpenCall:(id:string)=>void}){
 return <div className="assistant-content-cases">{items.map(item=><section key={item.id} className="assistant-content-case">
  <button type="button" className="assistant-case-call" onClick={()=>onOpenCall(item.call_uuid)}>{item.call_title}</button>
  <h4>{item.topic} · {item.question}</h4>
  <p className="assistant-case-result">{statuses[item.initial_status]??item.initial_status} → {statuses[item.final_status]??item.final_status}{item.correction!=="none"&&<span>{item.correction==="self"?"Исправлено самостоятельно":"Исправлено после подсказки"}</span>}</p>
  <dl><dt>Ответ</dt><dd>{item.actual}</dd><dt>Ожидаемый ответ</dt><dd>{item.expected}</dd><dt>Основание</dt><dd>{bases[item.basis]??item.basis}. {item.explanation}</dd></dl>
  {item.evidence.map((e,index)=><blockquote key={index}><small>{stamp(e.start_seconds)}</small>{e.quote}</blockquote>)}
  {item.correction_evidence.map((e,index)=><blockquote className="assistant-case-correction" key={index}><small>Исправление {stamp(e.start_seconds)}</small>{e.quote}</blockquote>)}
  {item.reference_ids.map(id=>{const ref=graphic.calculation.content?.references.find(value=>value.id===id);return ref&&<a href={ref.url} key={id} target="_blank" rel="noreferrer">{ref.title||"Внешний источник"}</a>;})}
 </section>)}{!items.length&&<p>Нет подходящих эпизодов.</p>}</div>;
}
