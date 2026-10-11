import { useState } from "react";
import { ArrowRight, AudioLines, Building2, Check, FileText, GitBranch, ListTodo, SlidersHorizontal, ShieldCheck, UsersRound, Link2, ChartNoAxesCombined } from "lucide-react";

import { MotionSwitch } from "./Motion";

const connections = [
  {id:"recording", name:"Запись разговора", icon:<AudioLines size={21}/>, detail:"Запись остаётся исходным материалом: участники, реплики и временные отметки связывают её с расшифровкой."},
  {id:"instruction", name:"Ваша инструкция", icon:<SlidersHorizontal size={21}/>, detail:"Инструкция задаёт требования. Критерии имеют формулировку, вес 1–3 и признак критичности; новые редакции сохраняются отдельно."},
  {id:"analysis", name:"Проверяемый разбор", icon:<ShieldCheck size={21}/>, detail:"Вывод связан с объяснением и цитатой. Требования инструкции и вопросы разговора — отдельные пункты анализа."},
  {id:"action", name:"Следующее действие", icon:<ListTodo size={21}/>, detail:"Из разбора можно создать действие: назначить ответственного, срок и отдел. Источник задачи — конкретный разговор."},
  {id:"analytics", name:"Картина команды", icon:<ChartNoAxesCombined size={21}/>, detail:"Критерии связывают звонки с динамикой сотрудников и отделов. Из общей картины можно перейти к разговорам за показателем. Доступ зависит от роли и тарифа."}
];

export function ConnectionGraph() {
  const [selected,setSelected]=useState("analysis");
  const node=(index:number)=>{const item=connections[index];return <button aria-pressed={selected===item.id} key={item.id} onPointerEnter={event=>{if(event.pointerType==="mouse") setSelected(item.id);}} onFocus={()=>setSelected(item.id)} onClick={()=>setSelected(item.id)}>{item.icon}<span>{item.name}</span><i/></button>};
  return <section className="c-section c-connection-section">
    <div className="c-section-heading"><div><span className="c-eyebrow">Как связаны данные</span><h2>Что получается<br/>из записи разговора</h2></div><p>Запись и ваши правила объединяются в разбор. Дальше — действия и понимание того, как работает команда.</p></div>
    <div className="c-flow-graph" aria-label="Связи между разговором и результатами">
      <svg viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true"><path className={selected==="recording" ? "is-active":""} d="M220 100 C350 100 350 180 445 180"/><path className={selected==="instruction" ? "is-active":""} d="M220 260 C350 260 350 180 445 180"/><path className={selected==="analysis" ? "is-active":""} d="M555 180 C680 180 680 64 780 64"/><path className={selected==="action" ? "is-active":""} d="M555 180 L780 180"/><path className={selected==="analytics" ? "is-active":""} d="M555 180 C680 180 680 296 780 296"/></svg>
      <div className="c-flow-inputs">{node(0)}{node(1)}</div><div className="c-flow-core"><span className="c-logomark" aria-hidden="true"><i/><i/><i/><i/></span><strong>VerbaTrace</strong><span>Разговор в контексте</span></div><div className="c-flow-outputs">{node(2)}{node(3)}{node(4)}</div>
    </div><div className="c-flow-detail" aria-live="polite"><GitBranch size={19}/><MotionSwitch value={selected}><p>{connections.find(item=>item.id===selected)?.detail}</p></MotionSwitch></div>
  </section>;
}

// Permission sources: company/permissions.go, department/permissions.go,
// analysis_instruction/permissions.go, teamanalytics/scope.go, qualityreview/context.go,
// action/query.go; export and navigation sources: AiReportsPage and app/runtime.
export const roleInfo = [
  {id:"employee",name:"Сотрудник",scope:"Свои звонки и результаты",text:"Понимать обратную связь, возвращаться к словам клиента и выполнять следующие шаги.",features:[
    ["Мои разговоры","Загрузка записей, расшифровка и анализ. Доступ к звонкам, которые вы загрузили или к которым вам предоставили доступ."],
    ["Обратная связь","Объяснения, цитаты, рекомендации и комментарии к анализу."],
    ["Пересмотр оценки","Оспаривание анализа своего рабочего звонка и обращение за независимой проверкой."],
    ["Личная динамика","Свои оценки по критериям, прогресс и работа над ошибками в компании."],
    ["Мои действия","Задачи, в которых вы ответственный: начало работы, выполнение и обсуждение."],
    ["Правила и отчёты","Просмотр доступных инструкций. Личные инструкции в личном пространстве. Экспорт в пределах тарифа."]
  ]},
  {id:"leader",name:"Лидер отдела",scope:"Отделы, которыми вы руководите",text:"Связывать результаты отдела с конкретными звонками, правилами и действиями.",features:[
    ["Звонки отдела","Просмотр разговоров сотрудников своих отделов и фильтрация по сотруднику, периоду и инструкции."],
    ["Аналитика команды","Критерии, сотрудники, матрица оценок, динамика и переход к звонкам за показателем. Нужен тариф с командной аналитикой."],
    ["Инструкции отдела","Создание и редактирование инструкций, веса 1–3, критичные критерии и применение новых редакций."],
    ["QA-проверка","Проверка звонков других сотрудников своего отдела, пересмотр оценок с объяснением и история изменений."],
    ["Работа с участниками","Приглашение сотрудников в свои отделы и управление в пределах отдела."],
    ["Действия команды","Назначение ответственных и сроков, работа со статусами и передачей задач между отделами."]
  ]},
  {id:"deputy",name:"Заместитель",scope:"Операционная работа всей компании",text:"Помогать владельцу управлять отделами и качеством работы компании.",features:[
    ["Общая картина","Звонки всех отделов компании, фильтры и аналитика по сотрудникам и отделам в пределах тарифа."],
    ["Отделы и сотрудники","Управление структурой, составом отделов и приглашениями сотрудников."],
    ["Общие правила","Инструкции компании и отделов, критерии, подтверждение и история редакций."],
    ["Качество и апелляции","QA-проверки и рассмотрение апелляций на оценки лидеров. Собственную оценку нельзя пересматривать самому."],
    ["Действия компании","Контроль задач, ответственных, сроков и передачи работы между отделами."],
    ["Границы полномочий","Тариф, лимиты, назначение заместителя, передача владения и доступ поддержки остаются у владельца."]
  ]},
  {id:"owner",name:"Владелец",scope:"Компания и её ресурсы",text:"Управлять рабочими процессами и решениями, которые определяют доступ и расходы.",features:[
    ["Все возможности управления","Звонки, сотрудники, отделы, инструкции, QA-проверки и действия в компании."],
    ["Аналитика компании","Сравнение отделов и сотрудников, критерии, динамика и настройка аналитики. Возможности зависят от тарифа."],
    ["Тариф и кредиты","Выбор бизнес-тарифа, лимиты, кредиты и объём обработки. Несколько компаний — в пределах плана."],
    ["Роли и владение","Назначение заместителя, управление лидерами отделов и передача владения компанией."],
    ["Интеграции","Подключения компании, API-ключи, webhooks, сопоставление пользователей и история импортов при доступном тарифе."],
    ["Контроль компании","Название и идентификатор, заморозка и удаление компании, управление доступом поддержки."]
  ]}
] as const;

function ScopeObject({role}:{role:number}) {
  const [department,setDepartment]=useState(0);
  const global=role>=2;
  const departments=["Отдел продаж","Отдел поддержки"];
  return <div className="c-scope-object">
    <span className="c-object-caption"><GitBranch size={16}/>Область доступа: {roleInfo[role].name.toLowerCase()}</span>
    <h4 className="c-scope-title">{global ? "Рабочие звонки всех отделов" : role===1 ? "Рабочие звонки вашего отдела" : "Ваши рабочие звонки"}</h4>
    {!global && <div className="c-scope-selector"><span>Ваш отдел в этом примере</span><div className="c-segmented" role="group" aria-label="Отдел в примере">{departments.map((name,index)=><button key={name} aria-pressed={department===index} onClick={()=>setDepartment(index)}>{name}</button>)}</div></div>}
    <div className="c-company-node"><Building2 size={21}/><strong>Компания</strong><span>Два отдела в примере</span></div>
    <div className="c-org-branches"><i/><i/></div>
    <div className="c-scope-departments">{departments.map((name,index)=> {
      const inScope=global || department===index;
      return <div className="c-scope-department" key={name}>
        {global ? <div className="c-scope-dept-node is-active"><UsersRound size={18}/><strong>{name}</strong><span>Все рабочие звонки</span></div> : <button className={"c-scope-dept-node "+(inScope ? "is-active":"")} aria-label={`Выбрать ${name.toLowerCase()}`} aria-pressed={department===index} onClick={()=>setDepartment(index)}><UsersRound size={18}/><strong>{name}</strong><span>{inScope ? role===1 ? "Все рабочие звонки" : "Только ваши звонки" : "Вне области роли"}</span></button>}
        <div className="c-scope-person-branches"><i/><i/></div>
        <div className="c-scope-people">{[0,1].map(person=> {
          const visible=global || (inScope && (role===1 || person===0));
          return <div key={person} className={visible ? "is-active":""}><span><UsersRound size={15}/></span><small>{!global && inScope && person===0 ? "Вы" : "Сотрудник"}</small></div>;
        })}</div>
      </div>;
    })}</div>
    <div className="c-scope-legend"><span><i/>Звонки доступны</span><span><i/>Вне области роли</span></div>
    <p className="c-object-note">Схема показывает базовый доступ к рабочим звонкам. Личные записи и отдельно предоставленный доступ имеют свои ограничения; аналитика зависит от тарифа.</p>
  </div>;
}

function CriterionObject() {
  const [weight,setWeight]=useState(1);
  const [critical,setCritical]=useState(false);
  return <div className="c-criterion-object"><span className="c-object-caption"><SlidersHorizontal size={17}/>Пример критерия инструкции</span><h3>Выявление потребности</h3><p>Уточнить приоритет клиента, объём первой партии и бюджет до обсуждения цены.</p><div><span>Вес критерия</span><div className="c-segmented" role="group" aria-label="Вес критерия">{[1,2,3].map(value=><button aria-pressed={weight===value} key={value} onClick={()=>setWeight(value)}>{value}</button>)}</div></div><button className="c-critical-toggle" aria-pressed={critical} onClick={()=>setCritical(value=>!value)}><span>{critical && <Check size={13}/>}</span>Критичный критерий</button><p className="c-object-note">Правки готовятся в черновике и начинают действовать после применения. Вес влияет на будущие анализы.</p></div>;
}

export function RoleExplorer() {
  const [role,setRole]=useState(0);
  const active=roleInfo[role];
  return <section className="c-section c-role-explorer" id="roles"><div className="c-section-heading"><div><span className="c-eyebrow">Для каждой роли</span><h2>Возможности<br/>по ролям</h2></div><p>Сотрудник работает со своими результатами. Лидер — с отделом. Заместитель и владелец — с компанией.</p></div><div className="c-role-tabs" role="group" aria-label="Роль в продукте">{roleInfo.map((item,index)=><button aria-pressed={role===index} key={item.id} onClick={()=>setRole(index)}><span>0{index+1}</span>{item.name}<ArrowRight size={16}/></button>)}</div>
    <MotionSwitch value={role}><div className="c-role-body"><div><span className="c-badge c-badge-accent">{active.scope}</span><h3>{active.text}</h3><div className="c-role-features">{active.features.map(([name,text],featureIndex)=><article key={name}><span className="c-feature-number">{String(featureIndex+1).padStart(2,"0")}</span><div><h4>{name}</h4><p>{text}</p></div></article>)}</div></div><div className="c-role-object"><ScopeObject role={role}/></div></div></MotionSwitch>
    <div className="c-shared-functions"><span className="c-object-caption"><FileText size={17}/>В повседневной работе</span><p>Записи и участники · расшифровка и её версии · поиск и фильтры по звонкам · папки и избранное · инструкции и критерии · объяснения и цитаты · комментарии · действия и уведомления · отчёты PDF, DOCX, Markdown и Excel.</p><a className="c-text-link" href="/integrations"><Link2 size={17}/>Как подключить источники<ArrowRight size={16}/></a></div>
  </section>;
}

export function InstructionPlayground() {
  return <section className="c-section c-instruction-section" id="instructions"><div className="c-instruction-layout"><div><span className="c-eyebrow">Инструкции анализа</span><h2>Задайте требования<br/>к разговору</h2><p>Опишите, что сотрудник должен выяснить или сделать. Для каждого критерия задайте вес от 1 до 3 и при необходимости отметьте его как критичный.</p><p>Личные инструкции доступны в личном пространстве. Инструкциями отдела управляет лидер; общими правилами компании — заместитель и владелец.</p></div><div className="c-role-object"><CriterionObject/></div></div></section>;
}
