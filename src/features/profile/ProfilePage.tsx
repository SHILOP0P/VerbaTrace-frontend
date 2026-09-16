import {
  ArrowLeft,
  Bell,
  Camera,
  CheckCircle2,
  LockKeyhole,
  MonitorSmartphone,
  Pencil,
  Power,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../../api";
import type {
  AppPage,
  CompanyResponse,
  SessionState,
  Subscription,
  UserResponse
} from "../../types";

import { formatDate } from "../../shared/lib/formatters";
import { ProfileField, SelectControl } from "../../shared/ui/primitives";
import { CompanyMiniCard } from "../companies/CompaniesPage";
import { CreditUsagePanel } from "../tariffs/CreditUsagePanel";
import { AvatarEditor } from "./AvatarEditor";
import { AnalysisPersonalizationCard } from "../analysis-context/AnalysisPersonalizationCard";

const timeZoneOptions = [
  { value: "Europe/Kaliningrad", label: "Калининград (UTC+2)" },
  { value: "Europe/Moscow", label: "Москва (UTC+3)" },
  { value: "Europe/Samara", label: "Самара (UTC+4)" },
  { value: "Asia/Yekaterinburg", label: "Екатеринбург (UTC+5)" },
  { value: "Asia/Omsk", label: "Омск (UTC+6)" },
  { value: "Asia/Krasnoyarsk", label: "Красноярск (UTC+7)" },
  { value: "Asia/Irkutsk", label: "Иркутск (UTC+8)" },
  { value: "Asia/Yakutsk", label: "Якутск (UTC+9)" },
  { value: "Asia/Vladivostok", label: "Владивосток (UTC+10)" },
  { value: "Asia/Magadan", label: "Магадан (UTC+11)" },
  { value: "Asia/Kamchatka", label: "Камчатка (UTC+12)" },
  { value: "UTC", label: "UTC (всемирное время)" },
  { value: "Europe/London", label: "Лондон" },
  { value: "Europe/Berlin", label: "Берлин" },
  { value: "Asia/Dubai", label: "Дубай" },
  { value: "Asia/Almaty", label: "Алматы" },
  { value: "Asia/Tashkent", label: "Ташкент" },
  { value: "Asia/Tokyo", label: "Токио" },
  { value: "America/New_York", label: "Нью-Йорк" },
  { value: "America/Los_Angeles", label: "Лос-Анджелес" }
];

export function ProfilePage({
  session,
  companies,
  personalSubscription,
  onNavigate
}: {
  session: SessionState;
  companies: CompanyResponse[];
  personalSubscription: Subscription | null;
  onUserUpdated: (user: UserResponse) => void;
  onCompanyCreated: (company: CompanyResponse) => void | Promise<void>;
  onNavigate: (page: AppPage) => void;
}) {
  const managedCompanies = companies.filter((company) => company.manager_user_uuid === session.user.id);
  const memberCompanies = companies.filter((company) => company.manager_user_uuid !== session.user.id);
  const username = formatUsername(session.user.username);
  const avatarInitial = profileInitial(session.user.full_name || session.user.full_surname || session.user.username);
  const avatarUrl = session.user.avatar_url;

  return (
    <section className="profile-layout app-page">
      <div className="app-page-heading settings-heading">
        <span className="settings-heading-icon" aria-hidden="true">
          <UserRound size={26} />
        </span>
        <div>
          <h1>Профиль</h1>
          <p>Аккаунт, безопасность и личные параметры пользователя.</p>
        </div>
      </div>

      <section className="profile-overview-card glass-panel">
        <CreditUsagePanel
          session={session}
          companies={[]}
          embeddedHeader={(
            <div className="profile-identity-card">
              <button
                className="icon-button profile-identity-edit"
                type="button"
                aria-label="Изменить профиль"
                title="Изменить профиль"
                onClick={() => onNavigate("profileEdit")}
              >
                <Pencil size={18} />
              </button>
              <div className="avatar profile-identity-avatar">
                {avatarUrl ? <img src={avatarUrl} alt="" /> : avatarInitial}
              </div>
              <div className="profile-identity-copy">
                <h2>{[session.user.full_surname, session.user.full_name].filter(Boolean).join(" ") || username}</h2>
                <div className="profile-identity-meta">
                  <span>{username}</span>
                  <span aria-hidden="true">·</span>
                  <button type="button" onClick={() => onNavigate("settingsTariffs")}>
                    {personalSubscription?.plan.name ?? "Выбрать тариф"}
                  </button>
                </div>
              </div>
            </div>
          )}
        />
      </section>

      <div className="profile-settings-grid">
        <section className="profile-account-panel glass-panel">
          <h2>Данные профиля</h2>

          <div className="profile-data-list">
            <ProfileDataRow
              label={`Тэг: ${username}`}
              note="Для быстрого приглашения сотрудников в компанию"
            />
            <ProfileDataRow label={`Email: ${session.user.email}`} note="Основные данные профиля" />
            <ProfileDataRow label={`Телефон: ${session.user.phone || "не указан"}`} note="Личные данные профиля" />
            <ProfileDataRow label={`Часовой пояс: ${session.user.timezone || "не указан"}`} note="Используется для отображения времени" />
            <ProfileDataRow label="Уведомления профиля" note="Email, приглашения в компании и события подписки" status="Активно" />
            <InvitationsMutedRow />
          </div>
        </section>

        <aside className="profile-security-panel glass-panel">
          <h2>Безопасность</h2>
          <SecurityRow icon={<LockKeyhole size={18} />} title="Пароль" note="Обновлен 12 мая" />
          <SecurityRow
            icon={<MonitorSmartphone size={18} />}
            title="Устройства"
            note="Активные входы и завершение лишних сессий"
            action="Открыть"
            onAction={() => onNavigate("profileDevices")}
          />
          <SecurityRow icon={<Bell size={18} />} title="Уведомления" note="Email и системные события" />
        </aside>
      </div>

      <section className="profile-card glass-panel">
        <div className="panel-heading large">
          <div>
            <h2>Компании пользователя</h2>
            <p>Компании, в которых состоит пользователь.</p>
          </div>
        </div>
        {companies.length === 0 ? (
          <div className="instruction-empty standalone">Компаний пока нет.</div>
        ) : (
          <div className="company-mini-list">
            {managedCompanies.map((company) => (
              <CompanyMiniCard key={company.id} company={company} manager />
            ))}
            {memberCompanies.map((company) => (
              <CompanyMiniCard key={company.id} company={company} manager={false} />
            ))}
          </div>
        )}
        <button className="ghost-button" type="button" onClick={() => onNavigate("settingsCompanies")}>
          Открыть компании
        </button>
      </section>
    </section>
  );
}

export function ProfileEditPage({
  session,
  onUserUpdated,
  onNavigate
}: {
  session: SessionState;
  onUserUpdated: (user: UserResponse) => void;
  onNavigate: (page: AppPage) => void;
}) {
  const [username, setUsername] = useState(formatUsername(session.user.username));
  const [fullName, setFullName] = useState(session.user.full_name);
  const [fullSurname, setFullSurname] = useState(session.user.full_surname);
  const [phone, setPhone] = useState(session.user.phone ?? "");
  const [timezone, setTimezone] = useState(session.user.timezone ?? "Europe/Moscow");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInitial = profileInitial(session.user.full_name || session.user.full_surname || session.user.username);
  const avatarUrl = session.user.avatar_url;

  useEffect(() => {
    setUsername(formatUsername(session.user.username));
    setFullName(session.user.full_name);
    setFullSurname(session.user.full_surname);
    setPhone(session.user.phone ?? "");
    setTimezone(session.user.timezone ?? "Europe/Moscow");
  }, [session.user.username]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess("");
    setError("");

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Введите тэг.");
      return;
    }

    setBusy(true);
    try {
      let updatedUser = await api.updateProfile({
        full_name: fullName.trim(),
        full_surname: fullSurname.trim(),
        phone: phone.trim() || null,
        timezone: timezone.trim() || null
      });

      if (trimmedUsername !== formatUsername(session.user.username)) {
        updatedUser = await api.updateUsername(trimmedUsername);
      }

      onUserUpdated(updatedUser);
      setSuccess("Профиль обновлен.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Не удалось обновить username");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-edit-page app-page">
      <div className="settings-back-row">
        <button className="ghost-button small" type="button" onClick={() => onNavigate("profile")}>
          <ArrowLeft size={16} />
          Назад
        </button>
      </div>
      <div className="app-page-heading settings-heading">
        <span className="settings-heading-icon" aria-hidden="true">
          <Pencil size={26} />
        </span>
        <div>
          <h1>Изменение профиля</h1>
          <p>Можно обновить публичный тэг. Остальные поля появятся после подключения профиля.</p>
        </div>
      </div>

      <div className="profile-edit-grid">
        <form className="profile-edit-form glass-panel" onSubmit={submit}>
          <h2>Данные профиля</h2>
          <div className="form-grid two">
            <label>
              Имя
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </label>
            <label>
              Фамилия
              <input value={fullSurname} onChange={(event) => setFullSurname(event.target.value)} />
            </label>
            <label>
              Тэг / username
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@petrov" />
              <small>Латинские буквы, цифры и `_`, от 4 до 24 символов после `@`.</small>
            </label>
            <label>
              Email
              <input value={session.user.email} disabled />
            </label>
            <label>
              Телефон
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+79990000000" />
            </label>
            <label>
              Часовой пояс
              <SelectControl value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                <option value="">Автоматически (часовой пояс браузера)</option>
                {!timeZoneOptions.some((option) => option.value === timezone) && timezone && (
                  <option value={timezone}>{timezone}</option>
                )}
                {timeZoneOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </SelectControl>
            </label>
          </div>
          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={busy}>
              <Pencil size={18} />
              {busy ? "Сохраняю..." : "Сохранить изменения"}
            </button>
            <button className="ghost-button" type="button" onClick={() => onNavigate("profile")}>
              Отмена
            </button>
          </div>
        </form>

        <aside className="profile-avatar-panel glass-panel">
          <h2>Аватар</h2>
          <div className="avatar edit-preview">{avatarUrl ? <img src={avatarUrl} alt="" /> : avatarInitial}</div>
          <p>Можно загрузить файл аватара или вернуть буквенную заглушку.</p>
          <label className="ghost-button">
            <Camera size={17} />
            Загрузить аватар
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith("image/")) { setError("Выберите изображение."); return; }
                setAvatarFile(file); event.target.value = "";
              }}
            />
          </label>
          <button
            className="ghost-button"
            type="button"
            onClick={async () => {
              await api.deleteAvatar();
              onUserUpdated({ ...session.user, avatar_url: null });
              setSuccess("Аватар сброшен.");
            }}
          >
            Удалить аватар
          </button>
          <ProfileField label="Дата регистрации" value={formatDate(session.user.created_at)} />
        </aside>
      </div>
      {avatarFile && <AvatarEditor file={avatarFile} busy={busy} onCancel={() => setAvatarFile(null)} onSave={async (file) => { setBusy(true); setError(""); try { const response = await api.uploadAvatar(file); onUserUpdated({ ...session.user, avatar_url: `${response.avatar_url}?v=${Date.now()}` }); setSuccess("Аватар обновлен."); setAvatarFile(null); } catch (avatarError) { setError(avatarError instanceof Error ? avatarError.message : "Не удалось загрузить аватар"); } finally { setBusy(false); } }} />}

      <div className="profile-edit-grid single">
        <AnalysisPersonalizationCard
          scope="personal"
          ownerUuid={session.user.id}
          title="Персонализация анализа"
          description="Этот текст используется только для ваших личных звонков и помогает анализатору учитывать ваш контекст."
          editable={!busy}
        />
        <form
          className="profile-edit-form glass-panel"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setSuccess("");
            try {
              await api.updatePassword({ current_password: currentPassword, new_password: newPassword });
              setCurrentPassword("");
              setNewPassword("");
              setSuccess("Пароль обновлен.");
            } catch (passwordError) {
              setError(passwordError instanceof Error ? passwordError.message : "Не удалось обновить пароль");
            }
          }}
        >
          <h2>Пароль</h2>
          <p className="muted">Введите текущий пароль и новый пароль. После сохранения backend применит свои правила проверки сложности.</p>
          <div className="form-grid two">
            <label>
              Текущий пароль
              <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            </label>
            <label>
              Новый пароль
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </label>
          </div>
          <button className="primary-button" type="submit" disabled={!currentPassword || !newPassword}>
            Обновить пароль
          </button>
        </form>
      </div>
    </section>
  );
}

export function DevicesPage({
  onBackToProfile,
  onLogoutAll
}: {
  onBackToProfile: () => void;
  onLogoutAll: () => Promise<void>;
}) {
  const [sessions, setSessions] = useState<Array<{ id: string; current: boolean; user_agent: string | null; ip: string | null; created_at: string; last_seen_at: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [endingSessionId, setEndingSessionId] = useState("");
  const [actionError, setActionError] = useState("");
  const [sessionControl, setSessionControl] = useState({ canManage: false, availableAt: null as string | null, retryAfterSeconds: 0 });

  useEffect(() => {
    let cancelled = false;

    api.listSessions()
      .then((response) => {
        if (!cancelled) {
          setSessions(response.sessions);
          setSessionControl({ canManage: response.can_manage_other_sessions ?? true, availableAt: response.available_at ?? null, retryAfterSeconds: response.retry_after_seconds ?? 0 });
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить устройства");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!actionError) return;
    const timeout = window.setTimeout(() => setActionError(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [actionError]);

  const sessionControlMessage = useMemo(() => sessionControl.canManage ? "Можно завершать другие активные сеансы." : `Завершение других сеансов станет доступно ${formatSessionAvailability(sessionControl.availableAt, sessionControl.retryAfterSeconds)}.`, [sessionControl]);

  return (
    <section className="devices-page app-page settings-subpage-layout">
      <div className="settings-back-row">
        <button className="ghost-button small" type="button" onClick={onBackToProfile}>
          <ArrowLeft size={16} />
          Назад
        </button>
      </div>
      <div className="app-page-heading settings-heading">
        <span className="settings-heading-icon" aria-hidden="true">
          <MonitorSmartphone size={26} />
        </span>
        <div>
          <h1>Устройства</h1>
          <p>Активные входы в аккаунт. Завершайте сессии, которыми больше не пользуетесь.</p>
        </div>
      </div>

      <section className="devices-panel glass-panel">
        <div className="devices-panel-head">
          <div>
            <h2>Активные сеансы</h2>
            <p>Если устройство больше не используется, завершите отдельный сеанс или выйдите везде сразу.</p>
          </div>
          <button
            className="primary-button small"
            type="button"
            disabled={loggingOutAll || !sessionControl.canManage}
            onClick={async () => {
              setLoggingOutAll(true);
              setActionError("");
              try {
                await onLogoutAll();
              } catch (logoutError) {
                const availability = sessionControlFromError(logoutError);
                if (availability) setSessionControl(availability);
                setActionError(sessionTerminationError(logoutError));
                setLoggingOutAll(false);
              }
            }}
          >
            <Power size={16} />
            {loggingOutAll ? "Завершаю..." : "Завершить все сеансы"}
          </button>
        </div>
        <p className={`session-control-status ${sessionControl.canManage ? "ready" : "waiting"}`}>{sessionControlMessage}</p>
        {actionError && <div className="form-error">{actionError}</div>}
        {loading ? (
          <div className="instruction-empty standalone">Загружаю устройства...</div>
        ) : error ? (
          <div className="form-error">Не удалось загрузить устройства. Можно завершить все сеансы и войти заново.</div>
        ) : sessions.length === 0 ? (
          <div className="instruction-empty standalone">Активных устройств не найдено.</div>
        ) : (
          <div className="device-list">
            {sessions.map((item) => {
              const info = deviceInfo(item.user_agent);
              return (
                <article className={`device-card ${item.current ? "current" : ""}`} key={item.id}>
                  <span className="device-icon" aria-hidden="true">
                    <MonitorSmartphone size={22} />
                  </span>
                  <div className="device-main">
                    <div>
                      <strong>{item.current ? "Текущее устройство" : info.title}</strong>
                      <small>{info.subtitle}</small>
                    </div>
                    <div className="device-meta">
                      <span>IP: {item.ip || "не указан"}</span>
                      <span>Вход: {formatDate(item.created_at)}</span>
                      {item.last_seen_at && <span>Активность: {formatDate(item.last_seen_at)}</span>}
                    </div>
                  </div>
                  {item.current ? (
                    <span className="status-chip ok">Сейчас</span>
                  ) : (
                    <button
                      className="ghost-button small"
                      type="button"
                      disabled={endingSessionId === item.id || !sessionControl.canManage}
                      onClick={async () => {
                        setActionError("");
                        setEndingSessionId(item.id);
                        try {
                          await api.deleteSession(item.id);
                          setSessions((current) => current.filter((sessionItem) => sessionItem.id !== item.id));
                        } catch (deleteError) {
                          const availability = sessionControlFromError(deleteError);
                          if (availability) setSessionControl(availability);
                          setActionError(sessionTerminationError(deleteError));
                        } finally {
                          setEndingSessionId("");
                        }
                      }}
                    >
                      <Power size={15} />
                      {endingSessionId === item.id ? "Завершаю..." : "Завершить"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function sessionTerminationError(error: unknown) {
  if (error instanceof ApiError && error.code === "session_trust_age_required") {
    return "Для защиты аккаунта завершать отдельные сеансы можно через 24 часа после входа в текущий сеанс.";
  }

  return error instanceof Error ? error.message : "Не удалось завершить сеанс. Повторите попытку.";
}

function sessionControlFromError(error: unknown) {
  if (!(error instanceof ApiError) || error.code !== "session_trust_age_required") return null;
  return {
    canManage: false,
    availableAt: typeof error.details?.available_at === "string" ? error.details.available_at : null,
    retryAfterSeconds: typeof error.details?.retry_after_seconds === "number" ? error.details.retry_after_seconds : 0
  };
}

function formatSessionAvailability(availableAt: string | null, retryAfterSeconds: number) {
  if (availableAt) {
    const date = new Date(availableAt);
    if (!Number.isNaN(date.getTime())) return `после ${formatDate(date.toISOString())}`;
  }
  if (retryAfterSeconds > 0) {
    const hours = Math.floor(retryAfterSeconds / 3600);
    const minutes = Math.ceil((retryAfterSeconds % 3600) / 60);
    return hours > 0 ? `через ${hours} ч ${minutes} мин` : `через ${minutes} мин`;
  }
  return "после подтверждения текущего сеанса";
}

/**
 * InvitationsMutedRow is the "do not disturb" switch: with it on nobody can
 * send this user company or department invitations at all.
 */
function InvitationsMutedRow() {
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getPreferences()
      .then((preferences) => {
        if (!cancelled) setMuted(Boolean(preferences.invitations_muted));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      const updated = await api.updatePreferences({ invitations_muted: !muted });
      setMuted(Boolean(updated.invitations_muted));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Не удалось изменить настройку");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-data-row">
      <div>
        <strong>Приглашения в компании</strong>
        <small>
          {muted
            ? "Никто не может прислать вам приглашение"
            : "Вы можете получать приглашения в компании и отделы"}
        </small>
        {error && <small className="form-error">{error}</small>}
      </div>
      <button className="text-button" type="button" onClick={() => void toggle()} disabled={busy}>
        {muted ? "Разрешить" : "Не беспокоить"}
      </button>
    </div>
  );
}

function ProfileDataRow({
  label,
  note,
  status,
  action,
  onAction
}: {
  label: string;
  note: string;
  status?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="profile-data-row">
      <div>
        <strong>{label}</strong>
        <small>{note}</small>
      </div>
      {status && <span className="status-chip ok">{status}</span>}
      {action && (
        <button className="text-button" type="button" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

function SecurityRow({
  icon,
  title,
  note,
  action,
  onAction
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="security-row">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{note}</small>
      </div>
      {action ? (
        <button className="text-button" type="button" onClick={onAction}>
          {action}
        </button>
      ) : (
        <span className="status-chip ok">
          <CheckCircle2 size={14} />
          Активно
        </span>
      )}
    </div>
  );
}

function deviceInfo(userAgent: string | null) {
  const value = userAgent ?? "";
  const browser = value.includes("Edg/")
    ? "Microsoft Edge"
    : value.includes("Chrome/")
      ? "Google Chrome"
      : value.includes("Firefox/")
        ? "Mozilla Firefox"
        : value.includes("Safari/")
          ? "Safari"
          : "Браузер";
  const system = value.includes("Windows")
    ? "Windows"
    : value.includes("Mac OS")
      ? "macOS"
      : value.includes("Android")
        ? "Android"
        : value.includes("iPhone") || value.includes("iPad")
          ? "iOS"
          : "ОС не определена";

  return {
    title: `${browser}, ${system}`,
    subtitle: value ? "Данные браузера распознаны по user-agent" : "Backend не передал данные браузера"
  };
}

function formatUsername(username: string) {
  const trimmed = username.trim();
  if (!trimmed) return "@username";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function profileInitial(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed[0].toUpperCase() : "П";
}

function roleLabel(role: string) {
  if (role === "admin") return "Администратор";
  if (role === "company_manager") return "Менеджер компании";
  if (role === "department_leader") return "Руководитель отдела";
  if (role === "employee") return "Сотрудник";
  return "Пользователь";
}
