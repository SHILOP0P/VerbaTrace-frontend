import { useEffect, useId, useRef } from "react";
import { Check, ChevronDown, Download } from "lucide-react";

export const assistantExportFormats = [
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "Word (.docx)" },
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "md", label: "Markdown (.zip)" },
] as const;

export function AssistantExportMenu({ label, ariaLabel = label, open, onOpenChange, format, onFormatChange, onExport, disabled }: {
  label: string; ariaLabel?: string; open: boolean; onOpenChange: (open: boolean) => void;
  format: string; onFormatChange: (format: string) => void; onExport: () => void; disabled: boolean;
}) {
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onOpenChange(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, onOpenChange]);
  return <div className="assistant-header-export" ref={root} onKeyDown={event => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); onOpenChange(false); trigger.current?.focus(); }
    if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const options = [...root.current!.querySelectorAll<HTMLButtonElement>('[role="option"]')];
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = index < 0 ? (event.key === "ArrowDown" ? 0 : options.length - 1) : (index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length;
      options[next]?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="assistant-export-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => onOpenChange(!open)}><Download size={16}/><span>{label}</span><ChevronDown size={14}/></button>
    {open && <div className="assistant-export-menu">
      <div id={id} role="listbox" aria-label="Формат экспорта">{assistantExportFormats.map(item => <button type="button" role="option" key={item.value} aria-selected={format === item.value} onClick={() => onFormatChange(item.value)}><span>{item.label}</span>{format === item.value && <Check size={15}/>}</button>)}</div>
      <button type="button" className="assistant-export-download" disabled={disabled} onClick={onExport}><Download size={15}/>Скачать {assistantExportFormats.find(item => item.value === format)?.label ?? "PDF"}</button>
    </div>}
  </div>;
}
