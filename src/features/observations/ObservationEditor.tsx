import { SelectControl } from "../../shared/ui/primitives";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import type {
  AnalyticsFilters,
  CallFolderResponse,
  CompanyMemberListItemResponse,
  DepartmentResponse,
} from "../../types";
import type { Observation, ObservationInput } from "./types";

type Props = {
  scope: AnalyticsFilters;
  item?: Observation;
  onClose: () => void;
  onSaved: (item: Observation) => void;
};
type ObservationCriterionOption = {
  criterion_key: string;
  title: string;
  instruction: { title: string };
};

export function ObservationEditor({ scope, item, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [kind, setKind] = useState<ObservationInput["kind"]>(
    item?.kind ?? "criterion",
  );
  const [description, setDescription] = useState(item?.description ?? "");
  const [criterion, setCriterion] = useState(item?.criterion_key ?? "");
  const [quality, setQuality] = useState(item?.quality ?? true);
  const [filters, setFilters] = useState<ObservationInput["filters"]>(
    item?.filters ?? { include_internal: false, exclude_shared: false },
  );
  const [historyPolicy, setHistoryPolicy] = useState<"retain" | "delete" | "">(
    "",
  );
  const [criteria, setCriteria] = useState<ObservationCriterionOption[]>([]);
  const [folders, setFolders] = useState<CallFolderResponse[]>([]);
  const [departments, setDepartments] = useState<DepartmentResponse[]>([]);
  const [employees, setEmployees] = useState<CompanyMemberListItemResponse[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const exitAction = useRef<(() => void) | undefined>(undefined);
  function closePanel(action = onClose) {
    if (exitAction.current) return;
    exitAction.current = action;
    setClosing(true);
  }
  function finishClosing() {
    const action = exitAction.current;
    exitAction.current = undefined;
    action?.();
  }
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(finishClosing, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260);
    return () => window.clearTimeout(timer);
  }, [closing]);
  const [error, setError] = useState("");
  const [choicesError, setChoicesError] = useState("");
  const [estimate, setEstimate] = useState<{
    maximum_credits: number;
    description: string;
  }>();
  const panel = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const initialFocus = useRef<HTMLElement | null>(null);
  const scopeKey = JSON.stringify(scope);
  const normalizedFilters = useMemo(
    () => ({
      employee_uuid: filters.employee_uuid || "",
      department_uuid: filters.department_uuid || "",
      folder_uuids: [...new Set([...(filters.folder_uuids ?? []), ...(filters.folder_uuid ? [filters.folder_uuid] : [])])].sort(),
      instruction_uuid: filters.instruction_uuid || "",
      include_internal: filters.include_internal,
      exclude_shared: filters.exclude_shared,
    }),
    [filters],
  );
  const originalFilters = item
    ? {
        employee_uuid: item.filters.employee_uuid || "",
        department_uuid: item.filters.department_uuid || "",
        folder_uuids: [...new Set([...(item.filters.folder_uuids ?? []), ...(item.filters.folder_uuid ? [item.filters.folder_uuid] : [])])].sort(),
        instruction_uuid: item.filters.instruction_uuid || "",
        include_internal: item.filters.include_internal,
        exclude_shared: item.filters.exclude_shared,
      }
    : null;
  const semanticChange = Boolean(
    item &&
      (kind !== item.kind ||
        (kind === "description"
          ? description.trim() !== item.description.trim()
          : criterion !== item.criterion_key) ||
        quality !== item.quality),
  );
  const scopeChanged = Boolean(item && JSON.stringify(normalizedFilters) !== JSON.stringify(originalFilters));
  const needsPreparation =
    kind === "description" &&
    (!item ||
      semanticChange ||
      (!scopeChanged && !item.interpretation &&
        (item.status === "paused" || item.status === "error")));

  useEffect(() => {
    alive.current = true;
    initialFocus.current = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    return () => {
      alive.current = false;
      initialFocus.current?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy && !closing && !e.defaultPrevented && !document.querySelector(".select-menu-portal")) {
        e.stopPropagation();
        closePanel();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [busy, closing, onClose]);
  useEffect(() => {
    let stop = false;
    const level = scope.department_uuid
      ? "department"
      : scope.company_uuid
        ? "company"
        : "personal";
    void Promise.allSettled([
      api
        .getCriterionCatalogue({
          company_uuid: scope.company_uuid,
          department_uuid: scope.department_uuid,
        })
        .then((v) => {
          if (!stop)
            setCriteria(
              v.items
                .filter((choice) => choice.active && choice.criterion.enabled)
                .map((choice) => ({
                  criterion_key: choice.criterion.criterion_key,
                  title: choice.criterion.title,
                  instruction: { title: choice.instruction_title },
                })),
            );
        }),
      api
        .listCallFolders({
          scope: level,
          company_uuid: scope.company_uuid,
          department_uuid: scope.department_uuid,
          limit: 100,
        })
        .then((v) => {
          if (!stop) setFolders(v.items);
        }),
      scope.company_uuid ? api.listDepartments(scope.company_uuid).then(v => { if (!stop) setDepartments(v); }) : Promise.resolve(),
      scope.company_uuid
        ? api
            .listCompanyMembers(scope.company_uuid, {
              status: "active",
              department_uuid: scope.department_uuid,
              limit: 100,
            })
            .then((v) => {
              if (!stop) setEmployees(v.members);
            })
        : Promise.resolve(),
    ]).then((results) => {
      if (!stop && results.some((v) => v.status === "rejected"))
        setChoicesError(
          "Часть вариантов недоступна. Обновите страницу, чтобы загрузить их повторно.",
        );
    });
    return () => {
      stop = true;
    };
  }, [scopeKey]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (needsPreparation && estimate?.description !== description) {
        const value = await api.estimateObservationPreparation(
          scope,
          description,
        );
        if (alive.current) setEstimate({ ...value, description });
        return;
      }
      if (
        semanticChange &&
        historyPolicy === "delete" &&
        !window.confirm(
          "Удалить сохранённые результаты и цитаты предыдущего правила? Финансовый учёт выполненных операций сохранится. Это действие нельзя отменить.",
        )
      )
        return;
      const input: ObservationInput = {
        title,
        kind,
        description: kind === "description" ? description : "",
        criterion_key: kind === "criterion" ? criterion : "",
        quality,
        filters: {
          ...filters,
          employee_uuid: filters.employee_uuid || undefined,
          department_uuid: filters.department_uuid || undefined,
          folder_uuid: undefined,
          folder_uuids: normalizedFilters.folder_uuids,
          instruction_uuid: filters.instruction_uuid || undefined,
        },
        cost_confirmed: needsPreparation,
        preparation_maximum_credits: needsPreparation
          ? estimate?.maximum_credits
          : undefined,
        lock_version: item?.lock_version,
        ...(semanticChange
          ? {
              replace_rule: true,
              history_policy: historyPolicy as "retain" | "delete",
            }
          : {}),
      };
      const saved = item
        ? await api.updateObservation(item.id, scope, input)
        : await api.createObservation(scope, input);
      if (alive.current) closePanel(() => onSaved(saved));
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Не удалось сохранить наблюдение",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function changeFilter<K extends keyof ObservationInput["filters"]>(
    key: K,
    value: ObservationInput["filters"][K],
  ) {
    setFilters((v) => ({ ...v, [key]: value }));
  }

  return (
    <div className="observation-creation-layer">
      <aside
        className={`observation-creator glass-panel${closing ? " is-closing" : ""}`}
        role="dialog"
        aria-modal="false"
        aria-label={item ? "Редактировать наблюдение" : "Создать наблюдение"}
        ref={panel}
        onAnimationEnd={(event) => {
          if (closing && event.target === event.currentTarget && event.animationName === "observation-slide-out") finishClosing();
        }}
      >
        <header>
          <h2>{item ? "Настройка наблюдения" : "Новое наблюдение"}</h2>
          <button
            className="icon-button"
            disabled={busy || closing}
            aria-label="Закрыть настройку"
            onClick={() => closePanel()}
          >
            <X size={18} />
          </button>
        </header>
        <fieldset disabled={busy || closing} className="observation-editor-fields">
          <label>
            Название
            <input
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например, следующий шаг не согласован"
            />
          </label>
          <label>
            Основа
            <SelectControl
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as typeof kind);
                if (!item) setQuality(e.target.value === "criterion");
                setEstimate(undefined);
              }}
            >
              <option value="criterion">Критерий инструкции</option>
              <option value="description">Описание ситуации</option>
            </SelectControl>
          </label>
          {kind === "criterion" ? (
            <label>
              Критерий
              <SelectControl
                value={criterion}
                onChange={(e) => {
                  setCriterion(e.target.value);
                  if (!title)
                    setTitle(
                      criteria.find((c) => c.criterion_key === e.target.value)
                        ?.title ?? "",
                    );
                }}
              >
                <option value="">Выберите критерий</option>
                {criterion &&
                  !criteria.some((c) => c.criterion_key === criterion) && (
                    <option value={criterion}>Текущий критерий</option>
                  )}
                {criteria.map((c) => (
                  <option value={c.criterion_key} key={c.criterion_key}>
                    {c.title} · {c.instruction.title}
                  </option>
                ))}
              </SelectControl>
              <small>
                Используем готовые оценки, включая опубликованные исправления
                проверяющего.
              </small>
            </label>
          ) : (
            <label>
              Что отслеживать
              <textarea
                rows={6}
                maxLength={5000}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setEstimate(undefined);
                }}
                placeholder="Опишите ситуацию и условия, при которых её нужно проверять."
              />
              <small>
                Перед включением покажем трактовку. Связанные условия
                проверяются вместе.
              </small>
            </label>
          )}
          <label className="observation-check checkbox-row">
            <input
              type="checkbox"
              checked={quality}
              onChange={(e) => setQuality(e.target.checked)}
            />
            Наблюдение отслеживает проблему или нарушение
          </label>
          <small>
            Отметьте только для нарушения: это позволяет настроить уведомления о доле звонков без нарушения. Для обычной темы оставьте выключенным.
          </small>
          <details className="observation-filter-editor">
            <summary>Область звонков</summary>
            {scope.company_uuid && <label>Отдел<SelectControl value={filters.department_uuid ?? ""} onChange={e => setFilters(current => ({ ...current, department_uuid: e.target.value || undefined, employee_uuid: undefined }))}>
              <option value="">{scope.department_uuid ? "Текущий отдел" : "Все доступные отделы"}</option>
              {filters.department_uuid && !departments.some(d => d.id === filters.department_uuid) && <option value={filters.department_uuid}>Ранее выбранный отдел</option>}
              {departments.filter(d => !scope.department_uuid || d.id === scope.department_uuid).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </SelectControl></label>}
            {scope.company_uuid && (
              <label>
                Сотрудник
                <SelectControl
                  value={filters.employee_uuid ?? ""}
                  onChange={(e) =>
                    changeFilter("employee_uuid", e.target.value)
                  }
                >
                  <option value="">Все сотрудники выбранной области</option>
                  {filters.employee_uuid &&
                    !employees.some(
                      (v) => v.user_uuid === filters.employee_uuid,
                    ) && (
                      <option value={filters.employee_uuid}>
                        Текущий сотрудник
                      </option>
                    )}
                  {employees.filter(v => !filters.department_uuid || v.departments.some(d => d.department_uuid === filters.department_uuid)).map((v) => (
                    <option value={v.user_uuid} key={v.user_uuid}>
                      {[v.full_name, v.full_surname]
                        .filter(Boolean)
                        .join(" ") || v.username}
                    </option>
                  ))}
                </SelectControl>
              </label>
            )}
            <fieldset className="observation-folders">
              <legend>Папки</legend>
              <small>Звонки из любой выбранной папки. Если ничего не выбрано — все доступные звонки.</small>
              <div className="observation-folder-choices">
                {[...folders, ...normalizedFilters.folder_uuids.filter(id => !folders.some(f => f.id === id)).map(id => ({ id, name: "Ранее выбранная папка · недоступна в списке" }))].map(folder => (
                  <label className="observation-check checkbox-row" key={folder.id}>
                    <input type="checkbox" checked={normalizedFilters.folder_uuids.includes(folder.id)} onChange={e => setFilters(current => ({ ...current, folder_uuid: undefined, folder_uuids: e.target.checked ? [...normalizedFilters.folder_uuids, folder.id] : normalizedFilters.folder_uuids.filter(id => id !== folder.id) }))}/>
                    {folder.name}
                  </label>
                ))}
              </div>
              {normalizedFilters.folder_uuids.length > 0 && <button type="button" className="ghost-button small" onClick={() => setFilters(current => ({ ...current, folder_uuid: undefined, folder_uuids: [] }))}>Снять выбор папок</button>}
            </fieldset>
            {filters.instruction_uuid && <p className="observation-helper">В прежней настройке сохранён фильтр по инструкции. <button type="button" className="ghost-button small" onClick={() => changeFilter("instruction_uuid", undefined)}>Убрать старый фильтр</button></p>}
            <label className="observation-check checkbox-row">
              <input
                type="checkbox"
                checked={filters.include_internal}
                onChange={(e) =>
                  changeFilter("include_internal", e.target.checked)
                }
              />
              Учитывать внутренние звонки
            </label>
            <label className="observation-check checkbox-row">
              <input
                type="checkbox"
                checked={!filters.exclude_shared}
                onChange={(e) =>
                  changeFilter("exclude_shared", !e.target.checked)
                }
              />
              Учитывать совместные звонки
            </label>
            {choicesError && (
              <p className="observation-helper" role="status">
                {choicesError}
              </p>
            )}
          </details>
          {scopeChanged && !semanticChange && <p className="observation-helper">Меняется только область звонков. Правило, его версия и сохранённые результаты сохранятся. Повторная проверка не запускается.</p>}
          {semanticChange && (
            <div className="observation-replacement-note">
              <p>
                Изменение создаст новую версию правила. Автоматические проверки
                возобновятся после её включения; история запускается отдельно.
              </p>
              <label>
                Предыдущие результаты
                <SelectControl
                  value={historyPolicy}
                  onChange={(e) =>
                    setHistoryPolicy(e.target.value as typeof historyPolicy)
                  }
                >
                  <option value="">Выберите действие</option>
                  <option value="retain">Сохранить в предыдущей версии</option>
                  <option value="delete">Удалить результаты и цитаты</option>
                </SelectControl>
              </label>
              {historyPolicy === "delete" && (
                <p className="form-error">
                  Результаты предыдущего правила будут удалены без возможности
                  восстановления. Финансовый учёт сохранится.
                </p>
              )}
            </div>
          )}
        </fieldset>
        {estimate && needsPreparation && (
          <div className="observation-cost">
            Подготовка правила: не более{" "}
            {estimate.maximum_credits.toLocaleString("ru-RU")} кредитов.
            Проверки звонков оплачиваются отдельно. Списывается фактический
            расход.
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={
            busy || closing ||
            !title.trim() ||
            (kind === "criterion" ? !criterion : !description.trim()) ||
            (semanticChange && !historyPolicy)
          }
          onClick={() => void submit()}
        >
          {busy
            ? "Сохраняем…"
            : needsPreparation && estimate?.description !== description
              ? "Рассчитать стоимость подготовки"
              : needsPreparation
                ? "Подтвердить расход и подготовить"
                : item
                  ? "Сохранить изменения"
                  : "Создать наблюдение"}
        </button>
        {!item && (
          <p className="observation-helper">
            Пробная проверка на выбранных звонках доступна после подготовки. Она
            необязательна.
          </p>
        )}
      </aside>
    </div>
  );
}
