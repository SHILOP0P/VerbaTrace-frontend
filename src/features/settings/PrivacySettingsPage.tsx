import { ArrowLeft, Eye, EyeOff, Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { SelectControl } from "../../shared/ui/primitives";
import type { CompanyResponse, DepartmentResponse, PrivacyEntityType, PrivacyPolicyConfig, PrivacyPolicyScope, PrivacyPolicyView } from "../../types";

const fallbackConfig: PrivacyPolicyConfig = {
  schema_version: 1,
  enabled: false,
  enforcement: "required",
  marker_contract: "ru-v1",
  entity_types: [],
  original_media_access: "call_acl",
  sanitized_media: "off",
  exports: "redacted_by_default",
  analysis_input: "redacted",
};

function scopeValue(scope: PrivacyPolicyScope) {
  if (scope.type === "personal") return "personal";
  if (scope.type === "company") return `company/${scope.companyId}`;
  return `department/${scope.companyId}/${scope.departmentId}`;
}

function parseScope(value: string): PrivacyPolicyScope {
  const [type, companyId = "", departmentId = ""] = value.split("/");
  if (type === "department" && companyId && departmentId) return { type, companyId, departmentId };
  if (type === "company" && companyId) return { type, companyId };
  return { type: "personal" };
}

function configForScope(scope: PrivacyPolicyScope, config: PrivacyPolicyConfig) {
  if (scope.type !== "personal" || config.original_media_access !== "uploader_and_scope_managers") return config;
  return { ...config, original_media_access: "uploader_only" as const };
}

function visibleMarker(marker: string) {
  return marker.replaceAll("_", "_\u200b");
}

export function PrivacySettingsPage({ companies, departments, onBack }: { companies: CompanyResponse[]; departments: DepartmentResponse[]; onBack: () => void }) {
  const [selectedScope, setSelectedScope] = useState("personal");
  const [view, setView] = useState<PrivacyPolicyView>();
  const [config, setConfig] = useState<PrivacyPolicyConfig>(fallbackConfig);
  const [reason, setReason] = useState("");
  const [highImpactAcknowledged, setHighImpactAcknowledged] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.previewPrivacyPolicy>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scope = useMemo(() => parseScope(selectedScope), [selectedScope]);
  const company = scope.type === "personal" ? undefined : companies.find((item) => item.id === scope.companyId);
  const department = scope.type === "department" ? departments.find((item) => item.id === scope.departmentId) : undefined;
  const scopeLabel = scope.type === "personal" ? "Личная политика" : scope.type === "company" ? `Компания · ${company?.name ?? "Без названия"}` : `Отдел · ${department?.name ?? "Без названия"}`;
  const options = useMemo(() => [
    { value: scopeValue({ type: "personal" }), label: "Личные звонки" },
    ...companies.map((item) => ({ value: scopeValue({ type: "company", companyId: item.id }), label: `Компания · ${item.name}` })),
    ...departments.map((item) => ({ value: scopeValue({ type: "department", companyId: item.company_uuid, departmentId: item.id }), label: `Отдел · ${companies.find((companyItem) => companyItem.id === item.company_uuid)?.name ?? "Компания"} / ${item.name}` })),
  ], [companies, departments]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true); setError(""); setPreview(undefined); setReason(""); setHighImpactAcknowledged(false);
    api.getPrivacyPolicy(scope).then((result) => {
      if (cancelled) return;
      const inherited = result.inherited_from?.active_version.config;
      const initial = result.draft?.config ?? result.active_version?.config ?? inherited ?? { ...fallbackConfig, entity_types: result.catalog.filter((item) => item.default_enabled).map((item) => item.entity_type) };
      setView(result);
      setConfig(configForScope(scope, initial));
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Не удалось загрузить настройки"); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [selectedScope]);

  const moneySelected = config.entity_types.includes("money_amount");
  const selected = useMemo(() => new Set(config.entity_types), [config.entity_types]);
  const inheritedVersion = scope.type === "department" && !view?.active_version ? view?.inherited_from?.active_version : undefined;
  const versionLabel = view?.active_version ? `Опубликована версия ${view.active_version.version}` : inheritedVersion ? `Наследуется версия компании ${inheritedVersion.version}` : "Ещё не включена";

  function toggleEntity(entity: PrivacyEntityType) {
    setPreview(undefined);
    setConfig((current) => ({ ...current, entity_types: selected.has(entity) ? current.entity_types.filter((item) => item !== entity) : [...current.entity_types, entity] }));
  }
  async function saveDraft() {
    setBusy(true); setError("");
    try {
      await api.savePrivacyDraft(config, view?.draft?.lock_version, scope);
      const refreshed = await api.getPrivacyPolicy(scope);
      setView(refreshed); setConfig(configForScope(scope, refreshed.draft?.config ?? config)); setPreview(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить черновик"); }
    finally { setBusy(false); }
  }
  async function runPreview() {
    setBusy(true); setError("");
    try { setPreview(await api.previewPrivacyPolicy(config, scope)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось выполнить предпросмотр"); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      await api.publishPrivacyPolicy(config, preview.preview_hash, reason.trim(), highImpactAcknowledged, scope);
      const refreshed = await api.getPrivacyPolicy(scope);
      setView(refreshed); setConfig(configForScope(scope, refreshed.active_version?.config ?? config)); setPreview(undefined); setReason(""); setHighImpactAcknowledged(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось опубликовать политику"); }
    finally { setBusy(false); }
  }

  return <section className="privacy-settings-page app-page atmospheric-page">
    <button className="ghost-button small" type="button" onClick={onBack}><ArrowLeft size={17} />К настройкам</button>
    <header className="privacy-settings-heading glass-panel"><span><ShieldCheck size={28} /></span><div><h1>Защита данных</h1><p>Скрывайте персональные данные русскими смысловыми маркерами. Суммы сохраняются для точного анализа.</p></div></header>
    <div className="privacy-scope-row"><label><span>Область политики</span><SelectControl aria-label="Область политики" className="privacy-select" menuClassName="privacy-select-menu privacy-scope-select-menu" value={selectedScope} onChange={(event) => setSelectedScope(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectControl></label><span className="privacy-version-chip">{versionLabel}</span></div>
    {scope.type === "department" && inheritedVersion && <p className="privacy-inheritance-note">Пока у отдела нет собственной опубликованной политики, действует политика компании. Публикация здесь создаст override только для этого отдела.</p>}
    {view && !view.can_manage && scope.type !== "personal" && <div className="privacy-readonly-note">Настройку компании и её отделов может изменять только менеджер компании.</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="privacy-settings-grid">
      <section className="glass-panel privacy-policy-card">
        <div className="privacy-card-title"><div><small>{scopeLabel}</small><h2>Что скрывать</h2></div><label className="privacy-master-switch integration-checkbox"><input type="checkbox" disabled={!view?.can_manage} checked={config.enabled} onChange={(event) => { setConfig((current) => ({ ...current, enabled: event.target.checked })); setPreview(undefined); }} /><span>{config.enabled ? "Защита включена" : "Защита выключена"}</span></label></div>
        <div className="privacy-entity-grid">{view?.catalog.map((item) => <label className={`privacy-entity-option integration-checkbox${selected.has(item.entity_type) ? " selected" : ""}`} key={item.entity_type}><input type="checkbox" disabled={!config.enabled || !view.can_manage} checked={selected.has(item.entity_type)} onChange={() => toggleEntity(item.entity_type)} /><span><strong>{item.label}</strong><small>{visibleMarker(item.marker)}</small></span></label>)}</div>
        {moneySelected && <div className="privacy-warning"><strong>Денежные суммы будут скрыты</strong><span>AI увидит факт упоминания суммы, но не сможет проверить конкретную цену, скидку или лимит.</span></div>}
      </section>
      <aside className="glass-panel privacy-access-card"><h2>Доступ к записи</h2><label><span>Кто может прослушивать запись</span><SelectControl disabled={!view?.can_manage} aria-label="Кто может прослушивать запись" className="privacy-select" menuClassName="privacy-select-menu privacy-access-select-menu" value={config.original_media_access} onChange={(event) => { setConfig((current) => ({ ...current, original_media_access: event.target.value as PrivacyPolicyConfig["original_media_access"], sanitized_media: "off" })); setPreview(undefined); }}><option value="call_acl">Все с доступом к звонку</option>{scope.type !== "personal" && <option value="uploader_and_scope_managers">Загрузивший и руководители</option>}<option value="uploader_only">Только загрузивший</option></SelectControl></label><p>Политика защиты очищает транскрипцию. Аудио- и видеозапись не изменяется.</p></aside>
    </div>
    {preview && <section className="glass-panel privacy-preview"><h2>Предпросмотр</h2><div><span>До</span><p>{preview.sample.before}</p></div><div><span>После</span><p>{preview.sample.after}</p></div>{preview.warnings.map((warning) => <div className="privacy-warning" key={warning.code}><strong>{warning.title}</strong><span>{warning.message}</span></div>)}{moneySelected && <label className="privacy-impact-confirm integration-checkbox"><input type="checkbox" checked={highImpactAcknowledged} onChange={(event) => setHighImpactAcknowledged(event.target.checked)} /><span>Понимаю: точные суммы станут недоступны для проверки цены, скидки и лимитов.</span></label>}<label className="privacy-publication-reason"><span>Причина публикации{scope.type !== "personal" ? " (минимум 10 символов)" : ""}</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Что изменилось и зачем" /></label></section>}
    <footer className="privacy-actions"><button className="ghost-button" type="button" disabled={busy || !view?.can_manage} onClick={() => void saveDraft()}><Save size={17} />Сохранить черновик</button><button className="ghost-button" type="button" aria-expanded={Boolean(preview)} disabled={busy || !view?.can_manage || (config.enabled && config.entity_types.length === 0)} onClick={() => preview ? setPreview(undefined) : void runPreview()}>{preview ? <EyeOff size={17} /> : <Eye size={17} />}{preview ? "Скрыть предпросмотр" : "Предпросмотр"}</button><button className="primary-button" type="button" disabled={busy || !preview || !view?.can_manage || reason.trim().length < (scope.type !== "personal" ? 10 : 3) || (moneySelected && !highImpactAcknowledged)} onClick={() => void publish()}>Применить</button></footer>
  </section>;
}
