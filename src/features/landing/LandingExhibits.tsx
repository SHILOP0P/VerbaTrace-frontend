import {
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  CloudUpload,
  FileSpreadsheet,
  FileText,
  FileType,
  Hash,
  Pause,
  Play,
  Plug,
  Quote,
  Sparkles,
  UserRound
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";
import { speakerColor } from "../../shared/lib/speaker-colors";
import { ScoreGauge } from "../../shared/ui/score-gauge";

/**
 * The exhibits of the landing's story.
 *
 * Each one is a small working piece of the product rather than a picture of it:
 * the same surfaces, the same tones, the same components where there are any —
 * and the visitor can put a hand on several of them. Nothing here explains how
 * the product arrives at its answers; an exhibit shows what comes out.
 *
 * They are built to be cheap: transitions and transforms, a couple of short
 * timers, no loops that run when nobody is looking.
 */

/** Runs a callback on a beat, but only while the element is on screen. */
function useBeat(ref: React.RefObject<HTMLElement | null>, ms: number, tick: () => void) {
  const latest = useRef(tick);
  latest.current = tick;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let timer = 0;
    const start = () => {
      if (timer) return;
      timer = window.setInterval(() => latest.current(), ms);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };
    if (typeof IntersectionObserver === "undefined") {
      start();
      return stop;
    }
    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0.2 }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [ref, ms]);
}

/* ------------------------------------------------------------------ 1. calls */

const QUEUE_STEPS = [
  { label: "Принят", tone: "", hint: "файл загружен" },
  { label: "Расшифровка", tone: "warn", hint: "готовим текст" },
  { label: "Разбор", tone: "warn", hint: "собираем оценку" },
  { label: "Готово", tone: "ok", hint: "можно читать" }
];

export function CallQueueExhibit() {
  const frame = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  useBeat(frame, 1900, () => setStep((value) => (value + 1) % QUEUE_STEPS.length));
  const state = QUEUE_STEPS[step];

  return (
    <div className="exhibit exhibit-queue" ref={frame}>
      <div className="exhibit-drop">
        <CloudUpload size={18} />
        <span>Перетащите записи — до десяти за раз</span>
      </div>
      <ul className="exhibit-calls">
        <li className="is-live">
          <span className="exhibit-call-title">Повторный звонок: расчёт по тарифам</span>
          <span className={`status-chip ${state.tone}`}>{state.label}</span>
          <span className="exhibit-call-hint">{state.hint}</span>
          <span className="exhibit-call-track" aria-hidden="true">
            <i style={{ width: `${((step + 1) / QUEUE_STEPS.length) * 100}%` }} />
          </span>
        </li>
        <li>
          <span className="exhibit-call-title">Согласование условий поставки</span>
          <span className="status-chip ok">Готово</span>
          <span className="exhibit-call-hint">оценка 84</span>
        </li>
        <li>
          <span className="exhibit-call-title">Входящий вопрос по доставке</span>
          <span className="status-chip ok">Готово</span>
          <span className="exhibit-call-hint">оценка 61</span>
        </li>
      </ul>
    </div>
  );
}

/* -------------------------------------------------------- 2. transcript + player */

const SPEAKERS = ["Анна Смирнова", "Дмитрий"];

const LINES = [
  { at: 0.04, who: "Анна Смирнова", text: "Добрый день! Компания «Северный ветер», меня зовут Анна. Чем могу помочь?" },
  { at: 0.26, who: "Дмитрий", text: "Здравствуйте. Мы обсуждали поставку партии, хочу уточнить сроки." },
  { at: 0.52, who: "Анна Смирнова", text: "Смотрю заявку. По текущему тарифу отгрузка выходит на четверг." },
  { at: 0.78, who: "Дмитрий", text: "Четверг подходит. Пришлите, пожалуйста, подтверждение на почту." }
];

/** A waveform that looks recorded and stays the same on every visit. */
function waveform(count: number) {
  const bars: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / count;
    const swell = Math.sin(t * Math.PI * 2.6) * 0.46 + Math.sin(t * Math.PI * 9.3 + 0.7) * 0.3;
    const grain = Math.sin(i * 12.9898) * 43758.5453;
    bars.push(0.22 + Math.abs(swell) * 0.62 + (grain - Math.floor(grain)) * 0.16);
  }
  return bars;
}

export function TranscriptExhibit() {
  const frame = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0.26);
  const [playing, setPlaying] = useState(true);
  const bars = useMemo(() => waveform(72), []);
  const active = useMemo(() => {
    let index = 0;
    LINES.forEach((line, i) => {
      if (at >= line.at - 0.02) index = i;
    });
    return index;
  }, [at]);

  useBeat(frame, 90, () => {
    if (!playing) return;
    setAt((value) => (value >= 0.995 ? 0 : value + 0.006));
  });

  const scrub = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setAt(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
  }, []);

  return (
    <div className="exhibit exhibit-transcript" ref={frame}>
      <div className="exhibit-player">
        <button
          type="button"
          className="exhibit-play"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? "Остановить" : "Продолжить"}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <div
          className="exhibit-wave"
          ref={track}
          style={{ "--at": at } as CSSProperties}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setPlaying(false);
            scrub(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) scrub(event);
          }}
          role="presentation"
        >
          {bars.map((height, index) => (
            <i key={index} style={{ height: `${Math.round(height * 100)}%` }} />
          ))}
          <span className="exhibit-wave-head" aria-hidden="true" />
        </div>
        <span className="exhibit-time">{`0:${String(Math.round(at * 43)).padStart(2, "0")}`}</span>
      </div>
      <ol className="exhibit-lines">
        {LINES.map((line, index) => (
          <li key={line.text} className={index === active ? "is-active" : ""}>
            <button type="button" onClick={() => { setPlaying(false); setAt(line.at); }}>
              <span className="exhibit-speaker" style={{ color: speakerColor(line.who, SPEAKERS) }}>
                <i style={{ background: speakerColor(line.who, SPEAKERS) }} aria-hidden="true" />
                {line.who}
              </span>
              <span className="exhibit-line-text">{line.text}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="exhibit-note">Потяните дорожку или нажмите реплику</p>
    </div>
  );
}

/* ------------------------------------------------------------- 3. analysis */

const CRITERIA = [
  { name: "Приветствие и представление", score: 94, quote: "«Компания „Северный ветер“, меня зовут Анна. Чем могу помочь?»" },
  { name: "Выявление потребности", score: 81, quote: "«Уточню, партия та же по объёму или меняется?»" },
  { name: "Работа с возражением", score: 48, quote: "«По цене ничего сделать не могу» — альтернатива не предложена" },
  { name: "Договорённость о следующем шаге", score: 88, quote: "«Пришлю подтверждение на почту сегодня до 18:00»" }
];

const toneOf = (score: number) => (score >= 75 ? "good" : score >= 50 ? "warn" : "bad");

export function AnalysisExhibit() {
  const [picked, setPicked] = useState(2);
  const current = CRITERIA[picked];

  return (
    <div className="exhibit exhibit-analysis">
      <div className="exhibit-analysis-top">
        <ScoreGauge value={84} size={116} caption="из 100" />
        <div className="exhibit-analysis-summary">
          <span className="exhibit-eyebrow">Итог разговора</span>
          <p>
            Клиент подтвердил сроки и ждёт письмо с подтверждением. Цену обсудили,
            альтернативу по тарифу не предложили.
          </p>
          <span className="exhibit-next">
            <ArrowRight size={14} />
            Следующий шаг: отправить подтверждение сегодня
          </span>
        </div>
      </div>
      <ul className="exhibit-criteria">
        {CRITERIA.map((item, index) => (
          <li key={item.name} className={index === picked ? "is-picked" : ""}>
            <button type="button" onClick={() => setPicked(index)}>
              <span className="exhibit-criterion-name">{item.name}</span>
              <span className={`exhibit-bar tone-${toneOf(item.score)}`} aria-hidden="true">
                <i style={{ width: `${item.score}%` }} />
              </span>
              <span className="exhibit-criterion-score">{item.score}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="exhibit-quote">
        <Quote size={14} aria-hidden="true" />
        <p key={current.quote}>{current.quote}</p>
      </div>
      <p className="exhibit-note">Выберите критерий — под ним основание из разговора</p>
    </div>
  );
}

/* ------------------------------------------------------------- 4. scorecard */

const CARD = [
  { name: "Приветствие и представление", weight: 1, critical: false },
  { name: "Выявление потребности", weight: 2, critical: false },
  { name: "Работа с возражением", weight: 3, critical: true },
  { name: "Договорённость о следующем шаге", weight: 2, critical: false }
];

const CARD_SCORES = [94, 81, 48, 88];

export function ScorecardExhibit() {
  const [on, setOn] = useState([true, true, true, true]);
  const total = useMemo(() => {
    let sum = 0;
    let weight = 0;
    CARD.forEach((item, index) => {
      if (!on[index]) return;
      sum += CARD_SCORES[index] * item.weight;
      weight += item.weight;
    });
    return weight ? Math.round(sum / weight) : null;
  }, [on]);

  return (
    <div className="exhibit exhibit-scorecard">
      <div className="exhibit-scorecard-head">
        <span className="exhibit-eyebrow">Инструкция «Стандарт продаж»</span>
        <span className={`exhibit-total tone-${total === null ? "none" : toneOf(total)}`}>
          {total === null ? "—" : total}
          <small>средний балл</small>
        </span>
      </div>
      <ul className="exhibit-card-rows">
        {CARD.map((item, index) => (
          <li key={item.name} className={on[index] ? "" : "is-off"}>
            <button
              type="button"
              role="switch"
              aria-checked={on[index]}
              onClick={() => setOn((was) => was.map((value, i) => (i === index ? !value : value)))}
            >
              <span className="exhibit-switch" aria-hidden="true"><i /></span>
              <span className="exhibit-criterion-name">{item.name}</span>
              <span className="exhibit-weight">вес {item.weight}</span>
              {item.critical && <span className="status-chip bad">критичный</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="exhibit-note">Включите или отключите критерий — балл пересчитается</p>
    </div>
  );
}

/* ---------------------------------------------------------------- 5. review */

export function ReviewExhibit() {
  const [checked, setChecked] = useState(true);

  return (
    <div className="exhibit exhibit-review">
      <div className="segmented exhibit-segmented" role="tablist" aria-label="Версия разбора">
        <button type="button" role="tab" aria-selected={!checked} className={checked ? "" : "is-active"} onClick={() => setChecked(false)}>
          Разбор
        </button>
        <button type="button" role="tab" aria-selected={checked} className={checked ? "is-active" : ""} onClick={() => setChecked(true)}>
          После проверки
        </button>
      </div>
      <div className="exhibit-review-body">
        {checked ? (
          <p key="checked">
            Возражение по цене осталось без альтернативы.{" "}
            <mark>Руководитель уточнил: клиент сравнивал с тарифом «Юг», нужно было предложить его.</mark>
          </p>
        ) : (
          <p key="raw">Возражение по цене осталось без альтернативы.</p>
        )}
        <footer>
          {checked ? (
            <>
              <span className="status-chip ok"><Check size={13} /> Опубликовано</span>
              <span className="exhibit-meta">правка руководителя отдела</span>
            </>
          ) : (
            <>
              <span className="status-chip">Черновик</span>
              <span className="exhibit-meta">версия до проверки</span>
            </>
          )}
        </footer>
      </div>
      <p className="exhibit-note">Публикуется неизменяемая версия, прежняя остаётся в истории</p>
    </div>
  );
}

/* --------------------------------------------------------------- 6. actions */

export function ActionExhibit() {
  const [made, setMade] = useState(false);

  return (
    <div className={`exhibit exhibit-action${made ? " is-made" : ""}`}>
      <div className="exhibit-action-quote">
        <Quote size={14} aria-hidden="true" />
        <p>«Пришлите, пожалуйста, подтверждение на почту» — 00:31</p>
      </div>
      <div className="exhibit-action-arrow" aria-hidden="true">
        <ArrowRight size={16} />
      </div>
      <div className="exhibit-action-reveal" aria-hidden={!made}>
      <div className="exhibit-action-card">
        <span className="exhibit-eyebrow">Действие</span>
        <strong>Отправить подтверждение по поставке</strong>
        <div className="exhibit-action-meta">
          <span><UserRound size={13} /> Анна Смирнова</span>
          <span><CalendarClock size={13} /> сегодня до 18:00</span>
          <span className="status-chip warn">В работе</span>
        </div>
      </div>
      </div>
      {!made && <button type="button" className="exhibit-action-button" onClick={() => setMade(true)}>
        <Sparkles size={14} /> Сделать действием
      </button>}
    </div>
  );
}

/* ------------------------------------------------------------- 7. analytics */

const PERIODS = [
  { label: "7 дней", points: [71, 74, 70, 78, 81, 79, 84], criteria: [92, 74, 51] },
  { label: "30 дней", points: [64, 66, 69, 68, 72, 75, 74, 78, 77, 81, 80, 84], criteria: [89, 70, 46] },
  { label: "90 дней", points: [58, 61, 60, 65, 63, 69, 72, 70, 76, 79, 78, 82, 84], criteria: [85, 66, 42] }
];

const CRITERIA_NAMES = ["Приветствие", "Потребность", "Возражение"];

export function AnalyticsExhibit() {
  const [period, setPeriod] = useState(1);
  const data = PERIODS[period];
  const average = Math.round(data.points.reduce((sum, value) => sum + value, 0) / data.points.length);
  const path = useMemo(() => {
    return data.points
      .map((value, index) => {
        const x = (index / (data.points.length - 1)) * 100;
        const y = 37 - ((value - 50) / 40) * 32;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data]);

  return (
    <div className="exhibit exhibit-analytics">
      <div className="exhibit-analytics-head">
        <span className={`exhibit-total tone-${toneOf(average)}`}>{average}<small>средний балл</small></span>
        <div className="segmented exhibit-segmented" role="tablist" aria-label="Период">
          {PERIODS.map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="tab"
              aria-selected={index === period}
              className={index === period ? "is-active" : ""}
              onClick={() => setPeriod(index)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <svg className="exhibit-chart" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        <path key={`${period}-line`} className="exhibit-chart-line" d={path} />
      </svg>
      <ul className="exhibit-criteria-mini">
        {data.criteria.map((value, index) => (
          <li key={CRITERIA_NAMES[index]}>
            <span>{CRITERIA_NAMES[index]}</span>
            <span className={`exhibit-bar tone-${toneOf(value)}`} aria-hidden="true">
              <i style={{ width: `${value}%` }} />
            </span>
            <span className="exhibit-criterion-score">{value}</span>
          </li>
        ))}
      </ul>
      <p className="exhibit-note" aria-live="polite">Показаны последние {data.label}. Линия и критерии относятся к этому периоду.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ 8. team */

const PEOPLE = [
  { name: "Орлов Сергей", role: "Владелец", chip: "role-owner", sees: "звонки всех своих компаний" },
  { name: "Панова Ольга", role: "Заместитель", chip: "role-deputy", sees: "всю компанию" },
  { name: "Кузнецов Игорь", role: "Руководитель отдела", chip: "role-leader", sees: "отдел продаж" },
  { name: "Анна Смирнова", role: "Сотрудник", chip: "role-member", sees: "свои звонки" }
];

export function AccessExhibit() {
  const [hover, setHover] = useState(3);

  return (
    <div className="exhibit exhibit-access">
      <div className="exhibit-company">
        <span className="integration-icon"><Building2 size={17} /></span>
        <div>
          <strong>Северный ветер</strong>
          <span className="exhibit-meta">2 отдела · 12 человек</span>
        </div>
      </div>
      <ul className="exhibit-people">
        {PEOPLE.map((person, index) => (
          <li key={person.name} className={index === hover ? "is-hovered" : ""}>
            <button type="button" onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)}>
              <span className="exhibit-avatar" aria-hidden="true">{person.name.slice(0, 1)}</span>
              <span className="exhibit-person-name">{person.name}</span>
              <span className={`status-chip ${person.chip}`}>{person.role}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="exhibit-sees">
        Видит: <strong>{PEOPLE[hover].sees}</strong>
      </div>
      <p className="exhibit-note">Наведите на человека — видно, какие звонки ему доступны</p>
    </div>
  );
}

/* --------------------------------------------------------------- 9. credits */

const CREDIT_LIMIT = 12_000;
const DAYS = [200, 320, 160, 440, 360, 280, 520, 400, 320, 640, 360, 480, 240, 520];
const CREDIT_SPENT = DAYS.reduce((sum, value) => sum + value, 0);
const CREDIT_LEFT = CREDIT_LIMIT - CREDIT_SPENT;
const CREDIT_PERCENT = Math.round((CREDIT_LEFT / CREDIT_LIMIT) * 100);

export function CreditsExhibit() {
  const [day, setDay] = useState(9);

  return (
    <div className="exhibit exhibit-credits">
      <div className="exhibit-credits-top">
        <ScoreGauge value={CREDIT_PERCENT} size={104} caption="% остатка" label={`Остаток ${CREDIT_LEFT} из ${CREDIT_LIMIT} кредитов`} />
        <div>
          <span className="exhibit-eyebrow">Лимит отдела · Бизнес Плюс</span>
          <strong>{CREDIT_LEFT.toLocaleString("ru-RU")} из {CREDIT_LIMIT.toLocaleString("ru-RU")}</strong>
          <span className="exhibit-meta">хватит до сброса 1 октября</span>
        </div>
      </div>
      <div className="exhibit-days" role="presentation">
        {DAYS.map((value, index) => (
          <button
            key={index}
            type="button"
            className={index === day ? "is-picked" : ""}
            style={{ "--h": `${(value / Math.max(...DAYS)) * 100}%` } as CSSProperties}
            onMouseEnter={() => setDay(index)}
            onFocus={() => setDay(index)}
            aria-label={`День ${index + 1}: ${value} кредитов`}
          />
        ))}
      </div>
      <div className="exhibit-meta exhibit-days-note">
        {`День ${day + 1}: ${DAYS[day]} кредитов`}
      </div>
      <p className="exhibit-note">Лимиты задаются на компанию и на каждый отдел</p>
    </div>
  );
}

/* --------------------------------------------------------------- 10. privacy */

export function PrivacyExhibit() {
  const [masked, setMasked] = useState(true);

  return (
    <div className="exhibit exhibit-privacy">
      <button
        type="button"
        role="switch"
        aria-checked={masked}
        className="exhibit-privacy-switch"
        onClick={() => setMasked((value) => !value)}
      >
        <span className="exhibit-switch" aria-hidden="true"><i /></span>
        Скрывать персональные данные
      </button>
      <div className="exhibit-privacy-line">
        <span className="exhibit-speaker" style={{ color: speakerColor("Дмитрий", SPEAKERS) }}>
          <i style={{ background: speakerColor("Дмитрий", SPEAKERS) }} aria-hidden="true" />
          Дмитрий
        </span>
        {masked ? (
          <p key="masked">
            Запишите номер <span className="exhibit-mask">[телефон]</span>, а счёт пришлите на{" "}
            <span className="exhibit-mask">[почта]</span>. Оформляем на{" "}
            <span className="exhibit-mask">[имя]</span>.
          </p>
        ) : (
          <p key="raw">Запишите номер +7 900 000-00-00, а счёт пришлите на d.petrov@alfa-log.ru. Оформляем на Петрова Дмитрия.</p>
        )}
      </div>
      <div className="exhibit-privacy-note">
        <Hash size={13} aria-hidden="true" />
        Оригинал записи открывается отдельным доступом и попадает в журнал
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- 11. exchange */

const FORMATS = [
  { icon: <FileText size={17} />, name: "PDF", hint: "отчёт по звонку" },
  { icon: <FileType size={17} />, name: "DOCX", hint: "для редактирования" },
  { icon: <Hash size={17} />, name: "Markdown", hint: "в базу знаний" },
  { icon: <FileSpreadsheet size={17} />, name: "XLSX", hint: "выгрузка таблицей" }
];

export function ExchangeExhibit() {
  return (
    <div className="exhibit exhibit-exchange">
      <div className="exhibit-integration">
        <span className="integration-icon"><Plug size={17} /></span>
        <div>
          <strong>Bitrix24</strong>
          <span className="exhibit-meta">портал подключён · импорт звонков идёт</span>
        </div>
        <span className="status-chip ok"><Check size={13} /> Активно</span>
      </div>
      <ul className="exhibit-formats">
        {FORMATS.map((item) => (
          <li key={item.name}>
            <span className="integration-icon">{item.icon}</span>
            <strong>{item.name}</strong>
            <span className="exhibit-meta">{item.hint}</span>
          </li>
        ))}
      </ul>
      <p className="exhibit-note">Расшифровку можно забрать на любом тарифе</p>
    </div>
  );
}
