import { AudioLines } from "lucide-react";
import type { CSSProperties } from "react";
import type { AnalyticsSpeech, CallSpeech } from "../../types";
import { speakerColor } from "../lib/speaker-colors";
import { HoverHint, InfoHint } from "./hover-hint";

// Each hint is two short lines: what the number is, then a reference point with
// its source. The numbers are observations, not a grade, so nothing is called
// good or bad.
export const speechHints = {
  talk_share: ["Какую часть разговора говорил спикер.", "Ориентир для продавца: 40–60 % (Gong, Avoma)."],
  longest_monologue: ["Самая долгая речь без перерыва. Паузы короче 3 с её не прерывают.", "Ориентир: не дольше 1,5–2,5 мин (Fathom, Gong)."],
  words_per_minute: ["Сколько слов в минуту, пока спикер говорит.", "Ориентир: 100–180 (Avoma)."],
  questions_per_hour: ["Сколько вопросов задано в пересчёте на час разговора.", "Ориентир: от 18 (Gong)."],
  response_pause: ["Сколько спикер обычно ждёт, прежде чем ответить.", "Ориентир: 0,6–1 с (Gong)."],
  switches: ["Сколько раз за 5 минут сменился говорящий. Короткие «да», «угу» не считаются."],
  pauses: ["Молчание между репликами от 4 секунд."],
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

/** The «Речь» block of a call page: who spoke how much and how. */
export function CallSpeechBlock({ speech, hideShare = false }: { speech?: CallSpeech | null; /** The player already shows who spoke when and how much. */ hideShare?: boolean }) {
  if (!speech || speech.speakers.length === 0) return null;
  const keys = speech.speakers.map((speaker) => speaker.speaker_key);
  const name = (speaker: CallSpeech["speakers"][number]) => speaker.display_name || `Спикер ${speaker.speaker_key}`;
  const color = (speaker: CallSpeech["speakers"][number]) => ({ "--speaker-color": speakerColor(speaker.speaker_key, keys) } as CSSProperties);
  return <section className="speech-block" aria-label="Речь">
    <header><span className="speech-title"><AudioLines size={17} />Речь</span><small>Наблюдения по таймингу слов, в оценку не входят</small></header>
    {/* Who held the floor, at a glance; the colours match the cards below. */}
    {!hideShare && <div className="speech-share">
      <span className="speech-share-label">Доля речи в разговоре <InfoHint label="Доля речи" text={speechHints.talk_share} /></span>
      <div className="speech-share-bar" role="img" aria-label={speech.speakers.map((speaker) => `${name(speaker)}: ${formatShare(speaker.talk_share)}`).join(", ")}>
        {speech.speakers.map((speaker) => <HoverHint key={speaker.speaker_key} focusable={false} className="speech-share-segment" style={{ ...color(speaker), flexGrow: Math.max(speaker.talk_share, 0.01) }}
          label={`${name(speaker)} — ${formatShare(speaker.talk_share)}`} detail={`время речи ${formatSeconds(speaker.talk_seconds)}`} />)}
      </div>
      <ul className="speech-share-legend">
        {speech.speakers.map((speaker) => <li key={speaker.speaker_key} style={color(speaker)}><i />{name(speaker)} <b>{formatShare(speaker.talk_share)}</b></li>)}
      </ul>
    </div>}
    <ul className="speech-speakers">
      {speech.speakers.map((speaker) => <li key={speaker.speaker_key} className={speaker.is_subject ? "is-subject" : ""} style={color(speaker)}>
        <strong><i className="speech-speaker-dot" />{name(speaker)}{speaker.is_subject ? <em>сотрудник</em> : null}</strong>
        <dl>
          <div><dt>Самый длинный монолог <InfoHint label="Самый длинный монолог" text={speechHints.longest_monologue} /></dt><dd>{formatSeconds(speaker.longest_monologue_seconds)}</dd></div>
          <div><dt>Темп <InfoHint label="Темп" text={speechHints.words_per_minute} /></dt><dd>{speaker.words_per_minute ?? "—"} сл/мин</dd></div>
          <div><dt>Вопросов в час <InfoHint label="Вопросов в час" text={speechHints.questions_per_hour} /></dt><dd>{speaker.questions_per_hour?.toLocaleString("ru-RU") ?? "—"}</dd></div>
          <div><dt>Выдержка перед ответом <InfoHint label="Выдержка перед ответом" text={speechHints.response_pause} /></dt><dd>{formatPause(speaker.response_pause_median_ms)}</dd></div>
        </dl>
      </li>)}
    </ul>
    <p className="speech-call">
      <span>Смен говорящего за 5 минут: <b>{speech.speaker_switches_per_5min?.toLocaleString("ru-RU") ?? "—"}</b> <InfoHint label="Смены говорящего" text={speechHints.switches} /></span>
      <span>Долгих пауз: <b>{speech.pauses_over_threshold}</b>, самая длинная {formatSeconds(speech.longest_pause_seconds)} <InfoHint label="Долгие паузы" text={speechHints.pauses} /></span>
    </p>
  </section>;
}

/** One line of an employee's speech against the team median. */
export function SpeechComparison({ own, median, personal = false }: { own: AnalyticsSpeech | null; median: AnalyticsSpeech | null; personal?: boolean }) {
  if (!own) return <p className="analytics-muted">{personal
    ? "Нет звонков, где вы отмечены спикером: речь считается только по своему спикеру. Отметьте себя в редакторе расшифровки — «Это я»."
    : "Нет звонков, где сотрудник привязан к спикеру: речь считается только по своему спикеру."}</p>;
  const rows: Array<[string, string, string, string[]]> = [
    ["Доля речи", formatShare(own.talk_share), formatShare(median?.talk_share), speechHints.talk_share],
    ["Самый длинный монолог", formatSeconds(own.longest_monologue_seconds), formatSeconds(median?.longest_monologue_seconds), speechHints.longest_monologue],
    ["Темп, сл/мин", String(own.words_per_minute ?? "—"), String(median?.words_per_minute ?? "—"), speechHints.words_per_minute],
    ["Вопросов в час", own.questions_per_hour?.toLocaleString("ru-RU") ?? "—", median?.questions_per_hour?.toLocaleString("ru-RU") ?? "—", speechHints.questions_per_hour],
    ["Выдержка перед ответом", formatPause(own.response_pause_median_ms), formatPause(median?.response_pause_median_ms), speechHints.response_pause],
  ];
  // A personal account has no team, so there is nothing to compare with.
  return <div className={`speech-comparison${median ? "" : " is-solo"}`} role="table" aria-label={median ? "Речь сотрудника и медиана команды" : "Речь"}>
    <div role="row" className="is-head"><span role="columnheader">Показатель</span><span role="columnheader">Свой</span>{median ? <span role="columnheader">Медиана команды</span> : null}</div>
    {rows.map(([label, value, team, hint]) => <div role="row" key={label}>
      <span role="rowheader">{label} <InfoHint label={label} text={hint} /></span><b role="cell">{value}</b>{median ? <span role="cell">{team}</span> : null}
    </div>)}
    <small>По {own.n} {own.n % 10 === 1 && own.n % 100 !== 11 ? "звонку" : "звонкам"} с привязкой к спикеру. Наблюдение, не оценка.</small>
  </div>;
}
