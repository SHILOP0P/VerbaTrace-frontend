import { ArrowLeft, FileText, ListChecks, FlaskConical } from "lucide-react";
import { type ReactNode, type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cssClass, cssStyle } from "../../shared/lib/css-styles";
import "./instruction-workspace.css";

export type InstructionPane = "document" | "criteria" | "check";
const panes: Array<{ key: InstructionPane; label: string }> = [
  { key: "document", label: "Инструкция" }, { key: "criteria", label: "Критерии" }, { key: "check", label: "Проверка" },
];

export function InstructionWorkspaceHeading({ title, filename, draft, action, onBack, backDisabled }: {
  title: string; filename: string; draft?: boolean; action?: ReactNode; onBack: () => void; backDisabled?: boolean;
}) {
  return <><button className="iw-back" type="button" disabled={backDisabled} onClick={onBack}><ArrowLeft size={16} />К инструкциям</button>
    <header className="iw-heading"><span className="iw-heading-icon"><FileText size={23} /></span><div>
      <div className="iw-heading-title"><h1>{title}</h1><span className={`iw-badge ${draft ? "is-draft" : "is-current"}`}>{draft ? "Черновик" : "Действующая"}</span></div>
      <p>{filename}</p></div>{action}</header></>;
}

export function InstructionWorkspaceBody({ document, criteria, check, pane, onPaneChange }: {
  document: ReactNode; criteria: ReactNode; check?: ReactNode; pane: InstructionPane; onPaneChange: (pane: InstructionPane) => void;
}) {
  const available = check ? panes : panes.slice(0, 2);
  const index = Math.max(0, available.findIndex(item => item.key === pane));
  const tabs = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  const [columnHeight, setColumnHeight] = useState<number>();
  const [criteriaLimit, setCriteriaLimit] = useState<number>();
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const change = () => setMobile(media.matches);
    media.addEventListener("change", change); return () => media.removeEventListener("change", change);
  }, []);
  useLayoutEffect(() => {
    const root = layout.current, body = track.current;
    if (!root || !body) return;
    const measure = () => {
      if (!window.matchMedia("(min-width: 1025px)").matches) { setColumnHeight(undefined); return; }
      const sidebar = window.document.querySelector<HTMLElement>(".app-sidebar");
      const bottom = sidebar?.getBoundingClientRect().bottom ?? window.innerHeight - 16;
      const origin = body.getBoundingClientRect().top + window.scrollY;
      const height = Math.round(Math.max(180, bottom - origin) * 100) / 100;
      setColumnHeight(current => current === height ? current : height);
      const documentCard = body.querySelector<HTMLElement>(".iw-pane-document>.iw-card");
      const criteriaHeader = body.querySelector<HTMLElement>(".iw-pane-criteria .iw-card-heading");
      if (documentCard && criteriaHeader) {
        const limit = Math.round(Math.max(0, documentCard.getBoundingClientRect().height - criteriaHeader.getBoundingClientRect().height - 2) * 100) / 100;
        setCriteriaLimit(current => current === limit ? current : limit);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    const page = root.closest(".instruction-workspace");
    if (page) observer.observe(page);
    const documentCard = body.querySelector(".iw-pane-document>.iw-card");
    const criteriaHeader = body.querySelector(".iw-pane-criteria .iw-card-heading");
    if (documentCard) observer.observe(documentCard);
    if (criteriaHeader) observer.observe(criteriaHeader);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  useLayoutEffect(() => {
    const root = stage.current, body = track.current;
    if (!root || !body) return;
    const measure = () => { cssStyle(root).height = mobile ? `${body.children[index]?.getBoundingClientRect().height ?? 0}px` : ""; };
    measure();
    const observer = new ResizeObserver(measure);
    Array.from(body.children).forEach(child => observer.observe(child));
    return () => observer.disconnect();
  }, [mobile, index]);
  const variables = cssClass({ "--iw-pane-count": available.length, "--iw-pane-index": index, ...(columnHeight !== undefined ? { "--iw-column-height": `${columnHeight}px` } : {}), ...(criteriaLimit !== undefined ? { "--iw-criteria-limit": `${criteriaLimit}px` } : {}) } as CSSProperties);
  return <div className={`iw-layout ${variables}`} ref={layout}>
    <div className="iw-mobile-tabs" role="tablist" aria-label="Разделы инструкции" ref={tabs} onKeyDown={event => {
      let next: number | undefined;
      if (event.key === "ArrowRight") next = (index + 1) % available.length;
      if (event.key === "ArrowLeft") next = (index + available.length - 1) % available.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = available.length - 1;
      if (next !== undefined) { event.preventDefault(); onPaneChange(available[next].key); tabs.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus(); }
    }}>
      {available.map((item, itemIndex) => <button key={item.key} type="button" role="tab" id={`iw-tab-${item.key}`} aria-controls={`iw-pane-${item.key}`} aria-selected={index === itemIndex} tabIndex={index === itemIndex ? 0 : -1} onClick={() => onPaneChange(item.key)}>{item.label}</button>)}
    </div>
    <div className="iw-stage" ref={stage}><div className="iw-body" ref={track}>
      {[document, criteria, ...(check ? [check] : [])].map((content, itemIndex) => <section className={`iw-pane iw-pane-${available[itemIndex].key}`} key={available[itemIndex].key} id={`iw-pane-${available[itemIndex].key}`} aria-labelledby={`iw-tab-${available[itemIndex].key}`} aria-hidden={mobile && itemIndex !== index ? true : undefined} inert={mobile && itemIndex !== index}>{content}</section>)}
    </div></div>
  </div>;
}

export function InstructionPanel({ title, subtitle, kind, action, children }: {
  title: string; subtitle?: string; kind: "document" | "criteria" | "check" | "result"; action?: ReactNode; children: ReactNode;
}) {
  const Icon = kind === "document" ? FileText : kind === "check" ? FlaskConical : ListChecks;
  return <section className={`iw-card iw-${kind}`}><header className="iw-card-heading"><div><h2><Icon size={18} />{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</section>;
}
