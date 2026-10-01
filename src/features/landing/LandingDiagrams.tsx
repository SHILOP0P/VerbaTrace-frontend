import {
  AudioLines,
  Bot,
  Building2,
  CalendarClock,
  ClipboardList,
  CloudUpload,
  FileDown,
  Gauge,
  ListChecks,
  Plug,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Wallet
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * The diagram that closes an act.
 *
 * Each one draws the route a call takes through that part of the product —
 * the stages a person goes through, never the machinery behind them. They are
 * built out of the same tones and emblems as everything else, and they arrive
 * along with the act, left to right, when the act comes into view.
 */

type Node = { icon: ReactNode; title: string; note: string; tone?: "info" | "lead" | "good" | "warn" };

function Flow({ nodes }: { nodes: Node[] }) {
  return (
    <ol className="diagram-flow">
      {nodes.map((node, index) => (
        <li key={node.title} style={{ "--i": index } as never} className={node.tone ? `tone-${node.tone}` : ""}>
          <span className="diagram-node">
            <span className="integration-icon" aria-hidden="true">{node.icon}</span>
            <strong>{node.title}</strong>
            <span className="diagram-note">{node.note}</span>
          </span>
          {index < nodes.length - 1 && <i className="diagram-link" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

/** Act I — the record becomes a text anyone can read. */
export function CallFlowDiagram() {
  return (
    <Flow
      nodes={[
        { icon: <CloudUpload size={18} />, title: "Запись", note: "аудио или видео, одна или пачкой", tone: "warn" },
        { icon: <AudioLines size={18} />, title: "Обработка", note: "статус виден в реальном времени", tone: "warn" },
        { icon: <ScrollText size={18} />, title: "Текст по репликам", note: "таймкоды, спикеры, правки", tone: "info" },
        { icon: <Sparkles size={18} />, title: "Готово к разбору", note: "звонок в папке и в поиске", tone: "good" }
      ]}
    />
  );
}

/** Act II — the standard, the score and the person who has the last word. */
export function ScoreFlowDiagram() {
  return (
    <div className="diagram-branching">
      <Flow
        nodes={[
          { icon: <ClipboardList size={18} />, title: "Ваш стандарт", note: "инструкция и её редакции", tone: "warn" },
          { icon: <ListChecks size={18} />, title: "Критерии", note: "вес и отметка «критичный»", tone: "warn" },
          { icon: <Gauge size={18} />, title: "Оценка звонка", note: "каждый вывод с цитатой", tone: "lead" },
          { icon: <UserCheck size={18} />, title: "Проверка человеком", note: "правка и публикация версии", tone: "good" }
        ]}
      />
      <ul className="diagram-outcomes">
        <li><span className="status-chip ok">Принято</span> оценка идёт в аналитику</li>
        <li><span className="status-chip warn">Поправлено</span> версия руководителя становится итоговой</li>
        <li><span className="status-chip">Спор</span> сотрудник оспорил, решение с комментарием</li>
      </ul>
    </div>
  );
}

/** Act III — what the team does with all of it. */
export function WorkFlowDiagram() {
  return (
    <div className="diagram-split">
      <div className="diagram-source">
        <span className="integration-icon" aria-hidden="true"><AudioLines size={18} /></span>
        <strong>Разобранный звонок</strong>
        <span className="diagram-note">итог, оценка, цитаты</span>
      </div>
      <div className="diagram-branches">
        <article>
          <span className="diagram-branch-line" aria-hidden="true" />
          <span className="integration-icon" aria-hidden="true"><CalendarClock size={18} /></span>
          <strong>Действие</strong>
          <span className="diagram-note">ответственный и срок, а дальше — задача в Bitrix24</span>
        </article>
        <article>
          <span className="diagram-branch-line" aria-hidden="true" />
          <span className="integration-icon" aria-hidden="true"><Gauge size={18} /></span>
          <strong>Аналитика</strong>
          <span className="diagram-note">средний балл отдела, динамика, слабые критерии</span>
        </article>
        <article>
          <span className="diagram-branch-line" aria-hidden="true" />
          <span className="integration-icon" aria-hidden="true"><Users size={18} /></span>
          <strong>Команда</strong>
          <span className="diagram-note">каждому видно ровно то, что относится к его работе</span>
        </article>
      </div>
    </div>
  );
}

/** Act IV — the frame everything runs inside. */
export function OrderDiagram() {
  return (
    <div className="diagram-columns">
      <article>
        <span className="integration-icon" aria-hidden="true"><Wallet size={18} /></span>
        <strong>Расход под контролем</strong>
        <ul>
          <li>Тариф задаёт объём</li>
          <li>Лимиты — на компанию и отдел</li>
          <li>Не хватило — звонок ждёт, а не теряется</li>
        </ul>
      </article>
      <article>
        <span className="integration-icon" aria-hidden="true"><ShieldCheck size={18} /></span>
        <strong>Данные в границах</strong>
        <ul>
          <li>Маскирование по вашей политике</li>
          <li>Личная, отдела или компании</li>
          <li>Оригинал — отдельным доступом и в журнал</li>
        </ul>
      </article>
      <article>
        <span className="integration-icon" aria-hidden="true"><Plug size={18} /></span>
        <strong>Связь наружу</strong>
        <ul>
          <li>Звонки приходят из вашей телефонии</li>
          <li>Итог уходит в карточку сделки</li>
          <li>Отчёт — в PDF, DOCX, Markdown, XLSX</li>
        </ul>
      </article>
    </div>
  );
}

/* ------------------------------------------------------------- the margins */

/**
 * The margins of the page.
 *
 * Small pieces of the same interface, dimmed and drifting a little against the
 * scroll, so the story is not a column of text in an empty room. They carry no
 * information the page depends on: on a narrow screen they go, whole.
 */
export function StoryAmbient() {
  return (
    <div className="story-ambient" aria-hidden="true">
      <div className="story-ambient-column is-right">
        <figure style={{ "--k": 1.4 } as never}>
          <span className="ambient-title">Оценка звонка</span>
          <span className="ambient-ring">
            <svg viewBox="0 0 48 48">
              <circle className="ambient-ring-track" cx="24" cy="24" r="19" />
              <circle className="ambient-ring-value" cx="24" cy="24" r="19" />
            </svg>
            <em>84</em>
          </span>
        </figure>
        <figure style={{ "--k": 0.7 } as never}>
          <span className="ambient-title">Статусы</span>
          <span className="ambient-chips">
            <i className="status-chip ok">Готово</i>
            <i className="status-chip warn">Разбор</i>
          </span>
        </figure>
        <figure style={{ "--k": 1.9 } as never}>
          <span className="ambient-title">Критерии</span>
          <span className="ambient-bars">
            <i style={{ "--w": "88%", "--c": "var(--vt-good-mark)" } as never} />
            <i style={{ "--w": "64%", "--c": "var(--vt-warn-mark)" } as never} />
            <i style={{ "--w": "41%", "--c": "var(--vt-bad-mark)" } as never} />
          </span>
        </figure>
        <figure style={{ "--k": 1.1 } as never}>
          <span className="ambient-title">Команда</span>
          <span className="ambient-chips is-stack">
            <i className="status-chip role-owner">Владелец</i>
            <i className="status-chip role-leader">Руководитель</i>
            <i className="status-chip role-member">Сотрудник</i>
          </span>
        </figure>
        <figure style={{ "--k": 1.6 } as never}>
          <span className="ambient-title">Динамика</span>
          <svg className="ambient-spark" viewBox="0 0 100 32" preserveAspectRatio="none">
            <path d="M0 26 L14 22 L28 24 L42 16 L56 18 L70 10 L84 12 L100 4" />
          </svg>
        </figure>
        <figure style={{ "--k": 0.5 } as never}>
          <span className="ambient-title">Выгрузка</span>
          <span className="ambient-chips">
            <i className="ambient-format"><FileDown size={13} /> PDF</i>
            <i className="ambient-format"><Building2 size={13} /> XLSX</i>
          </span>
        </figure>
        <figure style={{ "--k": 1.3 } as never}>
          <span className="ambient-title">Интеграция</span>
          <span className="ambient-chips">
            <i className="ambient-format"><Bot size={13} /> Bitrix24</i>
          </span>
        </figure>
      </div>
    </div>
  );
}
