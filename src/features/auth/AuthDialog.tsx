import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { api, ApiError } from "../../api";
import type { SessionState } from "../../types";
import { Logo } from "../../shared/ui/primitives";
import { useEscapeDismiss } from "../../shared/ui/dismissible-layer";
import "./AuthDialog.css";

export type AuthMode = "login" | "register" | "forgot" | "reset";

export function AuthDialog({
  initialMode,
  onClose,
  onAuth
}: {
  initialMode: AuthMode;
  onClose: () => void;
  onAuth: (session: SessionState) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.documentElement.classList.add("public-auth-open");
    card.current?.querySelector<HTMLInputElement>("input")?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !card.current) return;
      const controls = Array.from(card.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.documentElement.classList.remove("public-auth-open");
      document.removeEventListener("keydown", trapFocus);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  // The reset is offered only once letters really leave: with the mock sender
  // nobody would receive the link.
  const [resetEnabled, setResetEnabled] = useState(false);

  useEscapeDismiss(!busy, onClose);

  useEffect(() => {
    let cancelled = false;
    api.getAuthCapabilities().then((value) => { if (!cancelled) setResetEnabled(value.password_reset_enabled); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  function switchMode(next: AuthMode) {
    setMode(next); setError(""); setNotice("");
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "forgot") {
        await api.requestPasswordReset(email);
        setNotice("Если адрес зарегистрирован, мы отправили на него ссылку. Она действует 30 минут.");
      } else {
        const token = new URLSearchParams(window.location.search).get("token") ?? "";
        await api.confirmPasswordReset(token, password);
        window.history.replaceState({}, "", "/");
        setPassword("");
        switchMode("login");
        setNotice("Пароль изменён. Войдите с новым паролем.");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось выполнить запрос");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    if (mode === "forgot" || mode === "reset") return submitReset(event);
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const response =
        mode === "login"
          ? await api.login({ email, password })
          : await api.register({
            email,
            password,
            full_name: firstName,
            full_surname: lastName,
            ...(username.trim() ? { username: username.trim() } : {})
          });

      onAuth({
        user: response.user
      });
    } catch (submitError) {
      const message =
        submitError instanceof ApiError
          ? `${submitError.message}${submitError.code ? ` (${submitError.code})` : ""}`
          : "Не удалось выполнить вход";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-layer public-auth-layer vt-portal"
      role="presentation"
      onPointerDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={card} className="auth-card" role="dialog" aria-modal="true" aria-label={mode === "login" ? "Вход" : mode === "register" ? "Регистрация" : "Восстановление пароля"}>
        <button className="icon-button close" onClick={onClose} disabled={busy} aria-label="Закрыть">
          <X size={18} />
        </button>
        <Logo />
        <h2>{mode === "login" ? "Войти в VerbaTrace" : mode === "register" ? "Создать аккаунт" : mode === "forgot" ? "Забыли пароль?" : "Новый пароль"}</h2>
        <p>{mode === "forgot" ? "Укажите адрес, с которым вы входите, — пришлём ссылку для смены пароля." : mode === "reset" ? "Придумайте новый пароль — не короче 8 символов. Все прежние входы завершатся." : "Войдите или зарегистрируйтесь, чтобы перейти к рабочему пространству."}</p>

        {(mode === "forgot" || mode === "reset") ? <form onSubmit={submit} className="auth-form">
          {mode === "forgot" ? <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label> : <label>
            Новый пароль
            <input type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>}
          {error && <div className="form-error">{error}</div>}
          {notice && <div className="form-notice" role="status">{notice}</div>}
          <button className="primary-button wide" type="submit" disabled={busy || (mode === "reset" && password.length < 8)}>
            {busy ? "Отправляем..." : mode === "forgot" ? "Прислать ссылку" : "Сохранить пароль"}
          </button>
        </form> : <form onSubmit={submit} className="auth-form">
          {mode === "register" && (
            <div className="form-grid two">
              <label>
                Имя
                <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </label>
              <label>
                Фамилия
                <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </label>
              <label>
                Username
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="@muxa"
                />
              </label>
            </div>
          )}

          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error && <div className="form-error">{error}</div>}
          {notice && <div className="form-notice" role="status">{notice}</div>}

          <button className="primary-button wide" type="submit" disabled={busy}>
            {busy ? "Подключаем..." : mode === "login" ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>}

        {mode === "login" && resetEnabled && <button className="text-button" type="button" onClick={() => switchMode("forgot")}>Забыли пароль?</button>}
        <button
          className="text-button"
          onClick={() => switchMode(mode === "register" ? "login" : mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Нужна регистрация?" : "Уже есть аккаунт?"}
        </button>
      </div>
    </div>
  );
}
