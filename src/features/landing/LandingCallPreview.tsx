import { ArrowUpRight, CalendarDays, Check, Clock3, FileText, PhoneCall, UsersRound } from "lucide-react";
import { speakerColor } from "../../shared/lib/speaker-colors";
import { LandingJump } from "./LandingJump";

const speakers = ["Анна Смирнова", "Дмитрий"];
const lines = [
  { who: speakers[0], at: "00:02", text: "Добрый день! Уточним сроки по вашей заявке?" },
  { who: speakers[1], at: "00:11", text: "Нужна поставка до конца недели." },
  { who: speakers[0], at: "00:23", text: "Отгрузка в четверг. Сегодня пришлю подтверждение." }
];

/** A compact view of the current call overview. All values are demo content. */
export function LandingCallPreview() {
  return (
    <article className="hero-call" aria-label="Пример обзора звонка">
      <div className="hero-call-heading"><span>Обзор звонка</span><span className="hero-call-demo">Пример интерфейса</span></div>
      <div className="hero-call-selected selected-call-card">
        <span className="hero-call-emblem" aria-hidden="true"><PhoneCall size={20} /></span>
        <div className="hero-call-main">
          <strong>Согласование условий поставки</strong>
          <span className="hero-call-status">● Анализ готов</span>
          <div className="hero-call-meta"><span><CalendarDays size={12} />21 мая · 18:47</span><span><Clock3 size={12} />00:43</span><span><UsersRound size={12} />Продажи</span></div>
        </div>
        <div className="hero-call-score"><strong>80</strong><small>из 100</small></div>
      </div>
      <div className="hero-call-recording">
        <span className="hero-call-file"><FileText size={16} /><span>Запись разговора<small>Фрагмент · 00:43</small></span></span>
        <div className="hero-call-wave" aria-hidden="true">{Array.from({ length: 48 }, (_, i) => <i key={i} style={{ height: `${8 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * .38)) * 24}px` }} />)}</div>
        <LandingJump target="chapter-transcript" aria-label="Подробнее о записи и расшифровке"><ArrowUpRight size={18} /></LandingJump>
      </div>
      <ol className="hero-call-stages" aria-label="Статусы обработки">{["Загружен", "Расшифрован", "Проанализирован"].map(label => <li key={label}><Check size={12} /><span>{label}</span></li>)}</ol>
      <div className="hero-call-results">
        <section className="hero-call-transcript">
          <div className="hero-call-section-head"><h2>Расшифровка</h2><span>Готово</span></div>
          <div className="hero-call-lines">{lines.map(line => <div className="hero-call-line" key={line.at}><div><strong style={{ color: speakerColor(line.who, speakers) }}>{line.who}</strong><time>{line.at}</time></div><p>{line.text}</p></div>)}</div>
          <LandingJump className="hero-call-detail" target="chapter-transcript">Как устроена расшифровка<ArrowUpRight size={14} /></LandingJump>
        </section>
        <section className="hero-call-analysis">
          <div className="hero-call-section-head"><h2>Анализ разговора</h2><span>Готово</span></div>
          <div className="hero-call-summary"><small>Итог разговора</small><p>Поставка согласована. Клиент ждёт подтверждение.</p></div>
          <div className="hero-call-criterion"><span><i />Потребность выявлена</span><strong>90</strong></div>
          <div className="hero-call-criterion is-warning"><span><i />Следующий шаг</span><strong>70</strong></div>
          <div className="hero-call-action"><span>Рекомендация</span><p>Уточнить время отправки подтверждения.</p></div>
          <LandingJump className="hero-call-detail" target="chapter-analysis">Подробнее об анализе<ArrowUpRight size={14} /></LandingJump>
        </section>
      </div>
    </article>
  );
}
