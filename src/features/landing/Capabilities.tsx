import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { AudioLines, FileText, SlidersHorizontal, ShieldCheck, ListTodo, UsersRound, Link2, type LucideIcon } from "lucide-react";
import { MotionSwitch } from "./Motion";

const capabilities: { icon: LucideIcon; name: string; text: string; caption: string; point: [number,number] }[] = [
  {icon:FileText,name:"Расшифровка",text:"Текст с участниками и временными отметками. Выберите реплику, чтобы найти нужный момент в записи.",caption:"Голос → текст и участники",point:[300,88]},
  {icon:SlidersHorizontal,name:"Ваши инструкции",text:"Критерии, вес и условия оценки под конкретный процесс. Правила задаёт ваша команда.",caption:"Инструкция → правила оценки",point:[466,184]},
  {icon:ShieldCheck,name:"Проверка человеком",text:"Проверяйте объяснения по записи, уточняйте оценки и оставляйте комментарии. История пересмотра сохраняется.",caption:"Вывод → проверка по исходному разговору",point:[466,376]},
  {icon:ListTodo,name:"Следующие шаги",text:"Договорённости, ответственные и статусы. Продолжайте работу после завершения звонка.",caption:"Договорённость → действие и ответственный",point:[300,472]},
  {icon:UsersRound,name:"Работа команды",text:"Компании, отделы и аналитика. Переходите от общей картины к конкретному разговору. Возможности зависят от роли и тарифа.",caption:"Компания → отделы → разговоры",point:[134,376]},
  {icon:Link2,name:"Интеграции и доступ",text:"Bitrix24, API и webhooks. Записи направляются в нужную область. Доступ зависит от тарифа и настройки подключения.",caption:"Ваши источники → VerbaTrace",point:[134,184]},
];

function Illustration({ selected }: { selected: number }) {
  const id=useId().replaceAll(":","")+selected;
  const surface=`url(#${id}-surface)`;
  const edge=`url(#${id}-edge)`;
  const plate=(x:number,y:number,w:number,h:number)=> <g><rect x={x+5} y={y+7} width={w} height={h} rx="16" fill={edge}/><rect x={x} y={y} width={w} height={h} rx="16" fill={surface} className="c-viz-outline"/></g>;
  const wave=(x:number,y:number)=> <g>{[17,33,46,29,21].map((h,i)=><rect className="c-drawing-orange" key={i} x={x+i*10} y={y-h/2} width="5" height={h} rx="2.5"/>)}</g>;
  return <svg viewBox="0 0 440 300" aria-hidden="true" className="c-capability-drawing c-feature-art">
    <defs><linearGradient id={`${id}-surface`} x1="0" y1="0" x2="1" y2="1"><stop className="c-viz-surface-start"/><stop offset="1" className="c-viz-surface-end"/></linearGradient><linearGradient id={`${id}-edge`} x1="0" x2="0" y1="0" y2="1"><stop className="c-viz-edge-start"/><stop offset="1" className="c-viz-edge-end"/></linearGradient></defs>
    <ellipse className="c-drawing-shadow" cx="224" cy="261" rx="168" ry="20"/>
    <path fill={edge} d="M44 214 L235 265 Q247 268 258 264 L400 210 V222 L257 276 Q247 280 234 276 L44 226Z"/>
    <path fill={surface} className="c-viz-outline" d="M44 214 L190 152 Q201 148 213 152 L400 202 Q412 207 400 212 L258 264 Q247 268 235 265Z"/>
    <path className="c-viz-platform-accent" d="M51 225 L237 274 Q248 277 258 272 L395 223"/>
    {selected===0 ? <>
      <g className="c-viz-floating">{plate(156,45,181,159)}<path className="c-drawing-line" d="M180 81 H302 M180 106 H285 M180 131 H303 M180 156 H269"/><path className="c-drawing-accent" d="M181 106 H239"/><circle className="c-drawing-orange" cx="313" cy="54" r="18"/><path className="c-viz-check" d="M306 54 L311 60 L321 49"/></g>
      <g className="c-viz-floating c-viz-floating-secondary">{plate(59,126,109,77)}{wave(81,164)}<text x="91" y="219">Запись</text></g>
      <path className="c-viz-link" d="M168 169 H189"/>
      <g className="c-viz-floating c-viz-floating-tertiary">{plate(268,180,108,43)}<text x="322" y="205" textAnchor="middle">00:24 · цитата</text></g>
    </> : selected===1 ? <>
      <g className="c-viz-floating">{plate(153,65,133,143)}<path className="c-drawing-accent" d="M183 96 H253"/><path className="c-drawing-line" d="M183 119 H255 M183 140 H242 M183 161 H254"/><text x="220" y="190" textAnchor="middle">Инструкция</text></g>
      <path className="c-viz-link" d="M154 115 H119 V86 M286 115 H319 V92 M221 209 V226"/>
      <g className="c-viz-floating c-viz-floating-secondary">{plate(48,47,115,51)}<text x="105" y="77" textAnchor="middle">Требование</text></g>
      <g className="c-viz-floating c-viz-floating-tertiary">{plate(290,44,107,63)}<text x="343" y="67" textAnchor="middle">Вес</text>{[1,2,3].map((n,i)=><g key={n}><circle className={n===2?"c-drawing-orange":"c-drawing-tint c-drawing-outline"} cx={316+i*27} cy="88" r="10"/><text className={n===2?"c-viz-inverse":""} x={316+i*27} y="92" textAnchor="middle">{n}</text></g>)}</g>
      <g>{plate(155,217,137,33)}<circle className="c-drawing-orange" cx="173" cy="233" r="5"/><text x="233" y="238" textAnchor="middle">Критичный</text></g>
    </> : selected===2 ? <>
      <g className="c-viz-floating">{plate(69,67,159,137)}<text x="92" y="98">Цитата из звонка</text><path className="c-drawing-line" d="M92 119 H202 M92 142 H194 M92 165 H175"/><path className="c-drawing-accent" d="M92 141 H162"/></g>
      <g className="c-viz-floating c-viz-floating-secondary"><path fill={edge} d="M303 52 L366 75 V136 Q366 185 308 217 L245 183 L240 81Z"/><path fill={surface} className="c-viz-outline" d="M297 44 L360 67 V128 Q360 178 297 210 Q234 178 234 128 V67Z"/><circle className="c-drawing-tint c-drawing-outline" cx="297" cy="126" r="35"/><path className="c-drawing-accent" d="M277 124 L292 140 L321 108"/></g>
      <path className="c-viz-link" d="M214 161 H249"/>
      <g className="c-viz-floating c-viz-floating-tertiary">{plate(279,199,107,35)}<text x="332" y="222" textAnchor="middle">Проверено</text></g>
    </> : selected===3 ? <>
      <path className="c-viz-link" d="M135 137 H171 V75 H294 M171 137 V201 H294"/>
      <g className="c-viz-floating">{plate(49,88,114,103)}<circle className="c-drawing-tint c-drawing-outline" cx="106" cy="125" r="22"/><path className="c-drawing-accent" d="M94 124 L104 134 L119 116"/><text x="106" y="171" textAnchor="middle">Действие</text></g>
      <g className="c-viz-floating c-viz-floating-secondary">{plate(262,37,126,73)}<text x="325" y="63" textAnchor="middle">Срок</text><rect className="c-drawing-tint c-drawing-outline" x="310" y="74" width="30" height="22" rx="5"/><path className="c-drawing-accent" d="M317 82 H333 M317 89 H327"/></g>
      <g className="c-viz-floating c-viz-floating-tertiary">{plate(236,161,160,72)}<circle className="c-drawing-orange" cx="258" cy="187" r="10"/><path className="c-drawing-accent" d="M243 208 Q258 190 273 208"/><text x="338" y="196" textAnchor="middle">Ответственный</text></g>
      <circle className="c-drawing-orange" cx="171" cy="137" r="5"/>
    </> : selected===4 ? <>
      <path className="c-viz-link" d="M221 106 V139 H106 V160 M221 139 H332 V160 M106 197 V224 M332 197 V224"/>
      <g className="c-viz-floating">{plate(159,39,125,73)}<text x="222" y="66" textAnchor="middle">Компания</text><path className="c-drawing-accent" d="M202 93 V77 H219 V93 M219 93 V73 H239 V93"/></g>
      <g className="c-viz-floating c-viz-floating-secondary">{plate(41,160,130,45)}<text x="106" y="188" textAnchor="middle">Отдел продаж</text></g>
      <g className="c-viz-floating c-viz-floating-tertiary">{plate(266,160,132,45)}<text x="332" y="188" textAnchor="middle">Отдел поддержки</text></g>
      {[78,106,134,304,332,360].map((x,i)=><g key={x}><ellipse className="c-drawing-shadow" cx={x} cy="253" rx="15" ry="5"/><circle className="c-drawing-tint c-drawing-outline" cx={x} cy={233+(i%2)*4} r="11"/><circle className="c-drawing-orange" cx={x} cy={232+(i%2)*4} r="4"/></g>)}
    </> : <>
      <path className="c-viz-link" d="M131 74 C172 74 170 146 208 146 M131 142 H208 M131 210 C172 210 170 146 208 146 M308 146 H361"/>
      {["Bitrix24","API","Webhooks"].map((name,i)=><g className={`c-viz-floating ${i===1?"c-viz-floating-secondary":i===2?"c-viz-floating-tertiary":""}`} key={name}>{plate(34,43+i*68,98,52)}<text x="83" y={74+i*68} textAnchor="middle">{name}</text></g>)}
      <g className="c-viz-floating c-viz-floating-secondary">{plate(208,92,102,112)}{wave(237,139)}<text x="259" y="184" textAnchor="middle">VerbaTrace</text></g>
      <g>{plate(347,115,58,58)}<path className="c-drawing-accent" d="M361 142 L373 154 L392 133"/></g>
    </>}
  </svg>;
}

export function CapabilityExplorer() {
  const [selected,setSelected]=useState(0);
  const [hovered,setHovered]=useState<number | null>(null);
  const active=capabilities[selected];
  const map=useRef<HTMLDivElement>(null);
  const maskId=useId().replaceAll(":","")+"-connections";
  const [cutouts,setCutouts]=useState<{x:number;y:number;width:number;height:number;radius:number}[]>([]);
  useLayoutEffect(()=> {
    const element=map.current;
    if (!element) return;
    const measure=()=> {
      const box=element.getBoundingClientRect();
      if (!box.width || !box.height) return;
      setCutouts(Array.from(element.querySelectorAll(".c-capability-hub,.c-capability-node")).map(node=> {
        const rect=node.getBoundingClientRect();
        return {x:(rect.left-box.left)*600/box.width,y:(rect.top-box.top)*560/box.height,width:rect.width*600/box.width,height:rect.height*560/box.height,radius:parseFloat(getComputedStyle(node).borderRadius)/rect.width};
      }));
    };
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  return <div className="c-capability-explorer">
    <div className="c-capability-map-column"><div ref={map} className="c-capability-map" role="group" aria-label="Схема возможностей VerbaTrace">
      <svg viewBox="0 0 600 560" preserveAspectRatio="none" aria-hidden="true"><defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="600" height="560"><rect width="600" height="560" fill="white"/>{cutouts.map((box,index)=>index===0 ? <ellipse key={index} cx={box.x+box.width/2} cy={box.y+box.height/2} rx={box.width/2} ry={box.height/2} fill="black"/> : <rect key={index} x={box.x} y={box.y} width={box.width} height={box.height} rx={box.width*box.radius} ry={box.height*box.radius} fill="black"/>)}</mask></defs><circle cx="300" cy="280" r="192"/><g mask={`url(#${maskId})`}>{capabilities.map((item,index)=><path key={item.name} className={selected===index?"is-selected":hovered===index?"is-hovered":""} d={`M300 280 L${item.point[0]} ${item.point[1]}`}/>)}</g></svg>
      <div className="c-capability-hub" aria-hidden="true"><AudioLines size={30}/><strong>Разговор</strong><span>Исходная запись</span></div>
      {capabilities.map((item,index)=>{const Icon=item.icon;return <button key={item.name} className="c-capability-node" style={{"--c-node-x":`${item.point[0]/6}%`,"--c-node-y":`${item.point[1]/5.6}%`} as CSSProperties} aria-label={item.name} aria-pressed={selected===index} aria-controls="capability-description" onPointerEnter={event=>{if(event.pointerType==="mouse") setHovered(index);}} onPointerLeave={()=>setHovered(null)} onFocus={()=>setHovered(index)} onBlur={()=>setHovered(null)} onClick={()=>setSelected(index)}><Icon size={25}/><small aria-hidden="true">0{index+1}</small><span className="c-capability-tooltip" data-visible={hovered===index || selected===index} aria-hidden="true">{item.name}</span></button>;})}
    </div><p className="c-capability-hint"><span>Наведите, чтобы увидеть название. </span>Нажмите, чтобы открыть описание.</p></div>
    <div className="c-capability-details">
      <MotionSwitch value={selected} layout="fixed" className="c-capability-description-frame"><article className="c-capability-description" id="capability-description" aria-live="polite"><span className="c-eyebrow">0{selected+1} / 06 · Возможность продукта</span><h3>{active.name}</h3><p>{active.text}</p></article></MotionSwitch>
      <div className="c-capability-illustration"><MotionSwitch value={selected} layout="fixed" className="c-capability-art-switch"><figure><Illustration selected={selected}/><figcaption>{active.caption}</figcaption></figure></MotionSwitch></div>
    </div>
  </div>;
}
