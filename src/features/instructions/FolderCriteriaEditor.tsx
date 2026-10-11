import { useEffect, useState } from "react";
import { api } from "../../api";
import type { CriterionCatalogue } from "../../types";
import { CriterionPicker } from "./CriterionPicker";

export function FolderCriteriaEditor({ folderId, departmentId, onSaved }: {
  folderId?: string; departmentId?: string; onSaved?: () => void;
}) {
  const [catalogue, setCatalogue] = useState<CriterionCatalogue>();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [requestMode, setRequestMode] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  function accept(value: CriterionCatalogue) {
    setCatalogue(value);
    setSelected(value.items.filter(item => item.selected).map(item => item.criterion.criterion_key));
  }
  useEffect(() => {
    let cancelled = false;
    setCatalogue(undefined); setError(""); setNotice(""); setRequestMode(false);
    const operation = departmentId ? api.getDepartmentCriteria(departmentId) : api.getFolderCriteria(folderId!);
    operation.then(value => { if (!cancelled) accept(value); }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Критерии недоступны.");
    });
    return () => { cancelled = true; };
  }, [folderId, departmentId]);
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      if (requestMode) {
        if (departmentId) await api.requestDepartmentCriteria(departmentId, selected);
        else await api.requestFolderCriteria(folderId!, selected);
        accept(departmentId ? await api.getDepartmentCriteria(departmentId) : await api.getFolderCriteria(folderId!));
        setNotice("Запрос отправлен руководителю компании. Текущий набор не изменён.");
        setRequestMode(false);
      } else {
        accept(departmentId ? await api.replaceDepartmentCriteria(departmentId, selected) : await api.replaceFolderCriteria(folderId!, selected));
        setNotice("Обязательный набор сохранён."); onSaved?.();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить набор."); }
    finally { setBusy(false); }
  }
  return <section className="folder-criteria-editor">
    <h3>Обязательные критерии {departmentId ? "отдела" : "папки"}</h3>
    <p className="muted">{departmentId ? "Используются для звонков отдела и наследуются его папками. Лидер может дополнить набор в папке. Общий предел — 40 критериев." : "Дополнительные критерии папки меняются здесь. Набор отдела наследуется автоматически. Общий предел — 40 критериев."}</p>
    {error && <p className="field-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {catalogue ? <>
      <CriterionPicker catalogue={{ ...catalogue, can_select: !!catalogue.can_edit }} selected={selected} onChange={setSelected} disabled={busy} editable={requestMode} />
      {catalogue.can_edit && <div className="instruction-draft-toolbar">
        {catalogue.can_request && <button type="button" className="ghost-button small" disabled={busy} onClick={() => setRequestMode(value => !value)}>{requestMode ? "Отменить запрос" : "Запросить изменение назначенного набора"}</button>}
        <button type="button" className="primary-button small" disabled={busy || (catalogue.items.filter(item=>item.active && selected.includes(item.criterion.criterion_key)).length > 40)} onClick={() => void save()}>{busy ? "Сохраняем…" : requestMode ? "Отправить запрос" : "Сохранить критерии"}</button>
      </div>}
    </> : !error && <p role="status">Загружаем набор…</p>}
  </section>;
}
