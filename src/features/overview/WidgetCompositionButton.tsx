import { useLayoutEffect, useRef, useState } from "react";
import { PanelsTopLeft } from "lucide-react";
import { HoverHint } from "../../shared/ui/hover-hint";
import { compositionNames, nextComposition, widgetCompositions, widgetInfo, type OverviewWidget } from "./layout";

export function WidgetCompositionButton({ widget, disabled, onChange }: {
  widget: OverviewWidget; disabled: boolean; onChange: (composition: OverviewWidget["composition"]) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [available, setAvailable] = useState<ReturnType<typeof widgetCompositions>>(["standard", "leading", "centered"]);
  useLayoutEffect(() => {
    const card = button.current?.closest<HTMLElement>("[data-widget-id]");
    if (!card) return;
    const read = () => {
      const options = widgetCompositions(widget.kind, card.clientWidth, card.clientHeight,
        Boolean(card.querySelector(".mini-chart, .trend-chart, .ow-progress-ring, .score-gauge")),
        Boolean(card.querySelector(".kpi-value")));
      setAvailable(previous => previous.join() === options.join() ? previous : options);
    };
    const resize = new ResizeObserver(read);
    const content = new MutationObserver(read);
    resize.observe(card);
    content.observe(card, { childList: true, subtree: true });
    read();
    return () => { resize.disconnect(); content.disconnect(); };
  }, [widget.kind]);
  const next = nextComposition(widget.composition, available);
  const compact = available.length === 1;
  return <HoverHint label="Компоновка виджета" focusable={false}
    detail={compact ? "Увеличьте высоту карточки, чтобы менять расположение элементов." : `Сейчас: ${compositionNames[widget.composition ?? "standard"]}. Далее: ${compositionNames[next]}.`}>
    <button ref={button} className="icon-button" disabled={disabled || compact}
      onClick={() => onChange(next)} aria-label={`Изменить компоновку: ${widgetInfo[widget.kind].title}`}>
      <PanelsTopLeft size={16}/>
    </button>
  </HoverHint>;
}
