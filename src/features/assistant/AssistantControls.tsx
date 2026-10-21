import { ButtonHTMLAttributes, ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cssClass } from "../../shared/lib/css-styles";
import type { AssistantMode } from "../../types";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";

export function AssistantPanelIndicator({ root, value }: { root: RefObject<HTMLElement | null>; value: string | null }) {
 const [position, setPosition] = useState({ left: 0, top: 0, width: 0, height: 0 });
 useLayoutEffect(() => {
  const node = root.current;
  if (!node) return;
  const measure = () => {
   const selected = node.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
   const next = selected ? { left: selected.offsetLeft, top: selected.offsetTop, width: selected.offsetWidth, height: selected.offsetHeight } : { left: 0, top: 0, width: 0, height: 0 };
   setPosition(previous => previous.left === next.left && previous.top === next.top && previous.width === next.width && previous.height === next.height ? previous : next);
  };
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(node);
  return () => observer.disconnect();
 }, [root, value]);
 return <span aria-hidden="true" className={"assistant-panel-thumb " + cssClass({ width: position.width, height: position.height, transform: `translate(${position.left}px,${position.top}px)` })}/>;
}

export function AssistantModeSwitch({ value, disabled, onChange }: { value: AssistantMode; disabled: boolean; onChange: (value: AssistantMode) => void }) {
 return <SegmentedControl className="assistant-mode-switch" role="group" aria-label="Режим работы">
  {(["search", "research"] as const).map(mode => <button type="button" key={mode} aria-pressed={value === mode} disabled={disabled} onClick={() => onChange(mode)}>{mode === "search" ? "Поиск" : "Исследование"}</button>)}
 </SegmentedControl>;
}

// Keep the content mounted for the closing motion, then remove it completely.
// Overflow is released after opening so the export menu can extend above it.
export function AssistantCollapse({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
 const root = useRef<HTMLDivElement>(null);
 const [mounted, setMounted] = useState(open);
 const [expanded, setExpanded] = useState(open);
 const [settled, setSettled] = useState(open);
 useLayoutEffect(() => {
  setSettled(false);
  if (open) setMounted(true);
  else setExpanded(false);
 }, [open]);
 useLayoutEffect(() => {
  if (!mounted) return;
  if (open) {
   root.current?.getBoundingClientRect();
   setExpanded(true);
  }
  const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
  const timer = window.setTimeout(() => { setSettled(open); if (!open) setMounted(false); }, duration);
  return () => window.clearTimeout(timer);
 }, [open, mounted]);
 if (!mounted) return null;
 return <div ref={root} id={id} className={["assistant-collapse", expanded ? "is-open" : "", settled ? "is-settled" : ""].join(" ")} aria-hidden={!open} inert={!open}>
  <div className="assistant-collapse-contents">{children}</div>
 </div>;
}

export function ToolButton({label,children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{label:string;children:ReactNode}) {
 return <button type="button" {...props} aria-label={label} className={`assistant-tool ${props.className??""}`}><span className="assistant-tool-icon">{children}</span></button>;
}
export function ChoiceMenu({label,value,options,onChange}:{label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void}) {
 const [open,setOpen]=useState(false);const root=useRef<HTMLDivElement>(null);const id=useId();
 useEffect(()=>{if(!open)return;const dismiss=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener("pointerdown",dismiss);return()=>document.removeEventListener("pointerdown",dismiss)},[open]);
 return <div ref={root} className="assistant-choice" onKeyDown={e=>{if(e.key==="Escape"){setOpen(false);root.current?.querySelector<HTMLButtonElement>("button")?.focus()}if(open&&(e.key==="ArrowDown"||e.key==="ArrowUp")){e.preventDefault();const choices=Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')??[]);const index=choices.indexOf(document.activeElement as HTMLButtonElement);choices[(index+(e.key==="ArrowDown"?1:choices.length-1)+choices.length)%choices.length]?.focus()}}}>
 <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>{options.find(o=>o.value===value)?.label??label}<ChevronDown size={14}/></button>
 {open&&<div className="assistant-choice-options" role="listbox" id={id} aria-label={label}>{options.map(o=><button type="button" role="option" aria-selected={o.value===value} key={o.value} onClick={()=>{onChange(o.value);setOpen(false)}}><span>{o.label}</span>{o.value===value&&<Check size={14}/>}</button>)}</div>}
 </div>;
}
