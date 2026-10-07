import { useId, useLayoutEffect, useRef, type ReactNode, type CSSProperties } from "react";

const ease = "cubic-bezier(.22,1,.36,1)";
const reduced = () => document.documentElement.dataset.landingMotion === "reduce" || matchMedia("(prefers-reduced-motion: reduce)").matches;

// The outgoing copy is visual only. It never retains focus, handlers or accessibility nodes.
export function MotionSwitch({ value, children, className = "", layout = "auto" }: { value: string | number; children: ReactNode; className?: string; layout?: "auto" | "fixed" }) {
  const instance = useId().replaceAll(":", "");
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const previous = useRef<{ value: string | number; height: number; copy: HTMLElement } | null>(null);
  useLayoutEffect(() => {
    const host = root.current, current = content.current;
    if (!host || !current) return;
    const height = current.getBoundingClientRect().height;
    const old = previous.current;
    const animations: Animation[] = [];
    let ghost: HTMLElement | undefined;
    if (old && old.value !== value && !reduced()) {
      host.classList.add("is-switching");
      ghost = old.copy;
      ghost.classList.add("c-switch-ghost");
      ghost.inert = true;
      ghost.setAttribute("aria-hidden", "true");
      const svgIds = new Map<string, string>();
      ghost.querySelectorAll("[id]").forEach(node => {
        if (node.namespaceURI === "http://www.w3.org/2000/svg") {
          const original = node.id;
          const replacement = `${original}-${instance}-outgoing`;
          svgIds.set(original, replacement);
          node.id = replacement;
        } else node.removeAttribute("id");
      });
      ghost.querySelectorAll("svg *").forEach(node => {
        for (const attribute of Array.from(node.attributes)) {
          const replacement = attribute.value.replace(/url\(#([^)]*)\)/g, (match, id: string) => svgIds.has(id) ? `url(#${svgIds.get(id)})` : match);
          if (replacement !== attribute.value) node.setAttribute(attribute.name, replacement);
        }
      });
      if (layout === "fixed") ghost.style.height = "100%";
      host.append(ghost);
      animations.push(ghost.animate(layout === "fixed" ? [{opacity:1},{opacity:0}] : [{opacity:1, transform:"translateY(0)"},{opacity:0, transform:"translateY(-8px)"}], {duration:240,easing:ease,fill:"forwards"}));
      animations.push(current.animate(layout === "fixed" ? [{opacity:0},{opacity:1}] : [{opacity:0,transform:"translateY(12px)"},{opacity:1,transform:"translateY(0)"}],{duration:480,delay:70,easing:ease,fill:"backwards"}));
      if (layout === "auto") animations.push(host.animate([{height:`${old.height}px`},{height:`${height}px`}],{duration:550,easing:ease}));
      void animations[1].finished.then(() => {ghost?.remove();host.classList.remove("is-switching");}).catch(() => {});
    }
    const snapshot = () => {
      const copy=current.cloneNode(true) as HTMLElement;
      copy.querySelectorAll(".c-switch-ghost").forEach(node=>node.remove());
      previous.current={value,height:current.getBoundingClientRect().height,copy};
    };
    snapshot();
    const changes=new MutationObserver(snapshot);
    changes.observe(current,{subtree:true,childList:true,attributes:true,characterData:true});
    const resize=new ResizeObserver(()=>{if(previous.current?.value===value) previous.current.height=current.getBoundingClientRect().height;});
    resize.observe(current);
    const preference=new MutationObserver(()=>{if(reduced()){animations.forEach(animation=>animation.cancel());ghost?.remove();host.classList.remove("is-switching");}});
    preference.observe(document.documentElement,{attributes:true,attributeFilter:["data-landing-motion"]});
    return () => {changes.disconnect();resize.disconnect();preference.disconnect();animations.forEach(animation => animation.cancel());ghost?.remove();host.classList.remove("is-switching");};
  }, [value, layout, instance]);
  return <div ref={root} className={`c-motion-switch ${layout === "fixed" ? "c-fixed-switch" : ""} ${className}`}><div ref={content} className="c-switch-content">{children}</div></div>;
}

export function SlideRail({ active, children }: { active: number; children: ReactNode[] }) {
  const root = useRef<HTMLDivElement>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  useLayoutEffect(() => {
    const host = root.current, panel = panels.current[active];
    if (!host || !panel) return;
    const update = () => { host.style.height = `${panel.getBoundingClientRect().height}px`; };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [active]);
  return <div ref={root} className="c-slide-window"><div className="c-slide-rail" style={{"--c-slide":active} as CSSProperties}>{children.map((child,index) => <div ref={node => {panels.current[index]=node;}} className="c-slide-panel" key={index} inert={index!==active} aria-hidden={index!==active}>{child}</div>)}</div></div>;
}

export function Disclosure({ title, children, icon }: { title: string; children: ReactNode; icon: ReactNode }) {
  const root = useRef<HTMLDetailsElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const running = useRef<Animation | null>(null);
  useLayoutEffect(() => () => running.current?.cancel(), []);
  return <details ref={root}><summary onClick={event => {
    event.preventDefault();
    const details=root.current, panel=body.current;
    if (!details || !panel) return;
    const closing=details.open && details.dataset.closing!=="true";
    const height=panel.getBoundingClientRect().height;
    running.current?.cancel();
    details.open=true;
    details.dataset.closing=String(closing);
    if (reduced()) {details.open=!closing;return;}
    const animation=panel.animate([{height:`${height}px`,opacity:closing?1:0},{height:closing?"0px":`${panel.scrollHeight}px`,opacity:closing?0:1}],{duration:420,easing:ease});
    running.current=animation;
    void animation.finished.then(()=>{details.open=!closing;delete details.dataset.closing;running.current=null;}).catch(()=>{});
  }}>{title}{icon}</summary><div ref={body} className="c-disclosure-body">{typeof children === "string" ? <p>{children}</p> : children}</div></details>;
}
