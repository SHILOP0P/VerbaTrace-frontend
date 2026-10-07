import { cssClass } from "../../shared/lib/css-styles";
import { ArrowLeft, Check, ChevronDown, GitCompareArrows, Plus, X } from "lucide-react";
import { Fragment, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api } from "../../api";
import type { AnalysisInstruction, AnalysisInstructionVersion } from "../../types";
import { extractInstructionText, InstructionDocumentViewer } from "./InstructionDocumentViewerV2";

const COLORS = ["#ff8058", "#66a8ff", "#b58cff", "#57c7a1", "#e6b85c"];
type Loaded = Record<string, { blob: Blob; text?: string }>;
type LineChange = { kind: "same" | "add" | "remove"; text: string; beforeLine?: number; afterLine?: number };
type CompareLane = number;
type DropTarget =
  | { kind: "lane"; lane: CompareLane; index: number }
  | { kind: "column"; index: number; lane: CompareLane; placement: "before" | "after" };

export function InstructionComparePage({ instructionId, onBack }: { instructionId: string; onBack: () => void }) {
  const [instruction, setInstruction] = useState<AnalysisInstruction>();
  const [versions, setVersions] = useState<AnalysisInstructionVersion[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [files, setFiles] = useState<Loaded>({});
  const [adding, setAdding] = useState(false);
  const [versionColors, setVersionColors] = useState<Record<string,string>>({});
  const [versionLanes, setVersionLanes] = useState<Record<string,CompareLane>>({});
  const [dragging, setDragging] = useState<string>();
  const [dropTarget, setDropTargetState] = useState<DropTarget|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const addRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef(new Map<string,HTMLElement>());
  const cardRefs = useRef(new Map<string,HTMLElement>());
  const boardRef = useRef<HTMLElement>(null);
  const draggingRef = useRef<string|undefined>(undefined);
  const dropTargetRef = useRef<DropTarget|null>(null);

  useEffect(() => {
    if (!isUuid(instructionId)) { setError("Не удалось определить инструкцию для сравнения."); setLoading(false); return; }
    let cancelled = false;
    Promise.all([api.getInstruction(instructionId), api.listInstructionVersions(instructionId)]).then(async ([current, history]) => {
      if (cancelled) return;
      const ordered = [...history.items].sort((a, b) => a.version - b.version);
      const requested = (new URLSearchParams(window.location.search).get("versions") ?? "").split(",").filter((id) => ordered.some((item) => item.id === id));
      const initial = Array.from(new Set(requested.length >= 2 ? requested : ordered.slice(-2).map((item) => item.id))).slice(0, COLORS.length);
      setInstruction(current); setVersions(ordered); setSelected(initial);
      setVersionColors(Object.fromEntries(initial.map((id,index)=>[id,COLORS[index]])));
      const savedLayout=new Map((new URLSearchParams(window.location.search).get("layout")??"").split(",").map((item)=>item.split(":" )).filter(([id,lane])=>initial.includes(id)&&Number.isInteger(Number(lane))) as Array<[string,string]>);
      const savedLaneIds=Array.from(new Set([...savedLayout.values()].map(Number))).sort((a,b)=>a-b);
      const hasCompleteSavedLayout=initial.every((id)=>savedLayout.has(id));
      setVersionLanes(Object.fromEntries(initial.map((id,index)=>{const lane=hasCompleteSavedLayout?savedLayout.get(id):undefined;return [id,lane===undefined?defaultLane(index,initial.length):savedLaneIds.indexOf(Number(lane))]})));
      await loadFiles(initial, ordered, cancelled);
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Не удалось загрузить версии."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [instructionId]);

  useEffect(() => {
    if (!instructionId || selected.length < 2) return;
    const query = new URLSearchParams({ versions: selected.join(","), layout:selected.map((id)=>`${id}:${versionLanes[id]??0}`).join(",") });
    window.history.replaceState({}, "", `/app/instructions/${encodeURIComponent(instructionId)}/compare?${query}`);
  }, [instructionId, selected, versionLanes]);

  useEffect(() => {
    if (!adding) return;
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !addRef.current?.contains(event.target)) setAdding(false); };
    document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close);
  }, [adding]);

  useEffect(() => {
    if(!dragging)return;
    const move=(event:PointerEvent)=>{const target=targetAtPoint(event.clientX,event.clientY);if(target)setDropTarget(target);};
    const end=(event:PointerEvent)=>{const id=draggingRef.current;if(!id)return;const target=targetAtPoint(event.clientX,event.clientY)??dropTargetRef.current;if(target)finishDrop(id,target);else{draggingRef.current=undefined;setDragging(undefined);setDropTarget(null);}};
    document.addEventListener("pointermove",move,true);document.addEventListener("pointerup",end,true);document.addEventListener("pointercancel",end,true);
    return()=>{document.removeEventListener("pointermove",move,true);document.removeEventListener("pointerup",end,true);document.removeEventListener("pointercancel",end,true);};
  },[dragging,selected,versionLanes]);

  useEffect(() => {
    if (!versions.length || selected.length < 2) return;
    const selectedNumbers=selected.map((id)=>versions.find((version)=>version.id===id)?.version).filter((value):value is number=>value!==undefined);
    const needed=versions.filter((version)=>selectedNumbers.some((number,index)=>index<selectedNumbers.length-1&&version.version>Math.min(number,selectedNumbers[index+1])&&version.version<Math.max(number,selectedNumbers[index+1]))&&!files[version.id]);
    if(!needed.length)return;
    let cancelled=false;
    Promise.all(needed.map(async(version)=>{const blob=await api.getInstructionVersionFile(instructionId,version.id);return [version.id,{blob,text:await extractInstructionText(version.original_filename,blob)}] as const})).then((loaded)=>{if(!cancelled)setFiles((current)=>({...current,...Object.fromEntries(loaded)}))}).catch(()=>undefined);
    return()=>{cancelled=true};
  }, [instructionId, selected, versions]);

  async function loadFiles(ids: string[], source = versions, cancelled = false) {
    const missing = ids.filter((id) => !files[id]);
    const loaded = await Promise.all(missing.map(async (id) => {
      const version = source.find((item) => item.id === id)!;
      const blob = await api.getInstructionVersionFile(instructionId, id);
      return [id, { blob, text: await extractInstructionText(version.original_filename, blob) }] as const;
    }));
    if (!cancelled) setFiles((current) => ({ ...current, ...Object.fromEntries(loaded) }));
  }

  async function toggle(id: string) {
    if (selected.includes(id)) { if (selected.length > 2) updateSelected(selected.filter((item)=>item!==id)); return; }
    if (selected.length >= COLORS.length) return;
    await loadFiles([id]);
    const used=new Set(selected.map((item)=>versionColors[item]));
    setVersionColors((current)=>({...current,[id]:COLORS.find((color)=>!used.has(color))??COLORS[0]}));
    const laneIds=activeLaneIds(selected,versionLanes);
    const lane=laneIds.reduce((least,candidate)=>countLane(selected,versionLanes,candidate)<countLane(selected,versionLanes,least)?candidate:least,laneIds[0]??0);
    updateSelected([...selected,id],{...versionLanes,[id]:lane}); setAdding(false);
  }

  function updateSelected(next:string[],nextLanes=versionLanes){
    const laneIds=Array.from(new Set(next.map((id)=>nextLanes[id]??0))).sort((a,b)=>a-b);
    const normalizedLanes=Object.fromEntries(next.map((id)=>[id,Math.max(0,laneIds.indexOf(nextLanes[id]??0))]));
    const commit=()=>{setSelected(next);setVersionLanes(normalizedLanes)};
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){flushSync(commit);return;}
    const chipRects=new Map([...chipRefs.current].map(([id,element])=>[id,element.getBoundingClientRect()]));
    const cardRects=new Map([...cardRefs.current].map(([id,element])=>[id,element.getBoundingClientRect()]));
    flushSync(commit);
    animateMovedVersions(chipRefs.current,chipRects);
    animateMovedVersions(cardRefs.current,cardRects);
  }

  function setDropTarget(target:DropTarget|null){
    const current=dropTargetRef.current;
    const unchanged=current===target||(current!==null&&target!==null&&current.kind===target.kind&&(current.kind==="lane"
      ?target.kind==="lane"&&current.lane===target.lane&&current.index===target.index
      :target.kind==="column"&&current.index===target.index&&current.lane===target.lane&&current.placement===target.placement));
    if(unchanged)return;
    dropTargetRef.current=target;setDropTargetState(target);
  }
  function targetFromCoordinates(clientX:number,clientY:number,laneElement:HTMLElement,lane:CompareLane):DropTarget{
    const dragged=draggingRef.current;
    const source=dragged===undefined?lane:versionLanes[dragged]??0;
    const rect=laneElement.getBoundingClientRect();
    const horizontal=Math.max(0,Math.min(1,(clientX-rect.left)/Math.max(rect.width,1)));
    const boardLaneCount=laneElement.parentElement?.querySelectorAll(":scope > .compare-version-lane").length??1;
    if(boardLaneCount===1&&selected.length===2&&(horizontal<.18||horizontal>.82)){
      const before=horizontal<.18;
      return {kind:"column",index:before?0:1,lane,placement:before?"before":"after"};
    }
    if(lane!==source&&(horizontal<.22||horizontal>.78)){
      const before=horizontal<.22;
      return {kind:"column",index:lane+(before?0:1),lane,placement:before?"before":"after"};
    }
    const cards=[...laneElement.querySelectorAll<HTMLElement>(".compare-version-card:not(.is-dragging)")];
    const found=cards.findIndex((card)=>clientY<card.getBoundingClientRect().top+card.getBoundingClientRect().height/2);
    return {kind:"lane",lane,index:found<0?cards.length:found};
  }
  function targetFromPointer(event:DragEvent<HTMLDivElement>,lane:CompareLane){return targetFromCoordinates(event.clientX,event.clientY,event.currentTarget,lane);}
  function updateDropTarget(event:DragEvent<HTMLDivElement>,lane:CompareLane){event.preventDefault();event.dataTransfer.dropEffect="move";setDropTarget(targetFromPointer(event,lane));}
  function finishDrop(dragged:string,target:DropTarget){
    const layout=moveVersion(selected,versionLanes,dragged,target);
    if(layout.order.join("\0")!==selected.join("\0")||layout.order.some((id)=>(layout.lanes[id]??0)!==(versionLanes[id]??0)))updateSelected(layout.order,layout.lanes);
    draggingRef.current=undefined;setDragging(undefined);setDropTarget(null);
  }
  function dropVersion(event:DragEvent<HTMLDivElement>,lane:CompareLane){event.preventDefault();event.stopPropagation();const dragged=draggingRef.current;if(!dragged)return;finishDrop(dragged,targetFromPointer(event,lane));}
  function dropAsNewColumn(event:DragEvent<HTMLDivElement>,requested:number){event.preventDefault();event.stopPropagation();const dragged=draggingRef.current;if(!dragged)return;const lane=Math.max(0,Math.min(requested,activeLaneIds(selected,versionLanes).length-1));finishDrop(dragged,{kind:"column",index:requested,lane,placement:requested<=lane?"before":"after"});}
  function targetAtPoint(clientX:number,clientY:number){
    const board=boardRef.current;
    if(!board)return null;
    const laneElements=[...board.querySelectorAll<HTMLElement>(":scope > .compare-version-lane")];
    const hit=document.elementFromPoint(clientX,clientY)?.closest<HTMLElement>(".compare-version-lane");
    let lane=hit?laneElements.indexOf(hit):-1;
    if(lane<0)lane=laneElements.reduce((best,element,index)=>{const rect=element.getBoundingClientRect(),distance=Math.max(rect.left-clientX,0,clientX-rect.right)+Math.max(rect.top-clientY,0,clientY-rect.bottom);return distance<best.distance?{index,distance}:best;},{index:0,distance:Number.POSITIVE_INFINITY}).index;
    return laneElements[lane]?targetFromCoordinates(clientX,clientY,laneElements[lane],lane):null;
  }
  function pointerTarget(event:ReactPointerEvent<HTMLElement>){return targetAtPoint(event.clientX,event.clientY);}
  function startPointerDrag(event:ReactPointerEvent<HTMLElement>,id:string){
    if(event.button!==0)return;
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current=id;setDragging(id);setDropTarget(null);
  }
  function movePointerDrag(event:ReactPointerEvent<HTMLElement>){if(!draggingRef.current)return;event.preventDefault();setDropTarget(pointerTarget(event));}
  function endPointerDrag(event:ReactPointerEvent<HTMLElement>){const id=draggingRef.current;if(!id)return;event.preventDefault();const target=pointerTarget(event)??dropTargetRef.current;if(target)finishDrop(id,target);else{draggingRef.current=undefined;setDragging(undefined);setDropTarget(null);}}

  const selectedVersions = selected.map((id) => versions.find((item) => item.id === id)).filter((item): item is AnalysisInstructionVersion => Boolean(item));
  const changes = selectedVersions.slice(1).map((to, index) => ({ from: selectedVersions[index], to, lines: diffLines(files[selectedVersions[index].id]?.text, files[to.id]?.text) }));
  const intermediateByTarget=new Map<string,LineChange[]>();
  changes.forEach((change)=>{const low=Math.min(change.from.version,change.to.version),high=Math.max(change.from.version,change.to.version);if(high-low<=1){intermediateByTarget.set(change.to.id,[]);return;}const direction=change.from.version<change.to.version?1:-1,sequence=versions.filter((version)=>version.version>=low&&version.version<=high).sort((a,b)=>(a.version-b.version)*direction),direct=new Set(change.lines.filter((line)=>line.kind!=="same").map(changeSignature)),all:LineChange[]=[];for(let index=0;index<sequence.length-1;index++)all.push(...diffLines(files[sequence[index].id]?.text,files[sequence[index+1].id]?.text).filter((line)=>line.kind!=="same"));const seen=new Set<string>();intermediateByTarget.set(change.to.id,all.filter((line)=>{const signature=changeSignature(line);if(direct.has(signature)||seen.has(signature))return false;seen.add(signature);return true}))});
  const changedLinesByVersion = new Map<string, Map<number,"added"|"removed">>();
  changes.forEach((change) => change.lines.forEach((line) => {
    if (line.kind === "remove" && line.beforeLine) { const map=changedLinesByVersion.get(change.from.id)??new Map<number,"added"|"removed">(); map.set(line.beforeLine,"removed"); changedLinesByVersion.set(change.from.id,map); }
    if (line.kind === "add" && line.afterLine) { const map=changedLinesByVersion.get(change.to.id)??new Map<number,"added"|"removed">(); map.set(line.afterLine,"added"); changedLinesByVersion.set(change.to.id,map); }
  }));
  const laneIds=activeLaneIds(selected,versionLanes);
  const lanes=laneIds.map((lane)=>selectedVersions.filter((version)=>(versionLanes[version.id]??0)===lane));
  const versionColor=(id:string)=>versionColors[id]??COLORS[0];

  return <div className="transcription-compare-page instruction-compare-page">
    <header className="transcription-compare-header"><button className="ghost-button small" type="button" onClick={onBack}><ArrowLeft size={17}/>К инструкции</button><div><span className="eyebrow">История инструкции</span><h1>Сравнение версий</h1><p>{instruction?.title ?? "Инструкция"}</p></div><div className="compare-version-count"><GitCompareArrows size={18}/><strong>{selected.length}</strong><span>версии</span></div></header>
    {error && <div className="form-error">{error}</div>}
    {loading ? <div className="transcription-compare-loading">Загружаю версии…</div> : <>
      <section className="compare-selection-panel"><div className="compare-selected-versions">{selectedVersions.map((version)=><span ref={(element)=>{if(element)chipRefs.current.set(version.id,element);else chipRefs.current.delete(version.id)}} className={["compare-version-chip", cssClass({"--version-color":versionColor(version.id)} as CSSProperties)].filter(Boolean).join(" ")}  key={version.id}><i/>Версия {version.version}{selected.length>2&&<button type="button" aria-label={`Убрать версию ${version.version}`} onClick={()=>void toggle(version.id)}><X size={14}/></button>}</span>)}</div><div className="compare-add-version" ref={addRef}><button className="ghost-button small" type="button" aria-expanded={adding} onClick={()=>setAdding(!adding)}><Plus size={16}/>Добавить версию<ChevronDown size={15}/></button>{adding&&<div className="compare-version-menu">{versions.map((version)=>{const chosen=selected.includes(version.id);return <button type="button" className={chosen?"selected":""} aria-pressed={chosen} disabled={(chosen&&selected.length<=2)||(!chosen&&selected.length>=COLORS.length)} title={chosen&&selected.length<=2?"Для сравнения нужны минимум две версии":undefined} onClick={()=>void toggle(version.id)} key={version.id}><span><strong>Версия {version.version}</strong><small>{new Date(version.created_at).toLocaleString("ru-RU")}</small></span>{chosen&&(selected.length<=2?<Check size={16}/>:<X size={16}/>)}</button>})}</div>}</div></section>
      <section ref={boardRef} className={[`compare-version-board${lanes.length===1?" is-single":lanes.length===2?" is-pair":""}`, cssClass({"--compare-column-count":lanes.length} as CSSProperties)].filter(Boolean).join(" ")} >{lanes.map((laneVersions,laneIndex)=><div className={`compare-version-lane${dropTarget?.lane===laneIndex?" is-drop-target":""}${dropTarget?.kind==="column"&&dropTarget.lane===laneIndex?` is-column-${dropTarget.placement}`:""}`} onDragOver={(event)=>updateDropTarget(event,laneIndex)} onDrop={(event)=>dropVersion(event,laneIndex)} key={laneIndex}>
        {dragging&&selected.length>2&&lanes.length<selected.length&&<div className={`compare-column-drop-zone is-before${dropTarget?.kind==="column"&&dropTarget.index===laneIndex?" is-active":""}`} onDragOver={(event)=>{event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect="move";setDropTarget({kind:"column",index:laneIndex,lane:laneIndex,placement:"before"})}} onDrop={(event)=>dropAsNewColumn(event,laneIndex)}/>}
        {dragging&&selected.length>2&&lanes.length<selected.length&&laneIndex===lanes.length-1&&<div className={`compare-column-drop-zone is-after${dropTarget?.kind==="column"&&dropTarget.index===lanes.length?" is-active":""}`} onDragOver={(event)=>{event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect="move";setDropTarget({kind:"column",index:lanes.length,lane:laneIndex,placement:"after"})}} onDrop={(event)=>dropAsNewColumn(event,lanes.length)}/>}
        {laneVersions.map((version,lanePosition)=><Fragment key={version.id}>{dropTarget?.kind==="lane"&&dropTarget.lane===laneIndex&&dropTarget.index===lanePosition&&<div className="compare-drop-marker"/>}<article ref={(element)=>{if(element)cardRefs.current.set(version.id,element);else cardRefs.current.delete(version.id)}} className={[`compare-version-card${dragging===version.id?" is-dragging":""}`, cssClass({"--version-color":versionColor(version.id)} as CSSProperties)].filter(Boolean).join(" ")} ><header onPointerDown={(event)=>startPointerDrag(event,version.id)} onPointerMove={movePointerDrag} onPointerUp={endPointerDrag} onPointerCancel={(event)=>endPointerDrag(event)}><div><span className="version-dot"/><strong>Версия {version.version}</strong>{version.id===versions.at(-1)?.id&&<em>Текущая</em>}</div><time>{new Date(version.created_at).toLocaleString("ru-RU")}</time></header><div className="instruction-version-content"><InstructionDocumentViewer filename={version.original_filename} blob={files[version.id]?.blob} markdown={files[version.id]?.text} changedLines={changedLinesByVersion.get(version.id)}/></div></article></Fragment>)}
        {dropTarget?.kind==="lane"&&dropTarget.lane===laneIndex&&dropTarget.index===laneVersions.length&&<div className="compare-drop-marker"/>}{laneVersions.length===0&&<div className="compare-empty-lane">Перетащите версию сюда</div>}
      </div>)}</section>
      <section className="compare-change-log"><div className="compare-section-heading"><div><span className="eyebrow">Хронология</span><h2>Что изменилось</h2></div><small>Только различия между соседними выбранными версиями</small></div>{changes.map((change)=>{const compact=compactChanges(change.lines),intermediate=intermediateByTarget.get(change.to.id)??[];return <article className={["compare-change-step", cssClass({"--version-color":versionColor(change.to.id)} as CSSProperties)].filter(Boolean).join(" ")}  key={change.to.id}><header><span className="version-dot"/><div><strong>Версия {change.from.version} → {change.to.version}</strong><time>{new Date(change.to.created_at).toLocaleString("ru-RU")}</time></div><b>{compact.length} {compact.length===1?"изменение":"изменений"}</b></header>{change.lines.length===0?<p className="compare-no-changes">Содержимое совпадает.</p>:change.lines[0]?.kind==="same"&&change.lines[0].text==="__binary__"?<p className="compare-no-changes">Файл заменён. Версии отображены выше в исходном формате.</p>:<div className="instruction-compact-diff">{compact.map((item,index)=><div className={`instruction-compact-change is-${item.kind}`} key={index}><span>{item.kind==="add"?"Добавлено":item.kind==="remove"?"Удалено":"Заменено"}</span><div>{item.before&&<del>{shortChange(item.before)}</del>}{item.after&&<ins>{shortChange(item.after)}</ins>}</div></div>)}{intermediate.length>0&&<details className="instruction-intermediate-changes"><summary>Промежуточные изменения, не вошедшие в итог: {intermediate.length}</summary><div>{intermediate.map((line,index)=><p key={index}><span>{line.kind==="add"?"+":"−"}</span>{shortChange(line.text)}</p>)}</div></details>}</div>}</article>})}</section>
    </>}
  </div>;
}

function diffLines(before?: string, after?: string): LineChange[] {
  if (before === undefined || after === undefined) return [{kind:"same",text:"__binary__"}];
  const left=before.split("\n"), right=after.split("\n"), dp=Array.from({length:left.length+1},()=>Array(right.length+1).fill(0));
  for(let i=left.length-1;i>=0;i--)for(let j=right.length-1;j>=0;j--)dp[i][j]=left[i]===right[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const result:LineChange[]=[]; let i=0,j=0;
  while(i<left.length||j<right.length){if(i<left.length&&j<right.length&&left[i]===right[j]){result.push({kind:"same",text:left[i],beforeLine:i+1,afterLine:j+1});i++;j++;}else if(j<right.length&&(i===left.length||dp[i][j+1]>=dp[i+1][j])){result.push({kind:"add",text:right[j],afterLine:j+1});j++;}else{result.push({kind:"remove",text:left[i],beforeLine:i+1});i++;}}
  return result.some((line)=>line.kind!=="same")?result:[];
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

function changeSignature(line:LineChange){return `${line.kind}:${line.text.trim()}`;}
function shortChange(text:string){const source=text.trim();return source.length>180?`${source.slice(0,177)}…`:source||"Пустая строка";}
function compactChanges(lines:LineChange[]){const changed=lines.filter((line)=>line.kind!=="same"&&line.text!=="__binary__"),result:Array<{kind:"add"|"remove"|"replace";before?:string;after?:string}>=[];for(let index=0;index<changed.length;index++){const current=changed[index],next=changed[index+1];if(next&&current.kind!==next.kind){const removed=current.kind==="remove"?current:next,added=current.kind==="add"?current:next;result.push({kind:"replace",before:removed.text,after:added.text});index++;}else result.push(current.kind==="add"?{kind:"add",after:current.text}:{kind:"remove",before:current.text});}return result;}

function defaultLane(index:number,total:number){return total<=2?index:index%2;}
function activeLaneIds(selected:string[],lanes:Record<string,CompareLane>){const populated=Array.from(new Set(selected.map((id)=>lanes[id]??0))).sort((a,b)=>a-b);return populated.length?populated:[0];}
function countLane(selected:string[],lanes:Record<string,CompareLane>,lane:CompareLane){return selected.filter((id)=>(lanes[id]??0)===lane).length;}
function moveVersion(selected:string[],lanes:Record<string,CompareLane>,dragged:string,target:DropTarget){
  const groups=activeLaneIds(selected,lanes).map((lane)=>selected.filter((id)=>(lanes[id]??0)===lane));
  const sourceIndex=groups.findIndex((group)=>group.includes(dragged));
  if(sourceIndex<0)return {order:selected,lanes};
  groups[sourceIndex]=groups[sourceIndex].filter((id)=>id!==dragged);
  if(target.kind==="column"){
    let insertion=Math.max(0,Math.min(target.index,groups.length));
    if(groups[sourceIndex].length===0){groups.splice(sourceIndex,1);if(sourceIndex<insertion)insertion--;}
    groups.splice(Math.max(0,Math.min(insertion,groups.length)),0,[dragged]);
  }else{
    const destination=Math.max(0,Math.min(target.lane,groups.length-1));
    groups[destination].splice(Math.max(0,Math.min(target.index,groups[destination].length)),0,dragged);
  }
  const populated=groups.filter((group)=>group.length>0);
  const normalized:Record<string,CompareLane>={};
  populated.forEach((group,lane)=>group.forEach((id)=>{normalized[id]=lane;}));
  return {order:populated.flat(),lanes:normalized};
}
function animateMovedVersions<Key>(elements:Map<Key,HTMLElement>,before:Map<Key,DOMRect>){elements.forEach((element,key)=>{const first=before.get(key);if(!first||!element.isConnected)return;element.getAnimations().forEach((animation)=>animation.cancel());const last=element.getBoundingClientRect(),x=first.left-last.left,y=first.top-last.top,scaleX=last.width>0?first.width/last.width:1,scaleY=last.height>0?first.height/last.height:1;if(Math.abs(x)<1&&Math.abs(y)<1&&Math.abs(scaleX-1)<.005&&Math.abs(scaleY-1)<.005)return;element.animate([{transformOrigin:"top left",transform:`translate(${x}px,${y}px) scale(${scaleX},${scaleY})`},{transformOrigin:"top left",transform:"translate(0,0) scale(1,1)"}],{duration:480,easing:"cubic-bezier(.22,1,.36,1)"})});}
