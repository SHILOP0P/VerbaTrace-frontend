import { ChevronDown, ChevronUp, FileCheck2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { api } from "../../api";
import { cssClass } from "../../shared/lib/css-styles";
import type { AssistantGraphic, AssistantMessage } from "../../types";
import type { AssistantPlotData } from "./AssistantPlot";
import { ToolButton } from "./AssistantControls";

export function AssistantResearchSummary({ message }: { message?: AssistantMessage }) {
  const [expanded, setExpanded] = useState(true);
  const [allTopics, setAllTopics] = useState(false);
  const [topics, setTopics] = useState<AssistantPlotData["points"]>([]);
  const [topicUnit, setTopicUnit] = useState("");
  const [topicCaption, setTopicCaption] = useState("");
  const [topicsUnavailable, setTopicsUnavailable] = useState(false);
  const summaryId = useId();
  const topicGraphics = message?.research?.graphics.filter(graphic => graphic.content_binding?.group_by === "topic" && graphic.calculation.content?.complete) ?? [];
  const topicGraphic = topicGraphics.find(graphic => graphic.content_binding?.metric === "cases") ?? topicGraphics.find(graphic => graphic.content_binding?.metric === "initial_errors") ?? topicGraphics[0];
  useEffect(() => {
    let alive = true;
    setTopics([]);
    setTopicUnit("");
    setTopicCaption("");
    setTopicsUnavailable(false);
    setAllTopics(false);
    if (topicGraphic) {
      api.getAssistantGraphic(topicGraphic.id).then(value => {
        if (!alive) return;
        const plot = (value as AssistantGraphic & { plot?: AssistantPlotData }).plot;
        setTopics(plot?.points.filter(point => Number.isFinite(point.y) && point.y >= 0) ?? []);
        setTopicUnit(plot?.unit ?? "");
        setTopicCaption(plot?.title ?? value.title);
      }).catch(() => { if (alive) setTopicsUnavailable(true); });
    }
    return () => { alive = false; };
  }, [topicGraphic?.id, topicGraphic?.version_uuid]);
  useEffect(() => { setExpanded(true); }, [message?.id]);
  const calculation = message?.research?.calculations.find(item => item.method === "semantic") ?? message?.research?.calculations[0];
  if (!calculation) return null;
  const sourceCount = new Set(message?.sources.map(source => source.id)).size;
  const percentages = topicUnit.startsWith("%");
  const maximum = percentages ? 100 : Math.max(1, ...topics.map(topic => topic.y));
  return <>
    <section className="assistant-research-summary" aria-label="Итог исследования">
      <header><h3><FileCheck2 size={19}/>Итог исследования</h3><ToolButton className="assistant-research-summary-toggle" label={expanded ? "Скрыть итог исследования" : "Показать итог исследования"} aria-expanded={expanded} aria-controls={summaryId} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</ToolButton></header>
      {expanded && <dl id={summaryId}>
        <div><dt>Источников</dt><dd>{sourceCount}</dd></div>
        <div><dt>Проверено записей</dt><dd>{calculation.checked_calls}<span> из {calculation.selected_calls}</span></dd></div>
        {calculation.content && <div><dt>Разобрано эпизодов</dt><dd>{calculation.content.case_count}</dd></div>}
        {topics.length > 0 && <div><dt>Ключевых тем</dt><dd>{topics.length}</dd></div>}
        {calculation.uncertain_calls > 0 && <div><dt>Без однозначного итога</dt><dd>{calculation.uncertain_calls}</dd></div>}
      </dl>}
    </section>
    {topics.length > 0 && <section className="assistant-research-topics" aria-label="Ключевые темы">
      <h3>Ключевые темы</h3>
      <p className="assistant-topic-description">{topicCaption}{topicUnit && " · " + topicUnit}</p>
      <ul className="assistant-topic-list">{(allTopics ? topics : topics.slice(0, 5)).map(topic => <li className="assistant-topic-row" key={topic.label}>
        <div className="assistant-topic-caption"><span>{topic.label}</span><strong>{topic.y.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}{percentages ? " %" : ""}</strong></div>
        <div className="assistant-topic-track" aria-hidden="true"><span className={cssClass({ width: Math.min(100, topic.y / maximum * 100) + "%" })}/></div>
      </li>)}</ul>
      {topics.length > 5 && <button type="button" className="assistant-summary-more" aria-expanded={allTopics} onClick={() => setAllTopics(value => !value)}>{allTopics ? "Скрыть остальные темы" : "Показать все темы"}</button>}
    </section>}
    {topicsUnavailable && <p className="assistant-panel-empty">Темы исследования сейчас недоступны.</p>}
  </>;
}
