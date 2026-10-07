import { ArrowLeft, FileText } from "lucide-react";

export const legalDocuments = [
  { path: "/legal/privacy", label: "Конфиденциальность", title: "Политика обработки персональных данных", text: "Здесь будет опубликована информация о данных, целях и сроках обработки, защите данных и порядке обращения к оператору." },
  { path: "/legal/terms", label: "Пользовательское соглашение", title: "Пользовательское соглашение", text: "Здесь будут опубликованы условия использования VerbaTrace, права и обязанности пользователей." },
  { path: "/legal/offer", label: "Публичная оферта", title: "Публичная оферта", text: "Здесь будут опубликованы условия предоставления платного доступа, оплаты, продления и возвратов." },
  { path: "/legal/cookies", label: "Cookie", title: "Использование cookie", text: "Здесь будет опубликована информация об используемых cookie и других технологиях хранения данных в браузере." },
  { path: "/legal/consent", label: "Согласие на обработку данных", title: "Согласие на обработку персональных данных", text: "Здесь будет опубликован отдельный текст согласия с указанием оператора, целей обработки и порядка отзыва." },
  { path: "/legal/details", label: "Реквизиты и контакты", title: "Реквизиты и контакты", text: "Здесь будут опубликованы сведения о владельце сервиса, регистрационные реквизиты и контакты для обращений." },
] as const;

export function LegalPage({ document }: { document: typeof legalDocuments[number] }) {
  const details = document.path === "/legal/details";
  return <section className="c-section c-legal-page">
    <a className="c-text-link" href="/"><ArrowLeft size={16} /> На главную</a>
    <span className="c-eyebrow">Документы VerbaTrace</span>
    <h1>{document.title}</h1>
    <article className="c-legal-placeholder">
      <FileText size={28} aria-hidden="true" />
      <h2>{details ? "Сведения пока не опубликованы" : "Документ пока не опубликован"}</h2>
      <p>{document.text}</p>
      <small>{details ? "Это страница-заглушка. Реквизиты и контакты будут добавлены позже." : "Это страница-заглушка, а не действующий юридический документ."}</small>
    </article>
  </section>;
}
