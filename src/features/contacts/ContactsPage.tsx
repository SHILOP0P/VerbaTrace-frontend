import { RowsSkeleton } from "../../shared/ui/page-loading";
import { Search, UserMinus, UserPlus, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import type { UserResponse } from "../../types";

const minQueryLength = 2;

export function ContactsPage() {
  const [contacts, setContacts] = useState<UserResponse[]>([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listContacts().then(setContacts).catch((e) => setError(e instanceof Error ? e.message : "Не удалось загрузить контакты.")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const value = query.trim().replace(/^@/, "");
    if (value.length < minQueryLength) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError("");
      api.searchContacts(value)
        .then((items) => { if (!cancelled) setSuggestions(items.filter((user) => !contacts.some((contact) => contact.id === user.id))); })
        .catch((e) => { if (!cancelled) { setSuggestions([]); setError(e instanceof Error ? e.message : "Не удалось выполнить поиск контактов."); } })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, contacts]);

  async function add(user: UserResponse) {
    setBusy(true); setError("");
    try {
      await api.addContact(user.id);
      setContacts((items) => items.some((item) => item.id === user.id) ? items : [user, ...items]);
      setSuggestions((items) => items.filter((item) => item.id !== user.id));
      setQuery("");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось добавить контакт."); }
    finally { setBusy(false); }
  }

  async function remove(userId: string) {
    setBusy(true); setError("");
    try { await api.removeContact(userId); setContacts((items) => items.filter((item) => item.id !== userId)); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось удалить контакт."); }
    finally { setBusy(false); }
  }

  const showSearchState = query.trim().replace(/^@/, "").length >= minQueryLength;
  return <section className="contacts-page app-page atmospheric-page">
    <div className="app-page-heading readable-heading"><h1>Контакты</h1><p>Сохраните коллег, чтобы позже быстро использовать их при разметке участников звонка.</p></div>
    <section className="contacts-add glass-panel"><div><h2>Добавить контакт</h2><p>Начните вводить @username — подходящие пользователи появятся сразу.</p></div><label className="contacts-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="@username" autoComplete="off" /></label>{showSearchState && <div className="contact-suggestions">{searching ? <div className="contact-search-status">Ищу пользователей…</div> : suggestions.length === 0 ? <div className="contact-search-status">Совпадений не найдено.</div> : suggestions.map((user) => <ContactRow key={user.id} user={user} action="add" busy={busy} onAction={() => add(user)} />)}</div>}{error && <div className="form-error">{error}</div>}</section>
    <section className="contacts-list glass-panel"><div className="panel-heading large"><div><h2>Мои контакты</h2><p>{contacts.length} сохранено</p></div><UsersRound size={22} /></div>{loading ? <RowsSkeleton kind="contacts" /> : contacts.length === 0 ? <div className="instruction-empty standalone">Контактов пока нет.</div> : <div className="contact-rows">{contacts.map((user) => <ContactRow key={user.id} user={user} action="remove" busy={busy} onAction={() => remove(user.id)} />)}</div>}</section>
  </section>;
}

function ContactRow({ user, action, busy, onAction }: { user: UserResponse; action: "add" | "remove"; busy: boolean; onAction: () => void; }) {
  const name = `${user.full_name} ${user.full_surname}`.trim() || user.username;
  const headline = user.headline;
  return <article className="contact-row"><span className="avatar">{name[0]?.toUpperCase() ?? "П"}</span><div><strong>{name}</strong><small>{user.username.startsWith("@") ? user.username : `@${user.username}`}{headline ? ` · ${headline}` : ""}</small></div><button className={action === "remove" ? "contact-remove-button" : "primary-button small"} type="button" disabled={busy} onClick={onAction}>{action === "remove" ? <><UserMinus size={16} />Убрать</> : <><UserPlus size={16} />Добавить</>}</button></article>;
}
