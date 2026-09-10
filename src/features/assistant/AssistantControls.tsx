import { ButtonHTMLAttributes, ReactNode, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

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
