import { AudioLines, Info } from "lucide-react";
import type { AnalyticsSpeech, CallSpeech } from "../../types";

// Vendor reference points go into tooltips only, with their source: the numbers
// are observations, not a grade, and nothing is called good or bad.
export const speechHints = {
  talk_share: "Доля речи — длительность реплик спикера к сумме всех реплик. Ориентиры: Gong — 43 : 57 у продавца и клиента; Avoma — 40–60 %.",
  longest_monologue: "Самая длинная реплика без перерыва (реплики склеиваются при паузе меньше 3 с, как в AWS). Ориентиры: Gong — до 2:30; Fathom помечает монологи от 90 с.",
  words_per_minute: "Слов в минуту внутри своих реплик (AWS AverageWordsPerMinute). Ориентир Avoma — 100–180.",
  questions_per_hour: "Вопросы — предложения с «?», приведённые к часу разговора. Ориентир Gong — от 18 в час.",
  response_pause: "Выдержка перед ответом — медиана паузы «собеседник закончил → спикер начал» (Gong patience). Ориентиры: Gong — 0,6–1 с; Avoma — от 1,25 с.",
  switches: "Живость диалога — смены говорящего за 5 минут; реплики короче трёх слов («да», «угу») не считаются (Gong interactivity).",
  pauses: "Долгие паузы — разрывы между репликами от 4 с (UIS).",
};

export function formatSeconds(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s} с`;
}

export function formatShare(share: number | null | undefined) {
  return share === null || share === undefined ? "—" : `${Math.round(share * 100)} %`;
}

function formatPause(ms: number | null | undefined) {
  return ms === null || ms === undefined ? "—" : `${(ms / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`;
}

function Hint({ text }: { text: string }) {
  return <span className="speech-hint" title={text} aria-label={text} tabIndex={0}><Info size={13} /></span>;
}

/** The «Речь» block of a call page: who spoke how much and how. */
export function CallSpeechBlock({ speech }: { speech?: CallSpeech | null }) {
  if (!speech || speech.speakers.length === 0) return null;
  return <section className="speech-block" aria-label="Речь">
    <header><span className="speech-title"><AudioLines size={17} />Речь</span><small>Наблюдения по таймингу слов, в оценку не входят</small></header>
    <div className="speech-share-bar" aria-hidden="true">
      {speech.speakers.map((speaker) => <span key={speaker.speaker_key} className={speaker.is_subject ? "is-subject" : ""} style={{ flexGrow: Math.max(speaker.talk_share, 0.01) }} />)}
    </div>
    <ul className="speech-speakers">
      {speech.speakers.map((speaker) => <li key={speaker.speaker_key} className={speaker.is_subject ? "is-subject" : ""}>
        <strong>{speaker.display_name || `Спикер ${speaker.speaker_key}`}{speaker.is_subject ? <em>сотрудник</em> : null}</strong>
        <dl>
          <div><dt>Доля речи <Hint text={speechHints.talk_share} /></dt><dd>{formatShare(speaker.talk_share)}</dd></div>
          <div><dt>Самый длинный монолог <Hint text={speechHints.longest_monologue} /></dt><dd>{formatSeconds(speaker.longest_monologue_seconds)}</dd></div>
          <div><dt>Темп <Hint text={speechHints.words_per_minute} /></dt><dd>{speaker.words_per_minute ?? "—"} сл/мин</dd></div>
          <div><dt>Вопросов в час <Hint text={speechHints.questions_per_hour} /></dt><dd>{speaker.questions_per_hour?.toLocaleString("ru-RU") ?? "—"}</dd></div>
          <div><dt>Выдержка перед ответом <Hint text={speechHints.response_pause} /></dt><dd>{formatPause(speaker.response_pause_median_ms)}</dd></div>
        </dl>
      </li>)}
    </ul>
    <p className="speech-call">
      <span>Смен говорящего за 5 минут: <b>{speech.speaker_switches_per_5min?.toLocaleString("ru-RU") ?? "—"}</b> <Hint text={speechHints.switches} /></span>
      <span>Долгих пауз: <b>{speech.pauses_over_threshold}</b>, самая длинная {formatSeconds(speech.longest_pause_seconds)} <Hint text={speechHints.pauses} /></span>
    </p>
  </section>;
}

/** One line of an employee's speech against the team median. */
export function SpeechComparison({ own, median }: { own: AnalyticsSpeech | null; median: AnalyticsSpeech | null }) {
  if (!own) return <p className="analytics-muted">Нет звонков, где сотрудник привязан к спикеру: речь считается только по своему спикеру.</p>;
  const rows: Array<[string, string, string, string]> = [
    ["Доля речи", formatShare(own.talk_share), formatShare(median?.talk_share), speechHints.talk_share],
    ["Самый длинный монолог", formatSeconds(own.longest_monologue_seconds), formatSeconds(median?.longest_monologue_seconds), speechHints.longest_monologue],
    ["Темп, сл/мин", String(own.words_per_minute ?? "—"), String(median?.words_per_minute ?? "—"), speechHints.words_per_minute],
    ["Вопросов в час", own.questions_per_hour?.toLocaleString("ru-RU") ?? "—", median?.questions_per_hour?.toLocaleString("ru-RU") ?? "—", speechHints.questions_per_hour],
    ["Выдержка перед ответом", formatPause(own.response_pause_median_ms), formatPause(median?.response_pause_median_ms), speechHints.response_pause],
  ];
  return <div className="speech-comparison" role="table" aria-label="Речь сотрудника и медиана команды">
    <div role="row" className="is-head"><span role="columnheader">Показатель</span><span role="columnheader">Свой</span><span role="columnheader">Медиана команды</span></div>
    {rows.map(([label, value, team, hint]) => <div role="row" key={label}>
      <span role="rowheader">{label} <Hint text={hint} /></span><b role="cell">{value}</b><span role="cell">{median ? team : "—"}</span>
    </div>)}
    <small>По {own.n} {own.n % 10 === 1 && own.n % 100 !== 11 ? "звонку" : "звонкам"} с привязкой к спикеру. Наблюдение, не оценка.</small>
  </div>;
}
