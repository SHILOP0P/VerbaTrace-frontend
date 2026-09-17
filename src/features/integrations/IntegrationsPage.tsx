import {
  ArrowLeft,
  AppWindow,
  Copy,
  KeyRound,
  Link2,
  PlugZap,
  ScrollText,
  Settings2,
  ShieldCheck,
  UploadCloud,
  UserCog,
  Webhook,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api";
import type {
  CompanyResponse,
  CompanyMemberListItemResponse,
  DepartmentResponse,
  BitrixConnectionHealth,
  BitrixExternalUser,
  BitrixBackfill,
  BitrixBackfillPreview,
  BitrixMappingChange,
  BitrixMappingPreview,
  CreatedIntegrationKey,
  DeveloperApplication,
  IntegrationAuditEvent,
  IntegrationConnection,
  IntegrationIngestItem,
  IntegrationServiceAccount,
  IntegrationAPIKey,
  IntegrationWebhook,
  IntegrationWebhookDelivery,
  SessionState,
} from "../../types";
import { SelectControl } from "../../shared/ui/primitives";
import { TransientAlert } from "../../shared/ui/TransientAlert";
import { CustomScrollbar } from "../../shared/ui/custom-scrollbar";
import { DateTimePicker } from "../../shared/ui/DateTimePicker";

const statusLabels: Record<string, string> = {
  active: "Активно", disabled: "Отключено", revoked: "Отозвано", draft: "Черновик",
  degraded: "Есть ошибки", received: "Получено", processing: "Обрабатывается",
  retry_wait: "Ожидает повтора", failed: "Ошибка", completed: "Завершено",
  cancelled: "Отменено", succeeded: "Доставлено", pending: "Ожидает",
	authorizing: "Авторизация", testing: "Проверка", paused: "Приостановлено", reconnect_required: "Нужно переподключить",
};
const auditLabels: Record<string, string> = {
  "ingest.accepted": "Импорт принят", "ingest.completed": "Импорт завершён",
  "ingest.failed": "Ошибка импорта", "ingest.retry_scheduled": "Назначена повторная обработка", "connection.created": "Подключение создано",
  "connection.updated": "Настройки подключения изменены", "connection.enabled": "Подключение включено",
  "connection.disabled": "Подключение остановлено", "connection.revoked": "Подключение отозвано",
  "service_account.created": "Сервисный аккаунт создан", "service_account.revoked": "Сервисный аккаунт отозван",
  "key.created": "API-ключ выпущен", "key.rotated": "API-ключ заменён", "key.revoked": "API-ключ отозван",
  "webhook.created": "Webhook создан", "webhook.revoked": "Webhook отозван", "webhook.test_queued": "Тестовый webhook поставлен в очередь",
};
const scopeLabels: Record<string, string> = {
  "calls:write": "Загрузка звонков", "calls:read": "Чтение звонков",
  "usage:read": "Просмотр расхода кредитов", "destinations:read": "Просмотр доступных папок",
  "webhooks:read": "Просмотр webhooks", "webhooks:write": "Управление webhooks",
};
const actorLabels: Record<string, string> = { user: "Пользователь", service_account: "Сервисный аккаунт", system: "Система" };
const entityLabels: Record<string, string> = { connection: "Подключение", ingest_item: "Импорт", service_account: "Сервисный аккаунт", api_key: "API-ключ", webhook: "Webhook" };

const integrationsPageStateKey = "verbatrace:integrations-page:v1";

type IntegrationsPageState = {
  applicationUUID?: string;
  scrollTop?: number;
};

type IntegrationConnectionViewState = {
  connectionUUID?: string;
  detailView?: "overview" | "imports" | "audit";
  importsPage?: number;
  auditPage?: number;
};

function readSessionState<T>(key: string): T | null {
  try {
    const value = window.sessionStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

function writeSessionState(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The page remains usable when browser storage is unavailable.
  }
}

function connectionViewStateKey(applicationUUID: string) {
  return `verbatrace:integration-view:v1:${applicationUUID}`;
}

function isBitrixConnection(connection: IntegrationConnection | undefined): boolean {
  if (!connection) return false;
  return connection.provider === "bitrix24"
    || connection.settings.provider_contract_version === 1
    || typeof connection.settings.portal_domain_display === "string";
}
const placementLabels: Record<string, string> = { connection_default: "Папка подключения", request_override: "Папка из запроса", system_external: "Системная папка «Внешние»" };

function ScopeList({ scopes }: { scopes: string[] }) {
  return <span className="integration-scope-list">{scopes.map((scope) => <span title={scope} key={scope}><ShieldCheck size={13}/>{scopeLabels[scope] ?? scope}</span>)}</span>;
}

function CapabilityState({ label, ok }: { label: string; ok: boolean }) {
	return <span className={`bitrix-capability ${ok ? "ok" : "missing"}`}><span aria-hidden="true">{ok ? "✓" : "!"}</span><span><strong>{label}</strong><small>{ok ? "Доступно" : "Требует настройки"}</small></span></span>;
}

function portalDomainForInput(...values: unknown[]) {
	const value = values.find((item) => typeof item === "string" && item.trim()) as string | undefined;
	if (!value || /^oauth\.bitrix\./i.test(value.trim())) return "";
	return value.trim();
}

type BitrixBackfillRange = { from: string; to: string };

type BitrixMappingDraft = { internalUserId: string; departmentId: string; status: "mapped" | "ignored" | "unmapped" };

function BitrixMappingRow({ user, draft, departments, members, membersLoading, busy, onChange }: {
	user: BitrixExternalUser;
	draft: BitrixMappingDraft;
	departments: DepartmentResponse[];
	members: CompanyMemberListItemResponse[];
	membersLoading: boolean;
	busy: boolean;
	onChange: (draft: BitrixMappingDraft) => void;
}) {
	const availableMembers = members.filter((member) => member.status === "active" && (
		draft.departmentId
			? member.departments.some((department) => department.department_uuid === draft.departmentId && department.status === "active")
			: member.company_role === "company_manager"
	));
	const changed = draft.internalUserId !== (user.internal_user_uuid ?? "") || draft.departmentId !== (user.department_uuid ?? "") || draft.status !== user.mapping_status;
	return <article className={`bitrix-mapping-row is-${user.mapping_status}`}>
		<div><strong>{user.display_name}</strong><small>Bitrix24 ID {user.external_user_id} · {user.active ? "активен" : "уволен"}{changed ? " · есть несохранённое изменение" : ""}</small></div>
		<SelectControl disabled={busy || draft.status === "ignored"} aria-label={`Отдел для ${user.display_name}`} value={draft.departmentId} onChange={(event) => onChange({ departmentId: event.target.value, internalUserId: "", status: "unmapped" })}><option value="">Уровень компании — без отдела</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</SelectControl>
		<SelectControl disabled={busy || membersLoading || draft.status === "ignored"} aria-label={`Пользователь VerbaTrace для ${user.display_name}`} value={draft.internalUserId} onChange={(event) => onChange({ ...draft, internalUserId: event.target.value, status: event.target.value ? "mapped" : "unmapped" })}><option value="">{membersLoading ? "Загружаю участников…" : "Не сопоставлен"}</option>{availableMembers.map((member) => <option key={`${draft.departmentId || "company"}-${member.user_uuid}`} value={member.user_uuid}>{[member.full_surname, member.full_name].filter(Boolean).join(" ") || member.username || "Участник"}{!draft.departmentId ? " · руководитель компании" : ""}</option>)}</SelectControl>
		<button className="ghost-button small" type="button" disabled={busy} onClick={() => onChange(draft.status === "ignored" ? { internalUserId: "", departmentId: "", status: "unmapped" } : { internalUserId: "", departmentId: "", status: "ignored" })}>{draft.status === "ignored" ? "Вернуть к выбору" : "Игнорировать"}</button>
	</article>;
}

function AuditEventEmblem({ type }: { type: string }) {
  const kind = type.split(".")[0];
  const Icon = kind === "ingest" ? UploadCloud : kind === "connection" ? Settings2 : kind === "webhook" ? Webhook : kind === "key" ? KeyRound : kind === "service_account" ? UserCog : ScrollText;
  return <span className={`integration-icon is-audit-event is-${kind}`}><Icon size={17}/></span>;
}

async function copyToClipboard(value: string, onCopied: () => void, onFailed: () => void) {
  try {
    await navigator.clipboard.writeText(value);
    onCopied();
  } catch {
    onFailed();
  }
}

export function IntegrationsPage({
  session,
  companies,
  departments,
  onBack,
}: {
  session: SessionState;
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  onBack: () => void;
}) {
  const managed = companies.filter(
    (company) => company.manager_user_uuid === session.user.id,
  );
  const [owner, setOwner] = useState(() => managed[0]?.id ?? "user");
  const ownerAutoSelectedRef = useRef(managed.length > 0);
  const [apps, setApps] = useState<DeveloperApplication[]>([]);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">(
    "sandbox",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedIntegrationKey | null>(
    null,
  );
  const [copyMessage, setCopyMessage] = useState("");
  const pageScrollRef = useRef<HTMLElement>(null);
  const initialPageStateRef = useRef(readSessionState<IntegrationsPageState>(integrationsPageStateKey));
  const restoringScrollRef = useRef((initialPageStateRef.current?.scrollTop ?? 0) > 0);
  const [keyApp, setKeyApp] = useState("");
  const [keyName, setKeyName] = useState("Основной ключ");
  const [keyLimitMode, setKeyLimitMode] = useState<"none" | "permanent" | "temporary">("none");
  const [keyCreditLimit, setKeyCreditLimit] = useState("");
  const [keyLimitStartsAt, setKeyLimitStartsAt] = useState("");
  const [keyLimitEndsAt, setKeyLimitEndsAt] = useState("");
  const ownerType = owner === "user" ? "user" : "company";
  const ownerId = owner === "user" ? undefined : owner;
  useEffect(() => {
    if (ownerAutoSelectedRef.current || managed.length === 0) return;
    ownerAutoSelectedRef.current = true;
    setOwner((current) => current === "user" ? managed[0].id : current);
  }, [managed]);
  useEffect(() => {
    let alive = true;
    setMessage("");
    api
      .listDeveloperApplications(ownerType, ownerId)
      .then((value) => {
        if (alive) {
          setApps(value.applications);
          const savedApplicationUUID = initialPageStateRef.current?.applicationUUID;
          setKeyApp(
            value.applications.some((app) => app.application_uuid === savedApplicationUUID)
              ? savedApplicationUUID ?? ""
              : value.applications[0]?.application_uuid ?? "",
          );
        }
      })
      .catch((error) => {
        if (alive)
          setMessage(
            error instanceof ApiError
              ? error.message
              : "Не удалось загрузить приложения.",
          );
      });
    return () => {
      alive = false;
    };
  }, [owner, ownerId, ownerType]);
  useEffect(() => {
    if (!keyApp || apps.length === 0) return;
    const current = readSessionState<IntegrationsPageState>(integrationsPageStateKey) ?? {};
    writeSessionState(integrationsPageStateKey, { ...current, applicationUUID: keyApp });
  }, [apps.length, keyApp]);
  useEffect(() => {
    const target = pageScrollRef.current;
    if (!target) return;

    let frame = 0;
    const saveScroll = () => {
      if (restoringScrollRef.current) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const current = readSessionState<IntegrationsPageState>(integrationsPageStateKey) ?? {};
        writeSessionState(integrationsPageStateKey, { ...current, scrollTop: target.scrollTop });
      });
    };
    target.addEventListener("scroll", saveScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", saveScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    const target = pageScrollRef.current;
    const savedScrollTop = initialPageStateRef.current?.scrollTop ?? 0;
    if (!target || !keyApp || savedScrollTop <= 0) {
      restoringScrollRef.current = false;
      return;
    }
    const scrollTarget = target;

    const observer = new ResizeObserver(restore);
    const timeout = window.setTimeout(() => {
      restore();
      restoringScrollRef.current = false;
      observer.disconnect();
    }, 5000);
    function restore() {
      scrollTarget.scrollTop = Math.min(savedScrollTop, Math.max(0, scrollTarget.scrollHeight - scrollTarget.clientHeight));
      if (Math.abs(scrollTarget.scrollTop - savedScrollTop) <= 1) {
        restoringScrollRef.current = false;
        observer.disconnect();
        window.clearTimeout(timeout);
      }
    }
    observer.observe(scrollTarget);
    const frame = window.requestAnimationFrame(restore);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [keyApp]);
  async function createApp() {
    if (!name.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const app = await api.createDeveloperApplication({
        owner_type: ownerType,
        owner_uuid: ownerId,
        name: name.trim(),
        environment,
		capabilities: ["calls:write", "calls:read", "usage:read", "destinations:read", "webhooks:read", "webhooks:write"],
        daily_credit_limit: environment === "sandbox" ? 25000 : undefined,
        monthly_credit_limit: environment === "sandbox" ? 100000 : undefined,
        max_credits_per_operation: 250000,
      });
      setApps((current) => [app, ...current]);
      setKeyApp(app.application_uuid);
      setName("");
      setMessage("Приложение создано.");
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Не удалось создать приложение.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function createKey() {
    if (!keyApp || !keyName.trim()) return;
    const creditLimit = Number(keyCreditLimit);
    if (keyLimitMode !== "none" && (!Number.isSafeInteger(creditLimit) || creditLimit < 0)) {
      setMessage("Укажите лимит целым неотрицательным числом кредитов.");
      return;
    }
    if (keyLimitMode === "temporary") {
      const startsAt = new Date(keyLimitStartsAt);
      const endsAt = new Date(keyLimitEndsAt);
      if (!keyLimitStartsAt || !keyLimitEndsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        setMessage("Для временного лимита укажите корректный период: окончание должно быть позже начала.");
        return;
      }
    }
    setBusy(true);
    setMessage("");
    try {
      setCreatedKey(
        await api.createIntegrationKey(keyApp, {
          name: keyName.trim(),
          scopes: ["calls:write", "calls:read", "usage:read", "destinations:read", "webhooks:read", "webhooks:write"],
          permanent_credit_limit: keyLimitMode === "permanent" ? creditLimit : undefined,
          temporary_credit_limit: keyLimitMode === "temporary" ? creditLimit : undefined,
          temporary_limit_starts_at: keyLimitMode === "temporary" ? new Date(keyLimitStartsAt).toISOString() : undefined,
          temporary_limit_ends_at: keyLimitMode === "temporary" ? new Date(keyLimitEndsAt).toISOString() : undefined,
        }),
      );
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Не удалось выпустить ключ.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section ref={pageScrollRef} className="integrations-page app-page settings-subpage-layout custom-scroll-target">
      <div className="settings-back-row">
        <button className="ghost-button small" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          Назад
        </button>
      </div>
      <header className="app-page-heading settings-heading">
        <span className="settings-heading-icon">
          <PlugZap size={27} />
        </span>
        <div>
          <h1>Интеграции и API</h1>
          <p>
            Отдельные тестовые и рабочие приложения для внешних систем.
          </p>
        </div>
      </header>
      {message && (
        <p className="admin-action-status" role="status">
          {message}
        </p>
      )}
      <div className="integration-grid">
        <section className="glass integration-card">
          <h2>Новое приложение</h2>
          <label>
            Владелец
            <SelectControl
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="user">Личный аккаунт</option>
              {managed.map((company) => (
                <option value={company.id} key={company.id}>
                  {company.name}
                </option>
              ))}
            </SelectControl>
          </label>
          <label>
            Название
            <input
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, тестовый Bitrix24"
            />
          </label>
          <label>
            Окружение
            <SelectControl
              value={environment}
              onChange={(e) =>
                setEnvironment(e.target.value as "sandbox" | "production")
              }
            >
              <option value="sandbox">Тестовая среда — тестовые кредиты</option>
              <option value="production">Рабочая среда — реальные кредиты</option>
            </SelectControl>
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void createApp()}
          >
            {busy ? "Создаю…" : "Создать приложение"}
          </button>
        </section>
        <section className="glass integration-card">
          <h2>Выпустить API-ключ</h2>
          <p className="integration-warning">
            <ShieldCheck size={17} />
            Секрет показывается один раз. После закрытия его нельзя посмотреть
            снова.
          </p>
          <label>
            Приложение
            <SelectControl
              value={keyApp}
              onChange={(e) => setKeyApp(e.target.value)}
            >
              <option value="">Выберите приложение</option>
              {apps.map((app) => (
                <option value={app.application_uuid} key={app.application_uuid}>
                  {app.name} · {app.environment === "sandbox" ? "тестовая среда" : "рабочая среда"}
                </option>
              ))}
            </SelectControl>
          </label>
          <label>
            Название ключа
            <input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
            />
          </label>
          <label>
            Ограничение расхода
            <SelectControl value={keyLimitMode} onChange={(e) => setKeyLimitMode(e.target.value as "none" | "permanent" | "temporary")}>
              <option value="none">Без отдельного лимита</option>
              <option value="permanent">На весь срок ключа</option>
              <option value="temporary">На заданный период</option>
            </SelectControl>
          </label>
          {keyLimitMode !== "none" && (
            <label>
              Лимит, кредитов
              <input type="number" min="0" step="1" value={keyCreditLimit} onChange={(e) => setKeyCreditLimit(e.target.value)} placeholder="Например, 10000" />
            </label>
          )}
          {keyLimitMode === "temporary" && (
            <div className="integration-key-limit-period">
              <label>Начало периода<input type="datetime-local" value={keyLimitStartsAt} onChange={(e) => setKeyLimitStartsAt(e.target.value)} /></label>
              <label>Окончание периода<input type="datetime-local" value={keyLimitEndsAt} onChange={(e) => setKeyLimitEndsAt(e.target.value)} /></label>
            </div>
          )}
          <p className="integration-limit-note">Лимит фиксируется при выпуске ключа. Чтобы задать другой, отзовите ключ и выпустите новый.</p>
          <button
            className="ghost-button"
            type="button"
            disabled={busy || !keyApp || !keyName.trim() || (keyLimitMode !== "none" && keyCreditLimit === "") || (keyLimitMode === "temporary" && (!keyLimitStartsAt || !keyLimitEndsAt))}
            onClick={() => void createKey()}
          >
            <KeyRound size={17} />
            Выпустить ключ
          </button>
        </section>
      </div>
      <section className="glass integration-list">
        <h2 className="integration-title"><span className="integration-icon is-app"><AppWindow size={20}/></span>Приложения</h2>
        {apps.length === 0 ? (
          <p>Приложений пока нет.</p>
        ) : (
          apps.map((app) => (
            <button
              className={`integration-connection-row${keyApp === app.application_uuid ? " active" : ""}`}
              type="button"
              key={app.application_uuid}
              onClick={() => setKeyApp(app.application_uuid)}
            >
              <div className="integration-row-summary">
                <span className="integration-icon is-app"><AppWindow size={17}/></span>
                <span><strong>{app.name}</strong></span>
              </div>
              <span className={`integration-environment ${app.environment}`}>
                {app.environment === "sandbox" ? "Тестовая" : "Рабочая"}
              </span>
              <span>{statusLabels[app.status] ?? app.status}</span>
            </button>
          ))
        )}
      </section>
      {keyApp && (
        <ConnectionManager
          key={keyApp}
          application={apps.find((app) => app.application_uuid === keyApp)!}
          busy={busy}
          departments={departments}
          setBusy={setBusy}
          setMessage={setMessage}
          onApplicationChanged={(updated) => {
            setApps((current) =>
              current.map((app) =>
                app.application_uuid === updated.application_uuid
                  ? updated
                  : app,
              ),
            );
            if (updated.status === "revoked") setKeyApp("");
          }}
        />
      )}
      {createdKey && (
        <div className="integration-secret-backdrop" role="presentation">
          <section
            className="integration-secret-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="integration-key-title"
          >
            <KeyRound size={28} />
            <h2 id="integration-key-title">Сохраните ключ сейчас</h2>
            <p>После закрытия VerbaTrace больше не покажет этот секрет.</p>
            <code>{createdKey.secret}</code>
            <button
              className="ghost-button"
              type="button"
              onClick={() => void copyToClipboard(createdKey.secret, () => { setCopyMessage(""); window.setTimeout(() => setCopyMessage("Ключ скопирован"), 0); }, () => setCopyMessage("Не удалось скопировать ключ"))}
            >
              <Copy size={16} />
              Скопировать
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => setCreatedKey(null)}
            >
              Я сохранил ключ
            </button>
          </section>
        </div>
      )}
      {copyMessage && <TransientAlert message={copyMessage} tone="success" />}
      <CustomScrollbar targetRef={pageScrollRef} alignToViewport />
    </section>
  );
}

function ConnectionManager({
  application,
  busy,
  departments,
  setBusy,
  setMessage,
  onApplicationChanged,
}: {
  application: DeveloperApplication;
  busy: boolean;
  departments: DepartmentResponse[];
  setBusy: (value: boolean) => void;
  setMessage: (value: string) => void;
  onApplicationChanged: (application: DeveloperApplication) => void;
}) {
  const initialViewStateRef = useRef(
    readSessionState<IntegrationConnectionViewState>(
      connectionViewStateKey(application.application_uuid),
    ),
  );
  const [items, setItems] = useState<IntegrationConnection[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("Основной API");
	const [provider, setProvider] = useState<"generic_api" | "bitrix24">("generic_api");
	const [portalDomain, setPortalDomain] = useState("");
	const [bitrixHealth, setBitrixHealth] = useState<BitrixConnectionHealth | null>(null);
	const [oauthFeedback, setOAuthFeedback] = useState<"idle" | "waiting" | "success" | "failed">("idle");
	const [accessCheck, setAccessCheck] = useState<"idle" | "running" | "success" | "partial" | "failed">("idle");
	const oauthAttemptRef = useRef(0);
	const oauthCompletionRef = useRef("");
	const [externalUsers, setExternalUsers] = useState<BitrixExternalUser[]>([]);
	const [mappingDrafts, setMappingDrafts] = useState<Record<string, BitrixMappingDraft>>({});
	const [mappingPreview, setMappingPreview] = useState<BitrixMappingPreview | null>(null);
	const [mappingRequestKey, setMappingRequestKey] = useState("");
	const [companyMembers, setCompanyMembers] = useState<CompanyMemberListItemResponse[]>([]);
	const [companyMembersLoading, setCompanyMembersLoading] = useState(false);
	const [companyMembersError, setCompanyMembersError] = useState("");
	const [backfillFrom, setBackfillFrom] = useState("");
	const [backfillTo, setBackfillTo] = useState("");
	const [backfillPreview, setBackfillPreview] = useState<BitrixBackfillPreview | null>(null);
	const [backfill, setBackfill] = useState<BitrixBackfill | null>(null);
	const [backfillError, setBackfillError] = useState("");
	const [allowFolderOverride, setAllowFolderOverride] = useState(false);
  const [hooks, setHooks] = useState<IntegrationWebhook[]>([]);
  const [deliveries, setDeliveries] = useState<IntegrationWebhookDelivery[]>(
    [],
  );
  const [imports, setImports] = useState<IntegrationIngestItem[]>([]);
  const [importsTotal, setImportsTotal] = useState(0);
  const [audit, setAudit] = useState<IntegrationAuditEvent[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [accounts, setAccounts] = useState<IntegrationServiceAccount[]>([]);
  const [keysByAccount, setKeysByAccount] = useState<
    Record<string, IntegrationAPIKey[]>
  >({});
  const [accountName, setAccountName] = useState("Основной сервис");
  const [accountKey, setAccountKey] = useState<CreatedIntegrationKey | null>(
    null,
  );
  const [hookName, setHookName] = useState("События звонков");
  const [hookURL, setHookURL] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [detailView, setDetailView] = useState<"overview" | "imports" | "audit">(
    initialViewStateRef.current?.detailView ?? "overview",
  );
  const [importsPage, setImportsPage] = useState(initialViewStateRef.current?.importsPage ?? 0);
  const [auditPage, setAuditPage] = useState(initialViewStateRef.current?.auditPage ?? 0);
	const connection = items.find((item) => item.connection_uuid === selected);
	const validatedOAuth = Boolean(bitrixHealth?.oauth_configured && portalDomainForInput(bitrixHealth.portal_domain));
	useEffect(() => {
		if (!connection || !isBitrixConnection(connection)) {
			setBackfillFrom("");
			setBackfillTo("");
			return;
		}
		setBackfillFrom("");
		setBackfillTo("");
		setBackfillPreview(null);
		setBackfillError("");
	}, [connection?.connection_uuid, connection?.provider]);
	function changeBackfillRange(range: BitrixBackfillRange) {
		setBackfillFrom(range.from);
		setBackfillTo(range.to);
		setBackfillPreview(null);
		setBackfillError("");
	}
	useEffect(() => {
		if (!connection || !isBitrixConnection(connection)) { setBitrixHealth(null); setOAuthFeedback("idle"); setAccessCheck("idle"); setExternalUsers([]); setMappingDrafts({}); setMappingPreview(null); setMappingRequestKey(""); setBackfillPreview(null); setBackfill(null); return; }
		let alive = true;
		Promise.allSettled([api.getBitrixHealth(connection.connection_uuid), api.listBitrixBackfills(connection.connection_uuid)]).then(([healthResult, backfillsResult]) => {
			if (!alive) return;
			if (healthResult.status === "fulfilled") {
				setBitrixHealth(healthResult.value);
				const validPortalDomain = portalDomainForInput(healthResult.value.portal_domain, connection.settings.portal_domain_display);
				setOAuthFeedback((current) => healthResult.value.oauth_configured && validPortalDomain ? "success" : healthResult.value.oauth_configured || healthResult.value.reconnect_required ? "failed" : current === "waiting" ? current : "idle");
				setPortalDomain(validPortalDomain);
			} else setBitrixHealth(null);
			setBackfill(backfillsResult.status === "fulfilled" ? backfillsResult.value.backfills[0] ?? null : null);
		});
		return () => { alive = false; };
	}, [connection?.connection_uuid, connection?.lock_version]);
	useEffect(() => {
		if (!connection || !backfill || !["pending", "running"].includes(backfill.status)) return;
		let alive = true;
		const refresh = () => api.getBitrixBackfill(connection.connection_uuid, backfill.backfill_uuid).then((item) => { if (alive) setBackfill(item); }).catch(() => undefined);
		const timer = window.setInterval(refresh, 5000);
		return () => { alive = false; window.clearInterval(timer); };
	}, [backfill?.backfill_uuid, backfill?.status, connection?.connection_uuid]);
	useEffect(()=>{function receiveOAuth(event:MessageEvent){if(event.origin!==window.location.origin||event.data?.type!=="verbatrace:bitrix-oauth-complete"||event.data?.connection_uuid!==connection?.connection_uuid)return;void completeBitrixOAuth(event.data.connection_uuid)}window.addEventListener("message",receiveOAuth);return()=>window.removeEventListener("message",receiveOAuth)},[application.application_uuid,connection?.connection_uuid,setMessage]);
	useEffect(() => () => { oauthAttemptRef.current += 1; }, []);
  useEffect(() => {
    let alive = true;
    api
      .listIntegrationConnections(application.application_uuid)
      .then((value) => {
        if (alive) {
          setItems(value.connections);
          const savedConnectionUUID = initialViewStateRef.current?.connectionUUID;
          setSelected(
            value.connections.some((item) => item.connection_uuid === savedConnectionUUID)
              ? savedConnectionUUID ?? ""
              : value.connections[0]?.connection_uuid ?? "",
          );
        }
      })
      .catch(
        (error) =>
          alive &&
          setMessage(
            error instanceof ApiError
              ? error.message
              : "Не удалось загрузить подключения.",
          ),
      );
    return () => {
      alive = false;
    };
  }, [application.application_uuid, setMessage]);
	useEffect(() => {
		if (!selected) return;
		writeSessionState(connectionViewStateKey(application.application_uuid), {
			connectionUUID: selected,
			detailView,
			importsPage,
			auditPage,
		} satisfies IntegrationConnectionViewState);
	}, [application.application_uuid, auditPage, detailView, importsPage, selected]);
	useEffect(() => {
		let alive = true;
		if (application.owner_type !== "company") {
			setCompanyMembers([]);
			setCompanyMembersLoading(false);
			setCompanyMembersError("");
			return () => { alive = false; };
		}
		setCompanyMembersLoading(true);
		setCompanyMembersError("");
		async function loadCompanyMembers() {
			const loaded: CompanyMemberListItemResponse[] = [];
			let offset = 0;
			for (;;) {
				const page = await api.listCompanyMembers(application.owner_uuid, { status: "active", limit: 100, offset });
				loaded.push(...page.members);
				if (loaded.length >= page.total || page.members.length === 0) break;
				offset += page.members.length;
			}
			if (!alive) return;
			setCompanyMembers(loaded);
			setCompanyMembersLoading(false);
			setCompanyMembersError("");
		}
		void loadCompanyMembers().catch(() => {
			if (!alive) return;
			setCompanyMembers([]);
			setCompanyMembersLoading(false);
			setCompanyMembersError("Не удалось загрузить участников компании. Обновите страницу и повторите попытку.");
		});
		return () => { alive = false; };
	}, [application.owner_type, application.owner_uuid]);
  useEffect(() => {
    let alive = true;
    if (!selected) {
      setHooks([]);
      setDeliveries([]);
      setImports([]);
      setAudit([]);
      setAccounts([]);
      return;
    }
	if(isBitrixConnection(connection)){
		setHooks([]);setDeliveries([]);setAccounts([]);
		Promise.allSettled([api.listIntegrationIngestItems(selected,{limit:10,offset:0}),api.listIntegrationAuditEvents(selected,{limit:10,offset:0})]).then(([ingest,events])=>{if(!alive)return;setImports(ingest.status==="fulfilled"?(ingest.value.ingest_items??[]):[]);setImportsTotal(ingest.status==="fulfilled"?ingest.value.total:0);setAudit(events.status==="fulfilled"?(events.value.audit_events??[]):[]);setAuditTotal(events.status==="fulfilled"?events.value.total:0);if(ingest.status==="rejected"||events.status==="rejected")setMessage("История подключения временно недоступна.")});return()=>{alive=false};
	}
    Promise.allSettled([
      api.listIntegrationWebhooks(selected),
      api.listIntegrationWebhookDeliveries(selected),
      api.listIntegrationIngestItems(selected, { limit: 10, offset: 0 }),
      api.listIntegrationAuditEvents(selected, { limit: 10, offset: 0 }),
      api.listIntegrationServiceAccounts(selected),
    ])
      .then(([webhooks, history, ingest, events, serviceAccounts]) => {
        if (alive) {
          setHooks(webhooks.status === "fulfilled" ? (webhooks.value.webhooks ?? []) : []);
          setDeliveries(history.status === "fulfilled" ? (history.value.deliveries ?? []) : []);
          setImports(ingest.status === "fulfilled" ? (ingest.value.ingest_items ?? []) : []);
          setImportsTotal(ingest.status === "fulfilled" ? ingest.value.total : 0);
          setAudit(events.status === "fulfilled" ? (events.value.audit_events ?? []) : []);
          setAuditTotal(events.status === "fulfilled" ? events.value.total : 0);
          setAccounts(serviceAccounts.status === "fulfilled" ? (serviceAccounts.value.service_accounts ?? []) : []);
          if ([webhooks, history, ingest, events, serviceAccounts].some((result) => result.status === "rejected")) {
            setMessage("Часть данных подключения временно недоступна. Доступные разделы показаны ниже.");
          }
        }
      });
    return () => {
      alive = false;
    };
  }, [connection?.provider, selected, setMessage]);
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    api.listIntegrationIngestItems(selected, { limit: 10, offset: detailView === "imports" ? importsPage * 10 : 0 })
      .then((value) => { if (alive) { setImports(value.ingest_items ?? []); setImportsTotal(value.total); } })
      .catch(() => { if (alive) setMessage("Не удалось загрузить страницу импортов."); });
    return () => { alive = false; };
  }, [detailView, importsPage, selected, setMessage]);
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    api.listIntegrationAuditEvents(selected, { limit: 10, offset: detailView === "audit" ? auditPage * 10 : 0 })
      .then((value) => { if (alive) { setAudit(value.audit_events ?? []); setAuditTotal(value.total); } })
      .catch(() => { if (alive) setMessage("Не удалось загрузить страницу аудита."); });
    return () => { alive = false; };
  }, [auditPage, detailView, selected, setMessage]);
  useEffect(() => {
    let alive = true;
    if (accounts.length === 0) {
      setKeysByAccount({});
      return;
    }
    Promise.all(
      accounts.map(async (account) => [
        account.service_account_uuid,
        (await api.listServiceAccountKeys(account.service_account_uuid)).keys ?? [],
      ] as const),
    )
      .then((entries) => alive && setKeysByAccount(Object.fromEntries(entries)))
      .catch(
        (error) =>
          alive &&
          setMessage(
            error instanceof ApiError
              ? error.message
              : "Не удалось загрузить метаданные ключей.",
          ),
      );
    return () => {
      alive = false;
    };
  }, [accounts, setMessage]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "Операция не выполнена.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!name.trim()) return;
    await run(async () => {
      const item = await api.createIntegrationConnection(
        application.application_uuid,
        {
          name: name.trim(),
          provider,
          company_uuid:
            application.owner_type === "company"
              ? application.owner_uuid
              : undefined,
          disable_policy: "pause",
					allow_folder_override: allowFolderOverride,
          settings: { schema_version: 1, provider_contract_version: provider === "bitrix24" ? 1 : undefined },
        },
      );
      setItems((current) => [item, ...current]);
      setSelected(item.connection_uuid);
      setMessage(provider === "bitrix24" ? "Черновик Bitrix24 создан. Теперь авторизуйте портал." : "Подключение создано.");
    });
  }
	async function startBitrixOAuth() {
		if (!connection || !isBitrixConnection(connection) || !portalDomain.trim()) return;
		await run(async () => {
			const result = await api.startBitrixOAuth(connection.connection_uuid, portalDomain.trim(), connection.lock_version);
			oauthCompletionRef.current = "";
			setOAuthFeedback("waiting");
			const popup = window.open(result.authorization_url, "verbatrace-bitrix-oauth", "popup,width=720,height=760");
			if (!popup) window.location.assign(result.authorization_url);
			setItems((current) => current.map((item) => item.connection_uuid === connection.connection_uuid ? { ...item, status: "authorizing", lock_version: item.lock_version + 1 } : item));
			setMessage("Завершите авторизацию в окне Bitrix24. Статус обновится автоматически.");
			const attempt = ++oauthAttemptRef.current;
			void watchBitrixOAuth(connection.connection_uuid, portalDomain.trim(), attempt);
		});
	}
	async function watchBitrixOAuth(connectionId: string, expectedPortalDomain: string, attempt: number) {
		for (let index = 0; index < 90 && oauthAttemptRef.current === attempt; index += 1) {
			try {
				const health = await api.getBitrixHealth(connectionId);
				if (health.oauth_configured && health.status !== "authorizing" && portalDomainForInput(health.portal_domain).toLowerCase() === expectedPortalDomain.toLowerCase()) {
					setBitrixHealth(health);
					setOAuthFeedback("success");
					await completeBitrixOAuth(connectionId);
					return;
				}
			} catch {
				// The next poll may succeed while the popup completes the OAuth callback.
			}
			await new Promise((resolve) => window.setTimeout(resolve, 1000));
		}
		if (oauthAttemptRef.current === attempt) {
			setOAuthFeedback("failed");
			setMessage("Авторизация не завершена. Попробуйте ещё раз и проверьте, что окно туннеля остаётся открытым.");
		}
	}
	async function completeBitrixOAuth(connectionId: string) {
		if (oauthCompletionRef.current === connectionId) return;
		oauthCompletionRef.current = connectionId;
		setItems((current) => current.map((item) => item.connection_uuid === connectionId ? { ...item, status: "testing" } : item));
		setOAuthFeedback("success");
		setAccessCheck("running");
		setMessage("Авторизация завершена. Проверяю доступ к звонкам, пользователям и задачам…");
		try {
			const health = await api.testBitrixConnection(connectionId);
			setBitrixHealth(health);
			setAccessCheck(health.calls_readable && health.users_readable && health.tasks_writable ? health.connector_verified ? "success" : "partial" : "partial");
			if (health.users_readable) {
				const value = await api.listBitrixExternalUsers(connectionId);
				replaceExternalUsers(value.users);
			}
			const refreshed = await api.listIntegrationConnections(application.application_uuid);
			setItems(refreshed.connections);
			setSelected(connectionId);
			setMessage("Проверка Bitrix24 завершена. Доступные возможности отмечены ниже.");
		} catch (cause) {
			oauthCompletionRef.current = "";
			setAccessCheck("failed");
			setMessage(cause instanceof Error ? cause.message : "Авторизация завершена, но проверить доступы Bitrix24 не удалось.");
		}
	}
	async function testBitrix() {
		if (!connection) return;
		setAccessCheck("running");
		await run(async () => {
			try {
				const health = await api.testBitrixConnection(connection.connection_uuid); setBitrixHealth(health);
				setAccessCheck(health.calls_readable && health.users_readable && health.tasks_writable ? health.connector_verified ? "success" : "partial" : "partial");
				if (health.users_readable) { const users = await api.listBitrixExternalUsers(connection.connection_uuid); replaceExternalUsers(users.users); }
				const refreshed=await api.listIntegrationConnections(application.application_uuid);setItems(refreshed.connections);setSelected(connection.connection_uuid);
				setMessage(health.connector_verified ? "Bitrix24 подключён: звонки, пользователи и задачи доступны." : "Подключение проверено частично. Недоступные возможности отмечены ниже.");
			} catch (cause) {
				setAccessCheck("failed");
				throw cause;
			}
		});
	}
	async function changeBitrixLifecycle(mode:"pause"|"resume"){
		if(!connection||!isBitrixConnection(connection))return;
		await run(async()=>{const health=mode==="pause"?await api.pauseBitrixConnection(connection.connection_uuid,connection.lock_version):await api.resumeBitrixConnection(connection.connection_uuid,connection.lock_version);setBitrixHealth(health);const refreshed=await api.listIntegrationConnections(application.application_uuid);setItems(refreshed.connections);setSelected(connection.connection_uuid);setMessage(mode==="pause"?"Импорт и отправка задач приостановлены.":health.status==="active"?"Подключение возобновлено и проверено.":"Подключение возобновлено, но требует внимания.")});
	}
	function replaceExternalUsers(users: BitrixExternalUser[]) {
		setExternalUsers(users);
		setMappingDrafts(Object.fromEntries(users.map((user) => [user.external_user_id, mappingDraftForUser(user)])));
		setMappingPreview(null);
		setMappingRequestKey("");
	}
	async function loadExternalUsers() { if (!connection) return; await run(async () => { const result = await api.listBitrixExternalUsers(connection.connection_uuid); replaceExternalUsers(result.users); }); }
	async function previewBackfill() {
		if (!connection || !backfillFrom || !backfillTo) return;
		const from = new Date(backfillFrom);
		const to = new Date(backfillTo);
		if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) { setBackfillError("Начало периода должно быть раньше окончания."); return; }
		setBackfillError("");
		await run(async () => {
			try {
				setBackfillPreview(await api.previewBitrixBackfill(connection.connection_uuid, from.toISOString(), to.toISOString()));
				setBackfill(null);
			} catch (cause) {
				setBackfillError(cause instanceof Error ? cause.message : "Не удалось проверить период импорта.");
				throw cause;
			}
		});
	}
	async function createBackfill() {
		if (!connection || !backfillPreview) return;
		setBackfillError("");
		await run(async () => {
			try {
				const item = await api.createBitrixBackfill(connection.connection_uuid, backfillPreview.range_from, backfillPreview.range_to);
				setBackfill(item);
				setMessage("Импорт истории поставлен в очередь. Эту страницу можно закрыть.");
			} catch (cause) {
				setBackfillError(cause instanceof Error ? cause.message : "Не удалось запустить импорт истории.");
				throw cause;
			}
		});
	}
	function mappingChanges(): BitrixMappingChange[] {
		return externalUsers.flatMap((user) => {
			const draft = mappingDrafts[user.external_user_id] ?? mappingDraftForUser(user);
			const changed = draft.internalUserId !== (user.internal_user_uuid ?? "") || draft.departmentId !== (user.department_uuid ?? "") || draft.status !== normalizedMappingStatus(user.mapping_status);
			if (!changed) return [];
			return [{ external_user_id: user.external_user_id, internal_user_uuid: draft.internalUserId || null, department_uuid: draft.departmentId || null, status: draft.status, expected_lock_version: user.lock_version }];
		});
	}
	async function previewMappings() {
		if (!connection) return;
		const changes = mappingChanges();
		if (!changes.length) { setMessage("Нет изменений для проверки."); return; }
		await run(async () => {
			const preview = await api.previewBitrixExternalUserMappings(connection.connection_uuid, changes);
			setMappingPreview(preview);
			setMappingRequestKey(crypto.randomUUID());
			setMessage(`Проверено изменений: ${preview.changes_count}. Просмотрите итог и подтвердите применение.`);
		});
	}
	async function applyMappings() {
		if (!connection || !mappingPreview || !mappingRequestKey) return;
		const changes = mappingChanges();
		await run(async () => {
			const result = await api.bulkUpdateBitrixExternalUserMappings(connection.connection_uuid, mappingPreview.preview_hash, changes, mappingRequestKey);
			const byExternalID = new Map(result.mappings.map((item) => [item.external_user_id, item]));
			const updatedUsers = externalUsers.map((user) => byExternalID.has(user.external_user_id) ? { ...user, ...byExternalID.get(user.external_user_id)! } : user);
			replaceExternalUsers(updatedUsers);
			setMessage(`Сопоставления применены одной операцией: ${result.changes_count}.`);
		});
	}
  async function status(next: "active" | "disabled" | "revoked") {
    if (!connection) return;
    await run(async () => {
      const item = await api.changeIntegrationConnectionStatus(
        connection.connection_uuid,
        next,
        connection.lock_version,
      );
      if (next === "revoked") {
        setItems((current) =>
          current.filter(
            (value) => value.connection_uuid !== connection.connection_uuid,
          ),
        );
        setSelected("");
      } else
        setItems((current) =>
          current.map((value) =>
            value.connection_uuid === item.connection_uuid ? item : value,
          ),
        );
    });
  }
  async function createHook() {
    if (!connection || !hookURL.trim()) return;
    await run(async () => {
      const value = await api.createIntegrationWebhook(
        connection.connection_uuid,
        {
          application_uuid: application.application_uuid,
          name: hookName.trim(),
          url: hookURL.trim(),
          event_types: ["ingest.completed", "ingest.failed"],
        },
      );
      setHooks((current) => [value.webhook, ...current]);
      setHookURL("");
      setSecret(value.signing_secret);
    });
  }
  async function testHook() {
    if (!connection) return;
    await run(async () => {
      await api.testIntegrationWebhook(connection.connection_uuid);
      setMessage("Тестовый webhook поставлен в очередь.");
    });
  }
  async function ingestCommand(
    item: IntegrationIngestItem,
    command: "retry" | "cancel",
  ) {
    await run(async () => {
      const updated =
        command === "retry"
          ? await api.retryIntegrationIngestItem(item.ingest_item_uuid)
          : await api.cancelIntegrationIngestItem(item.ingest_item_uuid);
      setImports((current) =>
        current.map((value) =>
          value.ingest_item_uuid === updated.ingest_item_uuid ? updated : value,
        ),
      );
      setMessage(
        command === "retry" ? "Импорт поставлен на повтор." : "Импорт отменён.",
      );
    });
  }
  async function createAccount() {
    if (!connection || !accountName.trim()) return;
    await run(async () => {
      const account = await api.createIntegrationServiceAccount(
        connection.connection_uuid,
        {
          name: accountName.trim(),
			scopes: application.capabilities,
        },
      );
      setAccounts((current) => [account, ...current]);
      setMessage("Сервисный аккаунт создан.");
    });
  }
  async function createAccountKey(account: IntegrationServiceAccount) {
    await run(async () => {
      const created = await api.createServiceAccountKey(
        account.service_account_uuid,
        {
          name: `${account.name}: основной ключ`,
          scopes: account.scopes,
        },
      );
      setAccountKey(created);
      const metadata = await api.listServiceAccountKeys(
        account.service_account_uuid,
      );
      setKeysByAccount((current) => ({
        ...current,
        [account.service_account_uuid]: metadata.keys,
      }));
    });
  }
  async function revokeAccount(account: IntegrationServiceAccount) {
    if (window.prompt(`Для отзыва введите название: ${account.name}`) !== account.name)
      return;
    await run(async () => {
      await api.revokeIntegrationServiceAccount(account.service_account_uuid);
      setAccounts((current) =>
        current.map((item) =>
          item.service_account_uuid === account.service_account_uuid
            ? { ...item, status: "revoked" }
            : item,
        ),
      );
      setKeysByAccount((current) => ({
        ...current,
        [account.service_account_uuid]: (
          current[account.service_account_uuid] ?? []
        ).map((key) => ({ ...key, revoked_at: new Date().toISOString() })),
      }));
      setMessage("Сервисный аккаунт и его ключи отозваны.");
    });
  }
  async function revokeKey(key: IntegrationAPIKey) {
    if (window.prompt(`Для отзыва введите начало ключа: ${key.prefix}`) !== key.prefix)
      return;
    await run(async () => {
      await api.revokeIntegrationKey(key.key_uuid);
      setKeysByAccount((current) => ({
        ...current,
        [key.service_account_uuid]: (current[key.service_account_uuid] ?? []).map(
          (item) =>
            item.key_uuid === key.key_uuid
              ? { ...item, revoked_at: new Date().toISOString() }
              : item,
        ),
      }));
      setMessage("API-ключ отозван.");
    });
  }
  async function rotateKey(key: IntegrationAPIKey) {
    await run(async () => {
      const created = await api.rotateIntegrationKey(key.key_uuid);
      setAccountKey(created);
      const metadata = await api.listServiceAccountKeys(
        key.service_account_uuid,
      );
      setKeysByAccount((current) => ({
        ...current,
        [key.service_account_uuid]: metadata.keys,
      }));
    });
  }
  async function revokeHook(hook: IntegrationWebhook) {
    if (window.prompt(`Для отзыва введите название: ${hook.name}`) !== hook.name)
      return;
    await run(async () => {
      await api.revokeIntegrationWebhook(hook.webhook_endpoint_uuid);
      setHooks((current) =>
        current.map((item) =>
          item.webhook_endpoint_uuid === hook.webhook_endpoint_uuid
            ? { ...item, status: "revoked" }
            : item,
        ),
      );
      setMessage("Webhook отозван.");
    });
  }
  async function sandboxWallet(mode: "add" | "reset") {
    await run(async () => {
      const result = await api.adjustSandboxWallet(
        application.application_uuid,
        mode,
        mode === "add" ? 25000 : 0,
      );
      setMessage(
        `Тестовый кошелёк: ${result.balance_credits.toLocaleString("ru-RU")} кредитов.`,
      );
    });
  }
  async function applicationStatus(status: "active" | "disabled" | "revoked") {
    await run(async () =>
      onApplicationChanged(
        await api.changeDeveloperApplicationStatus(
          application.application_uuid,
          status,
        ),
      ),
    );
  }
  const importPageCount = Math.max(1, Math.ceil(importsTotal / 10));
  const auditPageCount = Math.max(1, Math.ceil(auditTotal / 10));
  const visibleImports = imports.slice(0, 10);
  if (connection && detailView === "imports") {
    return <section className="glass integration-list integration-detail-page">
      <div className="integration-section-heading"><div><button className="ghost-button small" type="button" onClick={() => { setDetailView("overview"); setImportsPage(0); }}><ArrowLeft size={16}/>К подключению</button><h2 className="integration-title"><span className="integration-icon is-import"><UploadCloud size={20}/></span>Все импорты</h2><p>{connection.name} · всего {importsTotal}</p></div></div>
      {imports.map((item) => <article className={`integration-event-card is-${item.status}`} key={item.ingest_item_uuid}>
        <div className="integration-event-title"><span className="integration-icon is-import"><UploadCloud size={18}/></span><span><strong>{item.title}</strong><small>Создан: {new Date(item.created_at).toLocaleString("ru-RU")} · обновлён: {new Date(item.updated_at).toLocaleString("ru-RU")}</small></span></div>
        <span className={`integration-state is-${item.status}`}>{statusLabels[item.status] ?? item.status}</span>
        <dl className="integration-metadata">
          <div><dt>ID во внешней системе</dt><dd><code>{item.external_call_id}</code></dd></div>
          <div><dt>Источник записи</dt><dd>{item.source_kind === "upload" ? "Загрузка файла" : "Ссылка на файл"}</dd></div>
          <div><dt>Размещение</dt><dd>{placementLabels[item.placement_source ?? ""] ?? "По настройкам подключения"}</dd></div>
          <div><dt>Этап обработки</dt><dd>{statusLabels[item.stage] ?? item.stage}</dd></div>
          <div><dt>Попытки</dt><dd>{item.attempts} из {item.max_attempts}</dd></div>
          {item.error_code && <div><dt>Ошибка</dt><dd>{item.error_message ?? "Описание отсутствует"} <code>{item.error_code}</code></dd></div>}
        </dl>
        <div className="integration-actions">{item.status === "failed" && <button className="ghost-button small" disabled={busy} onClick={() => void ingestCommand(item, "retry")}>Повторить</button>}{["received", "retry_wait", "failed"].includes(item.status) && <button className="ghost-button small danger" disabled={busy} onClick={() => void ingestCommand(item, "cancel")}>Отменить</button>}</div>
      </article>)}
      {imports.length === 0 && <p>Импортов пока нет.</p>}
      {importPageCount > 1 && <nav className="integration-pagination" aria-label="Страницы импортов"><button className="ghost-button small" disabled={importsPage === 0} onClick={() => setImportsPage((page) => page - 1)}>Назад</button><span>Страница {importsPage + 1} из {importPageCount}</span><button className="ghost-button small" disabled={importsPage + 1 >= importPageCount} onClick={() => setImportsPage((page) => page + 1)}>Далее</button></nav>}
    </section>;
  }
  if (connection && detailView === "audit") {
    return <section className="glass integration-list integration-detail-page">
      <div className="integration-section-heading"><div><button className="ghost-button small" type="button" onClick={() => { setDetailView("overview"); setAuditPage(0); }}><ArrowLeft size={16}/>К подключению</button><h2 className="integration-title"><span className="integration-icon is-audit"><ScrollText size={20}/></span>Полный журнал аудита</h2><p>{connection.name} · всего {auditTotal}</p></div></div>
      {audit.map((event) => <article className="integration-event-card" key={event.audit_event_uuid}>
        <div className="integration-event-title"><AuditEventEmblem type={event.event_type}/><span><strong>{auditLabels[event.event_type] ?? "Техническое событие интеграции"}</strong><small>{new Date(event.created_at).toLocaleString("ru-RU")}</small></span></div>
        <dl className="integration-metadata">
          <div><dt>Инициатор</dt><dd>{actorLabels[event.actor_type] ?? event.actor_type}</dd></div>
          <div><dt>Объект</dt><dd>{entityLabels[event.entity_type] ?? event.entity_type}</dd></div>
          <div><dt>Тип события</dt><dd><code>{event.event_type}</code></dd></div>
          {event.request_id && <div><dt>ID запроса</dt><dd><code>{event.request_id}</code></dd></div>}
        </dl>
        {event.metadata && Object.keys(event.metadata).length > 0 && <details className="integration-raw"><summary>Технические данные</summary><pre>{JSON.stringify(event.metadata, null, 2)}</pre></details>}
      </article>)}
      {audit.length === 0 && <p>Событий пока нет.</p>}
      {auditPageCount > 1 && <nav className="integration-pagination" aria-label="Страницы аудита"><button className="ghost-button small" disabled={auditPage === 0} onClick={() => setAuditPage((page) => page - 1)}>Назад</button><span>Страница {auditPage + 1} из {auditPageCount}</span><button className="ghost-button small" disabled={auditPage + 1 >= auditPageCount} onClick={() => setAuditPage((page) => page + 1)}>Далее</button></nav>}
    </section>;
  }
  return (
    <>
      <div className="integration-stack">
        <section className="glass integration-card integration-connections-card">
          <h2>
            <span className="integration-icon is-connection"><Link2 size={19} /></span>
            Подключения
          </h2>
          <div className="integration-connection-form-grid">
            <label className="integration-connection-name">
              Название
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
              />
            </label>
            <label>
					Тип подключения
					<SelectControl value={provider} onChange={(event) => { setProvider(event.target.value as typeof provider); setName(event.target.value === "bitrix24" ? "Bitrix24" : "Основной API"); }}>
						<option value="generic_api">Универсальный API</option>
					<option value="bitrix24" disabled={application.owner_type!=="company"}>Bitrix24: звонки и задачи{application.owner_type!=="company"?" · только для компании":""}</option>
					</SelectControl>
				</label>
				{provider === "generic_api" && <label className="integration-checkbox">
              <input
                type="checkbox"
                checked={allowFolderOverride}
                onChange={(event) => setAllowFolderOverride(event.target.checked)}
              />
              <span>
                Разрешить запросам выбирать папку
                <small>Только внутри области этого подключения. Без параметра звонок попадёт в «Внешнюю».</small>
              </span>
				</label>}
				<p className="integration-help">{provider === "bitrix24" ? "После создания черновика авторизуйте портал. Пароль и данные доступа в интерфейсе не показываются." : <>Инструкции выбираются для каждого запроса. По умолчанию применяются инструкции папки назначения; передайте <code>instruction_mode: "scope_and_folder"</code>, чтобы добавить инструкции профиля, компании или отдела.</>}</p>
            <button
              className="ghost-button integration-create-connection"
              disabled={busy || !name.trim()}
              onClick={() => void create()}
            >
              <Link2 size={17} />
					{provider === "bitrix24" ? "Создать черновик Bitrix24" : "Создать API"}
            </button>
          </div>
          <div className="integration-connection-list">
          {items.map((item) => (
            <button
              className={`integration-connection-row${selected === item.connection_uuid ? " active" : ""}`}
              type="button"
              onClick={() => setSelected(item.connection_uuid)}
              key={item.connection_uuid}
            >
              <span className="integration-row-summary">
                <span className="integration-icon is-connection"><Link2 size={17}/></span>
                <span><strong>{item.name}</strong></span>
              </span>
              <span className={`integration-state is-${item.status}`}>
                {statusLabels[item.status] ?? item.status}
              </span>
            </button>
          ))}
          </div>
        </section>
        {connection && (
          <section className="glass integration-card integration-management-card">
            <div className="integration-management-header">
              <h2 className="integration-title"><span className="integration-icon is-management"><Settings2 size={20}/></span>Управление: {connection.name}</h2>
              <div className="integration-actions">
				{!isBitrixConnection(connection) && (connection.status === "active" ? (
                <button
                  className="ghost-button"
                  disabled={busy}
                  onClick={() => void status("disabled")}
                >
                  Остановить
                </button>
				) : (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void status("active")}
                >
                  Включить
                </button>
				))}
				{isBitrixConnection(connection) && (connection.status === "paused" ? <button className="primary-button" disabled={busy} onClick={()=>void changeBitrixLifecycle("resume")}>Возобновить</button> : (connection.status === "active" || connection.status === "degraded" || connection.status === "reconnect_required") ? <button className="ghost-button" disabled={busy} onClick={()=>void changeBitrixLifecycle("pause")}>Приостановить</button> : null)}
              <button
                className="ghost-button danger"
                disabled={busy}
                onClick={() => void status("revoked")}
              >
                Отозвать
              </button>
              </div>
            </div>
			{isBitrixConnection(connection) ? <div className="bitrix-connection-panel">
				<div className="integration-webhook-heading"><span className="integration-icon is-management"><PlugZap size={19}/></span><span><h2>Подключение портала</h2><small>Данные авторизации хранятся зашифрованно и никогда не показываются в браузере.</small></span></div>
				<div className="bitrix-connect-row"><label>Домен портала<input value={portalDomain} onChange={(event) => setPortalDomain(event.target.value)} placeholder="Например, company.bitrix24.ru" /></label><button className="primary-button" disabled={busy || !portalDomain.trim() || connection.status === "revoked"} onClick={() => void startBitrixOAuth()}>{bitrixHealth?.reconnect_required ? "Переподключить" : "Авторизовать Bitrix24"}</button><button className="ghost-button" disabled={busy || accessCheck === "running" || !validatedOAuth} onClick={() => void testBitrix()}>{accessCheck === "running" ? "Проверяю…" : "Проверить доступ"}</button></div>
				{(validatedOAuth || oauthFeedback !== "idle") && <div className={`bitrix-oauth-state is-${validatedOAuth ? "success" : oauthFeedback}`} role="status" aria-live="polite"><span aria-hidden="true">{validatedOAuth ? "✓" : oauthFeedback === "waiting" ? "…" : "!"}</span><span><strong>{validatedOAuth ? "Портал успешно авторизован" : oauthFeedback === "waiting" ? "Ожидается завершение авторизации" : "Нужно авторизоваться заново"}</strong><small>{validatedOAuth ? "Данные доступа получены и привязаны к корректному домену портала." : oauthFeedback === "waiting" ? "Завершите авторизацию в окне Bitrix24 — состояние обновится автоматически." : "Сохранённые данные авторизации не удалось подтвердить для корректного портала. Введите домен и авторизуйтесь заново."}</small></span></div>}
				<div className={`bitrix-access-check is-${accessCheck}`} role="status" aria-live="polite"><span><strong>{accessCheck === "running" ? "Проверяю доступы Bitrix24…" : accessCheck === "success" ? "Все проверки пройдены" : accessCheck === "partial" ? "Проверка завершена частично" : accessCheck === "failed" ? "Проверка не выполнена" : "Что делает проверка доступа"}</strong><small>{accessCheck === "running" ? "Читаю список методов, статистику звонков и пользователей, затем проверяю право создания задач." : accessCheck === "success" ? "История звонков, пользователи, задачи и реальный звонок доступны." : accessCheck === "partial" ? "Посмотрите карточки ниже: они показывают, какие возможности доступны, а какие требуют настройки или реального звонка." : accessCheck === "failed" ? "Bitrix24 не ответил или вернул ошибку. Повторите проверку после устранения причины." : "Она ничего не создаёт и не изменяет: только читает методы, статистику звонков и пользователей и проверяет наличие права на создание задач."}</small></span></div>
				{bitrixHealth && <div className="bitrix-capability-grid" aria-label="Доступные возможности Bitrix24"><CapabilityState label="Статистика звонков" ok={bitrixHealth.calls_readable}/><CapabilityState label="Пользователи" ok={bitrixHealth.users_readable}/><CapabilityState label="Создание задач" ok={bitrixHealth.tasks_writable}/><CapabilityState label="Проверено на портале" ok={bitrixHealth.connector_verified}/></div>}
				<section className="bitrix-backfill-panel" aria-labelledby="bitrix-backfill-title">
					<div><strong id="bitrix-backfill-title">Импорт истории звонков</strong><small>Сначала проверьте период и ожидаемое количество, затем подтвердите запуск. Повторный запуск не создаёт дубликаты звонков.</small></div>
					<div className="bitrix-backfill-fields"><label>С даты и времени<DateTimePicker placement="below" ariaLabel="Начало периода импорта" value={backfillFrom} onChange={(value) => changeBackfillRange({ from: value, to: backfillTo })} /></label><label>До даты и времени<DateTimePicker placement="below" ariaLabel="Окончание периода импорта" value={backfillTo} onChange={(value) => changeBackfillRange({ from: backfillFrom, to: value })} /></label><button className="ghost-button" type="button" disabled={busy || !bitrixHealth?.calls_readable || !backfillFrom || !backfillTo} onClick={() => void previewBackfill()}>Проверить период</button></div>
					{backfillError && <p className="integration-help" role="alert">{backfillError}</p>}
					{backfillPreview && <div className="bitrix-backfill-preview"><span><strong>{backfillPreview.estimated_calls.toLocaleString("ru-RU")}</strong><small>звонков найдено в Bitrix24</small></span><span><small>{new Date(backfillPreview.range_from).toLocaleString("ru-RU")} — {new Date(backfillPreview.range_to).toLocaleString("ru-RU")}</small></span><button className="primary-button" type="button" disabled={busy} onClick={() => void createBackfill()}>Запустить импорт</button></div>}
					{backfill && <div className={`bitrix-backfill-progress is-${backfill.status}`} role="status"><span><strong>{statusLabels[backfill.status] ?? backfill.status}</strong><small>Операция продолжится в фоне</small></span><dl><div><dt>Найдено</dt><dd>{backfill.discovered_calls}</dd></div><div><dt>Импортировано</dt><dd>{backfill.imported_calls}</dd></div><div><dt>Ожидает записи</dt><dd>{backfill.pending_calls}</dd></div><div><dt>Пропущено</dt><dd>{backfill.skipped_calls}</dd></div><div><dt>Ошибки</dt><dd>{backfill.error_calls}</dd></div></dl></div>}
				</section>
				<div className="bitrix-mapping-heading"><div><strong>Сопоставление сотрудников</strong><small>Для руководителя компании оставьте уровень компании без отдела. Для остальных сотрудников сначала выберите их отдел.</small>{companyMembersError && <small role="alert">{companyMembersError}</small>}</div><div className="integration-actions"><button className="ghost-button small" disabled={busy || !bitrixHealth?.users_readable} onClick={() => void loadExternalUsers()}>Обновить список</button><button className="primary-button small" disabled={busy || mappingChanges().length === 0} onClick={() => void previewMappings()}>Проверить изменения · {mappingChanges().length}</button></div></div>
				<div className="bitrix-mapping-list">{externalUsers.map((user) => <BitrixMappingRow key={user.external_user_id} user={user} draft={mappingDrafts[user.external_user_id] ?? mappingDraftForUser(user)} departments={departments} members={companyMembers} membersLoading={companyMembersLoading} busy={busy} onChange={(draft) => { setMappingDrafts((current) => ({ ...current, [user.external_user_id]: draft })); setMappingPreview(null); setMappingRequestKey(""); }}/>)}</div>
				{mappingPreview && <section className="bitrix-mapping-preview" aria-labelledby="bitrix-mapping-preview-title"><div><strong id="bitrix-mapping-preview-title">Итог перед применением</strong><small>После проверки всех строк изменения сохранятся атомарно. Если кто-то изменил сопоставления параллельно, команда будет отклонена целиком.</small></div><div className="bitrix-mapping-preview-list">{mappingPreview.items.filter((item) => item.changed).map((item) => <article key={item.external_user_id}><span><strong>{item.display_name || `Bitrix24 user #${item.external_user_id}`}</strong><small>{item.before_status} → {item.after_status}</small></span><small>{mappingTargetLabel(item.after_internal_user_uuid, item.after_department_uuid, companyMembers, departments)}</small></article>)}</div><button className="primary-button" type="button" disabled={busy || mappingPreview.changes_count === 0} onClick={() => void applyMappings()}>Применить {mappingPreview.changes_count} изменений</button></section>}
				{externalUsers.length === 0 && <p className="integration-help">После успешной проверки загрузите пользователей и подтвердите сопоставления.</p>}
			</div> : <div className="integration-webhook-panel">
              <div className="integration-webhook-heading">
                <span className="integration-icon is-management"><Webhook size={19}/></span>
                <span><h2>Webhook</h2><small>Получайте уведомления о событиях звонков на своём сервере</small></span>
              </div>
              <div className="integration-webhook-columns">
                <div className="integration-webhook-column">
                  <label>
                    Название
                    <input
                      value={hookName}
                      onChange={(event) => setHookName(event.target.value)}
                    />
                  </label>
                  <button
                    className="primary-button"
                    disabled={busy || !hookURL.trim()}
                    onClick={() => void createHook()}
                  >
                    <Webhook size={17} />
                    Добавить webhook
                  </button>
                </div>
                <div className="integration-webhook-column">
                  <label>
                    HTTPS URL
                    <input
                      type="url"
                      value={hookURL}
                      onChange={(event) => setHookURL(event.target.value)}
                      placeholder="https://example.com/webhooks/verbatrace"
                    />
                  </label>
                  <button
                    className="ghost-button"
                    disabled={busy || hooks.length === 0}
                    onClick={() => void testHook()}
                  >
                    Отправить тестовый webhook
                  </button>
                </div>
              </div>
			</div>}
          </section>
        )}
      </div>
		{connection && isBitrixConnection(connection) ? <section className="glass integration-list bitrix-history-panel"><div className="integration-section-heading"><div><span className="eyebrow">ИСТОРИЯ ПОДКЛЮЧЕНИЯ</span><h2>Импорты и аудит</h2><p>Последние операции доступны здесь, полная история открывается без перехода в отдельный модуль.</p></div><div className="integration-actions"><button className="ghost-button" type="button" onClick={()=>{setDetailView("imports");setImportsPage(0)}}>Все импорты ({importsTotal})</button><button className="ghost-button" type="button" onClick={()=>{setDetailView("audit");setAuditPage(0)}}>Полный аудит ({auditTotal})</button></div></div>{visibleImports.map((item)=><article key={item.ingest_item_uuid}><div><strong>{item.title}</strong><small>{new Date(item.created_at).toLocaleString("ru-RU")} · <code>{item.external_call_id}</code></small></div><span className={`integration-state is-${item.status}`}>{statusLabels[item.status]??item.status}</span></article>)}{visibleImports.length===0?<p>Импортированных звонков пока нет.</p>:null}</section>:null}
		{connection && !isBitrixConnection(connection) && (
        <>
          <section className="glass integration-list">
            <h2 className="integration-title"><span className="integration-icon is-account"><UserCog size={20}/></span>Сервисные аккаунты</h2>
            <div
              className="integration-actions"
              aria-label="Управление приложением"
            >
              {application.status === "active" ? (
                <button
                  className="ghost-button"
                  disabled={busy}
                  onClick={() => void applicationStatus("disabled")}
                >
                  Отключить приложение
                </button>
              ) : (
                <button
                  className="ghost-button"
                  disabled={busy}
                  onClick={() => void applicationStatus("active")}
                >
                  Включить приложение
                </button>
		)}
              <button
                className="ghost-button danger"
                disabled={busy}
                onClick={() => void applicationStatus("revoked")}
              >
                Отозвать приложение и ключи
              </button>
            </div>
            <div className="integration-inline-form">
              <input
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                maxLength={120}
                aria-label="Название сервисного аккаунта"
              />
              <button
                className="ghost-button"
                disabled={busy || !accountName.trim()}
                onClick={() => void createAccount()}
              >
                Создать
              </button>
              {application.environment === "sandbox" && (
                <>
                  <button
                    className="ghost-button"
                    disabled={busy}
                    onClick={() => void sandboxWallet("add")}
                  >
                    +25 000 тестовых
                  </button>
                  <button
                    className="ghost-button"
                    disabled={busy}
                    onClick={() => void sandboxWallet("reset")}
                  >
                    Сбросить тестовый баланс
                  </button>
                </>
              )}
            </div>
            {accounts.map((account) => (
              <article className="integration-account-block" key={account.service_account_uuid}>
                <div className="integration-account-summary">
                  <span className="integration-icon is-account"><UserCog size={19}/></span>
                  <span><strong>{account.name}</strong><small>Сервисный аккаунт для запросов к API</small></span>
                </div>
                <span className={`integration-state is-${account.status}`}>
                  {statusLabels[account.status] ?? account.status}
                </span>
                <button
                  className="ghost-button small"
                  disabled={busy || account.status !== "active"}
                  onClick={() => void createAccountKey(account)}
                >
                  Выпустить ключ
                </button>
                <button
                  className="ghost-button small danger"
                  disabled={busy || account.status !== "active"}
                  onClick={() => void revokeAccount(account)}
                >
                  Отозвать сервисный аккаунт
                </button>
                <div className="integration-key-list">
                  <div className="integration-permissions"><span>Разрешения</span><ScopeList scopes={account.scopes} /></div>
                  {(keysByAccount[account.service_account_uuid] ?? []).map(
                    (key) => (
                      <div className="integration-key-row" key={key.key_uuid}>
                        <span className="integration-key-summary">
                          <span className="integration-icon is-key"><KeyRound size={17}/></span>
                          <span><strong>{key.name.replace(/\s+key$/i, "")}</strong><small>API-ключ</small></span>
                        </span>
                        <span className={`integration-state is-${key.revoked_at ? "revoked" : "active"}`}>
                          {key.revoked_at ? "Отозван" : "Активен"}
                        </span>
                        {!key.revoked_at && (
                          <div className="integration-actions">
                            <button className="ghost-button small" disabled={busy} onClick={() => void rotateKey(key)}>
                              Заменить ключ
                            </button>
                            <button className="ghost-button small danger" disabled={busy} onClick={() => void revokeKey(key)}>
                              Отозвать
                            </button>
                          </div>
                        )}
                        <dl className="integration-key-metadata">
                          <div><dt>Начало ключа</dt><dd><code>{key.prefix}</code></dd></div>
                          <div><dt>Лимит</dt><dd>{key.permanent_credit_limit != null ? `${key.permanent_credit_limit.toLocaleString("ru-RU")} кредитов на весь срок` : key.temporary_credit_limit != null ? `${key.temporary_credit_limit.toLocaleString("ru-RU")} кредитов, ${new Date(key.temporary_limit_starts_at!).toLocaleString("ru-RU")} — ${new Date(key.temporary_limit_ends_at!).toLocaleString("ru-RU")}` : "Отдельный лимит не задан"}</dd></div>
                          <div><dt>Последнее использование</dt><dd>{key.last_used_at ? new Date(key.last_used_at).toLocaleString("ru-RU") : "Ещё не использовался"}</dd></div>
                          <div><dt>Создан</dt><dd>{new Date(key.created_at).toLocaleString("ru-RU")}</dd></div>
                        </dl>
                      </div>
                    ),
                  )}
                </div>
              </article>
            ))}
            {accounts.length === 0 && <p>Сервисных аккаунтов пока нет.</p>}
          </section>
          <section className="glass integration-list">
            <div className="integration-section-heading"><div><h2 className="integration-title"><span className="integration-icon is-import"><UploadCloud size={20}/></span>Последние импорты</h2><p>Последние 10 запросов на загрузку звонков</p></div>{importsTotal > 0 && <button className="ghost-button small" type="button" onClick={() => { setDetailView("imports"); setImportsPage(0); }}>Все импорты</button>}</div>
            {visibleImports.map((item) => (
              <article key={item.ingest_item_uuid}>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    ID во внешней системе: <code>{item.external_call_id}</code> · {new Date(item.created_at).toLocaleString("ru-RU")}
                    {item.error_code ? ` · Ошибка: ${item.error_code}` : ""}
                  </small>
                </div>
                <span className={`integration-state is-${item.status}`}>
                  {statusLabels[item.status] ?? item.status}
                </span>
                <div className="integration-actions">
                  {item.status === "failed" && (
                    <button
                      className="ghost-button small"
                      disabled={busy}
                      onClick={() => void ingestCommand(item, "retry")}
                    >
                      Повторить
                    </button>
                  )}
                  {["received", "retry_wait", "failed"].includes(
                    item.status,
                  ) && (
                    <button
                      className="ghost-button small danger"
                      disabled={busy}
                      onClick={() => void ingestCommand(item, "cancel")}
                    >
                      Отменить
                    </button>
                  )}
                </div>
              </article>
            ))}
            {imports.length === 0 && <p>Импортов пока нет.</p>}
          </section>
          <section className="glass integration-list">
            <h2>Webhooks и доставки</h2>
            {hooks.map((hook) => (
              <article key={hook.webhook_endpoint_uuid}>
                <div>
                  <strong>{hook.name}</strong>
                  <small>{hook.event_types.join(" · ")}</small>
                </div>
                <span>{statusLabels[hook.status] ?? hook.status}</span>
                {hook.status !== "revoked" && (
                  <button className="ghost-button small danger" disabled={busy} onClick={() => void revokeHook(hook)}>
                    Отозвать
                  </button>
                )}
              </article>
            ))}
            {deliveries.slice(0, 10).map((delivery) => (
              <article key={delivery.delivery_uuid}>
                <div>
                  <strong>Попытка #{delivery.attempt}</strong>
                  <small>
                    {new Date(delivery.created_at).toLocaleString("ru-RU")} ·
                    HTTP {delivery.http_status ?? "—"}
                  </small>
                </div>
                <span className={`integration-state is-${delivery.status}`}>
                  {statusLabels[delivery.status] ?? delivery.status}
                </span>
              </article>
            ))}
            {hooks.length === 0 && deliveries.length === 0 && (
              <p>Webhook ещё не настроен.</p>
            )}
          </section>
          <section className="glass integration-list">
            <div className="integration-section-heading"><div><h2 className="integration-title"><span className="integration-icon is-audit"><ScrollText size={20}/></span>Аудит</h2><p>Последние 10 изменений и действий интеграции</p></div>{auditTotal > 0 && <button className="ghost-button small" type="button" onClick={() => { setDetailView("audit"); setAuditPage(0); }}>Полный журнал</button>}</div>
            {audit.slice(0, 10).map((event) => (
              <article key={event.audit_event_uuid}>
                <div className="integration-event-title">
                  <AuditEventEmblem type={event.event_type}/>
                  <span><strong>{auditLabels[event.event_type] ?? "Техническое событие интеграции"}</strong><small>{new Date(event.created_at).toLocaleString("ru-RU")} · {actorLabels[event.actor_type] ?? event.actor_type} · {entityLabels[event.entity_type] ?? event.entity_type}</small></span>
                </div>
              </article>
            ))}
            {audit.length === 0 && <p>Событий пока нет.</p>}
          </section>
        </>
      )}
      {accountKey && (
        <div className="integration-secret-backdrop">
          <section
            className="integration-secret-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="service-key-title"
          >
            <KeyRound size={28} />
            <h2 id="service-key-title">Сохраните API-ключ</h2>
            <p>
              Ключ показывается один раз. Другой сотрудник не сможет посмотреть
              его позже.
            </p>
            <code>{accountKey.secret}</code>
            <button
              className="ghost-button"
              onClick={() => void copyToClipboard(accountKey.secret, () => { setCopyMessage(""); window.setTimeout(() => setCopyMessage("Ключ скопирован"), 0); }, () => setCopyMessage("Не удалось скопировать ключ"))}
            >
              <Copy size={16} />
              Скопировать
            </button>
            <button
              className="primary-button"
              onClick={() => setAccountKey(null)}
            >
              Я сохранил ключ
            </button>
          </section>
        </div>
      )}
      {secret && (
        <div className="integration-secret-backdrop">
          <section
            className="integration-secret-dialog"
            role="dialog"
            aria-modal="true"
          >
            <Webhook size={28} />
            <h2>Сохраните секрет подписи</h2>
            <p>После закрытия его нельзя посмотреть снова.</p>
            <code>{secret}</code>
            <button
              className="ghost-button"
              onClick={() => void copyToClipboard(secret, () => { setCopyMessage(""); window.setTimeout(() => setCopyMessage("Секрет скопирован"), 0); }, () => setCopyMessage("Не удалось скопировать секрет"))}
            >
              <Copy size={16} />
              Скопировать
            </button>
            <button className="primary-button" onClick={() => setSecret(null)}>
              Я сохранил секрет
            </button>
          </section>
        </div>
      )}
      {copyMessage && <TransientAlert message={copyMessage} tone="success" />}
    </>
  );
}

function normalizedMappingStatus(status: string): BitrixMappingDraft["status"] {
	return status === "mapped" || status === "ignored" ? status : "unmapped";
}

function mappingDraftForUser(user: BitrixExternalUser): BitrixMappingDraft {
	return { internalUserId: user.internal_user_uuid ?? "", departmentId: user.department_uuid ?? "", status: normalizedMappingStatus(user.mapping_status) };
}

function mappingTargetLabel(userID: string | null | undefined, departmentID: string | null | undefined, members: CompanyMemberListItemResponse[], departments: DepartmentResponse[]) {
	if (!userID) return "Без сопоставления";
	const member = members.find((item) => item.user_uuid === userID);
	const department = departments.find((item) => item.id === departmentID);
	// A mapping may point at somebody who has since left the company, or at a
	// department the page has not loaded. Either way the answer is a word, never
	// the identifier the record happens to hold.
	const name = (member && ([member.full_surname, member.full_name].filter(Boolean).join(" ") || member.username)) || "Участник";
	if (!departmentID) return `${name} · руководитель компании, без отдела`;
	return `${name} · ${department?.name ?? "отдел вне списка"}`;
}
