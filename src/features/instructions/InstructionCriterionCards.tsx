import { ChevronDown, ClipboardCheck, MessageCircleQuestion, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ScorecardCriterion } from "../../types";
import { pluralizeRu } from "../../shared/lib/plans";

const warningLabels: Record<string, string> = { compound: "Похоже на два требования в одном", not_observable: "Нельзя проверить по тексту разговора", vague: "Расплывчато: нет проверяемого признака", negative_wording: "Сформулировано через запрет", excerpt_unverified: "Цитата не найдена в инструкции дословно" };
export function instructionCriterionSummary(criteria: ScorecardCriterion[]) {
  const count = criteria.length, questions = criteria.filter(item => item.required_question).length;
  return `${count} ${pluralizeRu(count, "критерий", "критерия", "критериев")}${questions ? ` · ${questions} ${pluralizeRu(questions, "обязательный вопрос", "обязательных вопроса", "обязательных вопросов")}` : ""}`;
}

export function InstructionCriterionCards({ criteria, canEdit, canEditText, disabled, focusKey, onChange, onRemove }: {
  criteria: ScorecardCriterion[]; canEdit?: boolean; canEditText?: boolean; disabled?: boolean; focusKey?: string;
  onChange?: (key: string, patch: Partial<ScorecardCriterion>) => void; onRemove?: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(criteria.filter(item => !item.title.trim() || item.criterion_key === focusKey).map(item => item.criterion_key)));
  const previous = useRef(criteria);
  useEffect(() => {
    const before = previous.current;
    setExpanded(current => {
      const next = new Set<string>();
      current.forEach(key => {
        if (criteria.some(item => item.criterion_key === key)) next.add(key);
        else {
          const old = before.find(item => item.criterion_key === key);
          const replacement = old && criteria.find(item => item.position === old.position && item.title.trim() === old.title.trim() && item.requirement.trim() === old.requirement.trim());
          if (replacement) next.add(replacement.criterion_key);
        }
      });
      criteria.forEach(item => { if (!item.title.trim() && !before.some(old => old.criterion_key === item.criterion_key)) next.add(item.criterion_key); });
      return next.size === current.size && [...next].every(key => current.has(key)) ? current : next;
    });
    previous.current = criteria;
  }, [criteria]);
  useEffect(() => { if (focusKey) setExpanded(current => new Set([...current, focusKey])); }, [focusKey]);
  return <div className="iw-criteria-groups">{[false, true].map(question => {
    const items = criteria.filter(item => item.required_question === question);
    if (!items.length) return null;
    const Icon = question ? MessageCircleQuestion : ClipboardCheck;
    return <section key={String(question)} className={question ? "iw-criterion-group is-question" : "iw-criterion-group"} aria-label={question ? "Обязательные вопросы" : "Критерии"}>
      <h3><span><Icon size={18} /></span>{question ? "Обязательные вопросы" : "Критерии"}<small>{items.length}</small></h3>
      {items.map(item => <CriterionCard key={item.criterion_key} item={item} open={expanded.has(item.criterion_key)} onToggle={() => setExpanded(current => { const next = new Set(current); if (next.has(item.criterion_key)) next.delete(item.criterion_key); else next.add(item.criterion_key); return next; })} canEdit={canEdit} canEditText={canEditText} disabled={disabled} onChange={patch => onChange?.(item.criterion_key, patch)} onRemove={onRemove ? () => onRemove(item.criterion_key) : undefined} />)}
    </section>;
  })}</div>;
}

function CriterionCard({ item, open, onToggle, canEdit, canEditText, disabled, onChange, onRemove }: {
  item: ScorecardCriterion; open: boolean; onToggle: () => void; canEdit?: boolean; canEditText?: boolean; disabled?: boolean;
  onChange: (patch: Partial<ScorecardCriterion>) => void; onRemove?: () => void;
}) {
  const locked = !canEdit || disabled;
  const textLocked = !canEditText || disabled;
  const detailsId = `criterion-settings-${item.criterion_key}`;
  return <article className={`iw-criterion ${open ? "is-open" : ""}`} id={`criterion-${item.criterion_key}`}>
    <button className="iw-criterion-heading" type="button" aria-expanded={open} aria-controls={detailsId} onClick={onToggle}><span>{item.position}</span><strong>{item.title || "Новый критерий"}</strong><ChevronDown size={16} /></button>
    <div className="iw-criterion-quick"><div className="iw-weight"><span>Вес</span><div role="group" aria-label={`Вес: ${item.title || "Новый критерий"}`}>{[1, 2, 3].map(weight => <button key={weight} type="button" aria-pressed={item.weight === weight} disabled={locked} onClick={() => onChange({ weight })}>{weight}</button>)}</div></div>
      <label className="checkbox-row"><input type="checkbox" checked={item.enabled} disabled={locked} onChange={event => onChange({ enabled: event.target.checked })} />По умолчанию</label>
      <label className="checkbox-row"><input type="checkbox" checked={item.is_critical} disabled={textLocked} onChange={event => onChange({ is_critical: event.target.checked })} />Критичный</label>
    </div>
    <div className="iw-criterion-settings" id={detailsId} hidden={!open}>
      {canEditText ? <><label>Название<input value={item.title} maxLength={120} disabled={textLocked} onChange={event => onChange({ title: event.target.value })} /></label><label>Требование<textarea rows={3} value={item.requirement} disabled={textLocked} onChange={event => onChange({ requirement: event.target.value })} /></label><div className="iw-settings-grid"><label>Когда применим<input value={item.applicability} disabled={textLocked} onChange={event => onChange({ applicability: event.target.value })} /></label><label>Требуемая глубина<input value={item.depth} disabled={textLocked} onChange={event => onChange({ depth: event.target.value })} /></label></div></> : <><div><small>Требование</small><p>{item.requirement}</p></div>{item.applicability && <div><small>Когда применим</small><p>{item.applicability}</p></div>}{item.depth && <div><small>Требуемая глубина</small><p>{item.depth}</p></div>}</>}
      <label className="checkbox-row"><input type="checkbox" checked={item.required_question} disabled={textLocked} onChange={event => onChange({ required_question: event.target.checked })} />Обязательный вопрос</label>
      <label className="checkbox-row"><input type="checkbox" checked={item.cross_cutting} disabled={textLocked} onChange={event => onChange({ cross_cutting: event.target.checked })} />Проверять по всему разговору</label>
      {item.source_excerpt && <div><small>Фрагмент инструкции</small><blockquote>{item.source_excerpt}</blockquote></div>}
      {item.warnings?.length > 0 && <div className="iw-criterion-warnings">{item.warnings.map(warning => <p key={warning}>{warningLabels[warning] || "Проверьте формулировку критерия"}</p>)}</div>}
      {onRemove && <button className="iw-remove-criterion" type="button" disabled={textLocked} onClick={onRemove}><Trash2 size={14} />Убрать из черновика</button>}
    </div>
  </article>;
}
