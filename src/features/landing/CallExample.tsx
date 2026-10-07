import { useState } from "react";
import { ArrowRight, Check, FileText, Quote, ShieldCheck, ListTodo, MessageSquare, ChevronRight } from "lucide-react";
import { MotionSwitch } from "./Motion";
import { criteria, fragments } from "./data";

// Explanatory objects rather than a replacement for the authenticated call screen.
export function CallExample() {
  const [selected, setSelected] = useState(1);
  const [kind, setKind] = useState("requirement");
  const [showSource, setShowSource] = useState(true);
  const [step, setStep] = useState(0);
  const active = criteria[selected];
  const fragment = fragments[active.fragment];
  const question = kind === "question";
  const quote = question ? criteria[3].quote : "quote" in active ? active.quote : fragment.quote;
  const time = question ? "01:12" : "time" in active ? active.time : fragment.time;

  return <div className="c-evidence-playground" aria-label="Как вывод связан с разговором">
    <div className="c-evidence-picker"><span className="c-object-caption"><FileText size={16} />Пример: стандарт продаж</span><h3>Требования<br />и вопросы разговора</h3><p>Требования берутся из инструкции. Вопросы разговора рассматриваются отдельно.</p><div className="c-segmented" role="group" aria-label="Тип пункта"><button aria-pressed={!question} onClick={() => setKind("requirement")}>Требования</button><button aria-pressed={question} onClick={() => setKind("question")}>Вопросы</button></div>
      <MotionSwitch value={kind}>{!question ? <div className="c-requirement-list">{criteria.map((item,index) => <button key={item.title} aria-pressed={selected===index} onClick={() => {setSelected(index);setShowSource(true);}}><span>{item.title}</span><ChevronRight size={15}/></button>)}</div> : <div className="c-question-note"><MessageSquare size={20}/><strong>Возможна ли отсрочка платежа?</strong><p>Вопрос клиента. Ответ найден в разговоре.</p></div>}</MotionSwitch>
    </div>
    <MotionSwitch className="c-evidence-objects" value={`${kind}-${selected}-${showSource}`}>
      <article className="c-result-object" aria-live="polite"><div className="c-object-caption"><ShieldCheck size={17}/>{question ? "Вопрос клиента" : "Требование инструкции"}<span className={"c-badge c-badge-"+(question || active.score>=90 ? "good":"warn")}>{question ? "Ответ дан" : active.score>=90 ? "Выполнено" : "В основном выполнено"}</span></div><h3>{question ? "Возможна ли отсрочка платежа?" : active.title}</h3><p>{question ? "Отсрочка 14 дней для постоянных клиентов; на первую поставку предоплата 50%." : active.note}</p>{!question && <div className="c-object-score"><strong>{active.score}<small>/100</small></strong><span>Вес {active.weight}<small>Стандарт продаж</small></span></div>}<button className="c-text-link" aria-expanded={showSource} onClick={() => setShowSource(value=>!value)}>{showSource ? "Скрыть цитату" : "Показать цитату"}<ArrowRight size={16}/></button></article>
      {showSource && <div className="c-object-connector" aria-hidden="true"><i/><span>основано на словах</span><i/></div>}
      {showSource && <article className="c-quote-object"><div><span className="c-object-caption"><Quote size={17}/>Фрагмент разговора</span><time>{time}</time></div><blockquote>«{quote}»</blockquote><span>{question ? "Анна Смирнова" : active.speaker}</span></article>}
      {!question && active.score<90 && <div className="c-object-advice"><span><ArrowRight size={16}/>Что можно улучшить</span><p>{active.advice}</p></div>}
    </MotionSwitch>
    <div className="c-small-action"><div><ListTodo size={22}/><span><strong>Задача по итогам звонка</strong><small>Отправить КП по двум комплектациям · Анна Смирнова</small></span></div><div className="c-task-progress" aria-label="Статус примера задачи">{["Открыто","В работе","Выполнено"].map((label,index)=><span key={label} className={index<=step ? "is-active":""}>{index===2 && step===2 ? <Check size={13}/>:index+1}<small>{label}</small></span>)}</div><button className="c-button c-button-secondary" onClick={()=>setStep(value=>(value+1)%3)}><MotionSwitch value={step}>{step===0 ? "Начать выполнение" : step===1 ? "Отметить выполненной" : "Повторить пример"}<ArrowRight size={16}/></MotionSwitch></button></div>
    <p className="c-object-note">Пример на демонстрационном разговоре о поставке. Можно переключать требования, раскрывать цитаты и менять статус примера задачи.</p>
  </div>;
}
