import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { TableSkeleton } from "../../shared/ui/page-loading";
import {CriterionPicker} from "../instructions/CriterionPicker";
import type {CriterionCatalogue} from "../../types";
import {
  BriefcaseBusiness,
  CircleAlert,
  CircleUserRound,
  CloudUpload,
  FileAudio,
  FileVideo,
  FileText,
  Pencil,
  Plus,
  UserRound,
  Upload,
  UsersRound,
  X
} from "lucide-react";
import { DragEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { loadUploadDraft, rememberUploadDraft, saveUploadDraft, type UploadDraft } from "./upload-draft";
import { api } from "../../api";
import type {
  AppPage,
  CallFolderResponse,
  CallResponse,
  CompanyResponse,
  DepartmentMemberResponse,
  DepartmentResponse,
  SessionState,
  UserResponse,
  VisibilityScope
} from "../../types";

import { isCompanyManager } from "../../shared/lib/access";
import { callScopeLabel } from "../../shared/lib/formatters";
import { FileDropZone, SelectControl } from "../../shared/ui/primitives";
import { StepItem } from "../instructions/instruction-components";

const maxBatchFiles = 10;
const mediaAccept = ".mp3,.wav,.m4a,.ogg,.mp4,.mov,.webm,.mkv,audio/*,video/mp4,video/quicktime,video/webm,video/x-matroska";
const uploadModeStorageKey = "verbatrace-upload-mode";

type UploadMode = "single" | "multiple";
type BatchUploadItem = {
  id: string;
  file: File;
  title: string;
  status: "pending" | "uploading" | "success" | "failed";
  error?: string;
};
type SpeakerHint = {
  id: string;
  name: string;
  username?: string;
  role: "self" | "other";
  note: string;
};
type DiarizationRoleDraft = { id: string; name: string; description: string };

type UploadPageProps = {
  session: SessionState;
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  departmentMembers: DepartmentMemberResponse[];
  loading: boolean;
  onNavigate: (page: AppPage) => void;
  onUploaded: (call: CallResponse, open: boolean) => void;
};
export function UploadPage(props: UploadPageProps) {
  const [restored, setRestored] = useState<{ draft?: UploadDraft }>();
  useEffect(() => {
    let stop = false;
    void loadUploadDraft(props.session.user.id).then(draft => { if (!stop) setRestored({ draft }); }).catch(() => { if (!stop) setRestored({}); });
    return () => { stop = true; };
  }, [props.session.user.id]);
  return restored ? <UploadForm key={props.session.user.id} {...props} initialDraft={restored.draft}/> : <TableSkeleton/>;
}
function UploadForm({
  session,
  companies,
  departments,
  loading,
  onNavigate,
  onUploaded,
  initialDraft
}: UploadPageProps & { initialDraft?: UploadDraft }) {
  const [uploadMode, setUploadMode] = useState<UploadMode>(() => initialDraft?.uploadMode ?? readStoredUploadMode());
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [media, setMedia] = useState<File | null>(initialDraft?.media ?? null);
  const [batchItems, setBatchItems] = useState<BatchUploadItem[]>(initialDraft?.batchItems ?? []);
  const [batchDragActive, setBatchDragActive] = useState(false);
  const [scope, setScope] = useState<VisibilityScope>(initialDraft?.scope ?? "personal");
  const [companyId, setCompanyId] = useState(initialDraft?.companyId ?? companies[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState(
    initialDraft?.departmentId ?? departments.find((department) => department.company_uuid === companies[0]?.id)?.id ?? ""
  );
  const [callFolders, setCallFolders] = useState<CallFolderResponse[]>([]);
  const [folderId, setFolderId] = useState(initialDraft?.folderId ?? "");
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [catalogue,setCatalogue]=useState<CriterionCatalogue>();
  const [criterionKeys,setCriterionKeys]=useState<string[]>(initialDraft?.criterionKeys ?? []);
  const restoredCriteria = useRef(initialDraft ? JSON.stringify([initialDraft.scope, initialDraft.companyId, initialDraft.departmentId, initialDraft.folderId]) : "");
  const [catalogueLoading,setCatalogueLoading]=useState(true);
  const [catalogueError,setCatalogueError]=useState("");
  useEffect(()=>{
    let cancelled=false;setCatalogueLoading(true);setCatalogueError("");
    const filters={company_uuid:scope==="personal"?undefined:companyId,department_uuid:scope==="department"?departmentId:undefined,folder_uuid:folderId||undefined};
    if((scope!=="personal"&&!companyId)||(scope==="department"&&!departmentId)){setCatalogueLoading(false);setCatalogue(undefined);return}
    api.getCriterionCatalogue(filters).then(value=>{
      if(cancelled)return;
      setCatalogue(value);
      const defaults=value.items.filter(item=>item.active&&item.selected).map(item=>item.criterion.criterion_key);
      const context = JSON.stringify([scope, companyId, departmentId, folderId]);
      if (restoredCriteria.current === context && value.can_select && !value.mandatory) {
        setCriterionKeys(current => [...new Set([...current.filter(key => value.items.some(item => item.active && item.criterion.enabled && item.criterion.criterion_key === key)), ...value.items.filter(item => item.active && (item.inherited || item.protected) && item.selected).map(item => item.criterion.criterion_key)])].slice(0, 40));
      } else if(defaults.length>40){setCriterionKeys([]);setCatalogueError(value.can_select?"Выберите не больше 40 критериев.":"Набор содержит больше 40 критериев. Руководитель должен изменить настройки.")}else setCriterionKeys(defaults);
      restoredCriteria.current = "";
    }).catch(cause=>{if(!cancelled)setCatalogueError(cause instanceof Error?cause.message:"Критерии недоступны.")}).finally(()=>{if(!cancelled)setCatalogueLoading(false)});
    return()=>{cancelled=true};
  },[scope,companyId,departmentId,folderId]);

  const [contacts, setContacts] = useState<UserResponse[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [speakerHints, setSpeakerHints] = useState<SpeakerHint[]>(initialDraft?.speakerHints ?? []);
  const [diarizationRoles, setDiarizationRoles] = useState<DiarizationRoleDraft[]>(initialDraft?.diarizationRoles ?? []);
  const [roleName, setRoleName] = useState(initialDraft?.roleName ?? "");
  const [roleDescription, setRoleDescription] = useState(initialDraft?.roleDescription ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftWarning, setDraftWarning] = useState("");
  const draft = useMemo<UploadDraft>(() => ({ uploadMode, title, media, batchItems, scope, companyId, departmentId, folderId, criterionKeys, speakerHints, diarizationRoles, roleName, roleDescription }), [uploadMode, title, media, batchItems, scope, companyId, departmentId, folderId, criterionKeys, speakerHints, diarizationRoles, roleName, roleDescription]);
  const latestDraft = useRef(draft);
  useEffect(() => {
    latestDraft.current = draft;
    rememberUploadDraft(session.user.id, draft);
    const timer = window.setTimeout(() => {
      void saveUploadDraft(session.user.id, draft).catch(() => setDraftWarning("Черновик сохранён в текущей вкладке. Не удалось сохранить файлы для перезагрузки страницы: в хранилище браузера недостаточно места или оно недоступно."));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, session.user.id]);
  useEffect(() => {
    const flush = () => { void saveUploadDraft(session.user.id, latestDraft.current).catch(() => undefined); };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [session.user.id]);

  const managedCompanies = useMemo(
    () => companies.filter((company) => isCompanyManager(company, session.user.id)),
    [companies, session.user.id]
  );
  // The departments endpoint already returns only departments visible to the
  // current user. Re-filtering through the members endpoint excluded ordinary
  // employees because only managers and department leaders may list members.
  const accessibleDepartments = departments;
  const companiesWithAccessibleDepartments = useMemo(
    () =>
      companies.filter((company) =>
        accessibleDepartments.some((department) => department.company_uuid === company.id)
      ),
    [accessibleDepartments, companies]
  );
  const availableCallScopes = useMemo<VisibilityScope[]>(
    () => [
      "personal",
      ...(managedCompanies.length > 0 ? (["company"] as VisibilityScope[]) : []),
      ...(accessibleDepartments.length > 0 ? (["department"] as VisibilityScope[]) : [])
    ],
    [accessibleDepartments.length, managedCompanies.length]
  );
  const selectableCompanies = scope === "department" ? companiesWithAccessibleDepartments : managedCompanies;
  const availableDepartments = accessibleDepartments.filter((department) => department.company_uuid === companyId);
  useEffect(() => {
    if (!availableCallScopes.includes(scope)) {
      setScope("personal");
    }
  }, [availableCallScopes, scope]);

  useEffect(() => {
    try {
      window.localStorage.setItem(uploadModeStorageKey, uploadMode);
    } catch {
      // The upload mode remains available for the current page when storage is unavailable.
    }
  }, [uploadMode]);

  useEffect(() => {
    if (scope === "personal") return;

    if (!selectableCompanies.some((company) => company.id === companyId)) {
      setCompanyId(selectableCompanies[0]?.id ?? "");
    }
  }, [companyId, scope, selectableCompanies]);

  useEffect(() => {
    if (scope !== "department") return;

    if (!availableDepartments.some((department) => department.id === departmentId)) {
      setDepartmentId(availableDepartments[0]?.id ?? "");
    }
  }, [availableDepartments, departmentId, scope]);

useEffect(() => {
    const filters = folderFiltersForUpload(scope, companyId, departmentId);
    if (!filters) {
      setCallFolders([]);
      setFolderId("");
      setFoldersLoading(false);
      setFolderError("");
      return;
    }

    let cancelled = false;
    setFoldersLoading(true);
    setFolderError("");

    api
      .listCallFolders({ limit: 100, offset: 0 })
      .then((response) => {
        if (cancelled) return;
        const matchingFolders = response.items.filter((folder) => folderMatchesUploadContext(folder, scope, companyId, departmentId));
        setCallFolders(matchingFolders);
        setFolderId((current) => matchingFolders.some((folder) => folder.id === current) ? current : "");
      })
      .catch((loadError) => {
        if (cancelled) return;
        setCallFolders([]);
        setFolderId("");
        setFolderError(loadError instanceof Error ? loadError.message : "Не удалось загрузить папки.");
      })
      .finally(() => {
        if (!cancelled) setFoldersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, departmentId, scope]);

  useEffect(() => {
    let cancelled = false;
    api.listContacts().then((items) => {
      if (!cancelled) setContacts(items);
    }).catch(() => {
      if (!cancelled) setContacts([]);
    });
    return () => { cancelled = true; };
  }, []);

  function addSpeakerHint(user?: UserResponse) {
    const id = user?.id ?? session.user.id;
    if (speakerHints.some((hint) => hint.id === id)) return;
    if (speakerHints.length + diarizationRoles.length >= 10) {
      setError("Для идентификации можно указать не более 10 участников и ролей.");
      return;
    }
    const name = user
      ? `${user.full_name} ${user.full_surname}`.trim() || user.username
      : `${session.user.full_name} ${session.user.full_surname}`.trim() || session.user.username;
    setSpeakerHints((current) => [...current, {
      id,
      name,
      username: user?.username ?? session.user.username,
      role: user ? "other" : "self",
      note: ""
    }]);
    setSelectedContactId("");
  }

  function updateSpeakerHint(id: string, update: Pick<SpeakerHint, "note">) {
    setSpeakerHints((current) => current.map((hint) => hint.id === id ? { ...hint, ...update } : hint));
  }

  function addDiarizationRole() {
    const name = roleName.trim();
    const description = roleDescription.trim();
    if (!name) return;
    if (speakerHints.length + diarizationRoles.length >= 10) {
      setError("Для идентификации можно указать не более 10 участников и ролей.");
      return;
    }
    if (diarizationRoles.some((role) => role.name.toLocaleLowerCase() === name.toLocaleLowerCase()) || speakerHints.some((hint) => hint.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError("Имена участников и названия ролей не должны повторяться.");
      return;
    }
    setError("");
    setDiarizationRoles((current) => [...current, { id: `${Date.now()}-${name}`, name, description }]);
    setRoleName("");
    setRoleDescription("");
  }

  function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const isTextInput = target instanceof HTMLTextAreaElement ||
      target.isContentEditable ||
      (target instanceof HTMLInputElement && !["button", "submit", "checkbox", "radio", "file"].includes(target.type));
    if (!isTextInput) return;

    event.preventDefault();
    if (target.closest(".diarization-role-add")) addDiarizationRole();
  }

  function selectBatchFiles(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;

    const knownFiles = new Set(batchItems.map((item) => batchFileKey(item.file)));
    const newFiles = selected.filter((file) => {
      const key = batchFileKey(file);
      if (knownFiles.has(key)) return false;
      knownFiles.add(key);
      return true;
    });
    if (newFiles.length === 0) return;

    if (batchItems.length + newFiles.length > maxBatchFiles) {
      setError(`Всего можно выбрать не более ${maxBatchFiles} звонков.`);
      return;
    }

    setError("");
    setBatchItems((items) => [...items, ...newFiles.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${Date.now()}-${index}`,
      file,
      title: titleFromFilename(file.name),
      status: "pending" as const
    }))]);
  }

  function handleBatchDrag(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setBatchDragActive(event.type === "dragenter" || event.type === "dragover");
  }

  function handleBatchDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setBatchDragActive(false);
    selectBatchFiles(event.dataTransfer.files);
  }

  function updateBatchItem(id: string, update: Partial<Pick<BatchUploadItem, "title" | "status" | "error">>) {
    setBatchItems((items) => items.map((item) => item.id === id ? { ...item, ...update } : item));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const processingMode = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "transcribe" ? "transcribe" : "analyze";
    setError("");

    if (uploadMode === "single" && !title.trim()) {
      setError("Введите название звонка.");
      return;
    }

    if (uploadMode === "single" && !media) {
      setError("Выберите аудио- или видеофайл.");
      return;
    }

    if (uploadMode === "multiple" && (batchItems.length === 0 || batchItems.length > maxBatchFiles)) {
      setError(`Выберите от 1 до ${maxBatchFiles} аудио- или видеофайлов.`);
      return;
    }

    if ((scope === "company" || scope === "department") && !companyId) {
      setError("Выберите компанию.");
      return;
    }

    if (scope === "department" && !departmentId) {
      setError("Выберите отдел.");
      return;
    }

    if(processingMode === "analyze" && (catalogueLoading || !catalogue || catalogueError)){setError(catalogueError||"Дождитесь загрузки критериев.");return}
    setBusy(true);
    try {
      const sharedInput = {
        processingMode: processingMode as "transcribe" | "analyze",
        companyUuid: scope === "company" || scope === "department" ? companyId : undefined,
        departmentUuid: scope === "department" ? departmentId : undefined,
        criterionKeys: processingMode === "analyze" ? criterionKeys : undefined,
        folderUuid: folderId || undefined,
        speakerHints: speakerHints.map(({ id, name, username, role, note }) => ({
          userId: id,
          name,
          username,
          role,
          note: note.trim()
        })),
        diarizationRoles: diarizationRoles.map(({ name, description }) => ({ name, description }))
      };
      if (uploadMode === "single" && media) {
        const created = await api.createCall({ ...sharedInput, title: title.trim(), media });
        latestDraft.current = { ...latestDraft.current, title: "", media: null };
        void saveUploadDraft(session.user.id, latestDraft.current).catch(() => undefined);
        setTitle(""); setMedia(null);
        onUploaded(created, true);
      } else {
        const queue = batchItems.filter(item => item.status !== "success");
        const completed = new Set<string>();
        const results: boolean[] = [];
        const uploadBatchItem = async (item: BatchUploadItem) => {
          updateBatchItem(item.id, { status: "uploading", error: undefined });
          try {
            const created = await api.createCall({ ...sharedInput, title: item.title.trim() || undefined, media: item.file });
            onUploaded(created, false);
            updateBatchItem(item.id, { status: "success" });
            completed.add(item.id);
            return true;
          } catch (uploadError) {
            updateBatchItem(item.id, {
              status: "failed",
              error: uploadError instanceof Error ? uploadError.message : "Не удалось загрузить звонок."
            });
            return false;
          }
        };
        await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
          while (queue.length > 0) {
            const item = queue.shift();
            if (item) results.push(await uploadBatchItem(item));
          }
        }));
        const failed = results.filter((result) => !result).length;
        if (failed > 0) setError(`Не удалось загрузить ${failed} из ${batchItems.length} звонков. Их можно повторить.`);
        else {
          latestDraft.current = { ...latestDraft.current, batchItems: batchItems.filter(item => item.status !== "success" && !completed.has(item.id)) };
          void saveUploadDraft(session.user.id, latestDraft.current).catch(() => undefined);
          setBatchItems(latestDraft.current.batchItems);
          onNavigate("calls");
        }
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить звонок");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="upload-layout">
      <aside className="step-rail glass">
        <div className="step-rail-title">
          <Upload size={28} />
          <div>
            <h2>Загрузка звонка</h2>
            <p>Загрузите аудио или видео и укажите, кому принадлежит этот звонок.</p>
          </div>
        </div>
        <StepItem active number="1" title="Файл и принадлежность" text="Загрузите файл и выберите, куда добавить звонок." />
        <StepItem number="2" title="Инструкция для анализа" text="Выберите инструкции, если нужен анализ." />
        <StepItem number="3" title="Результат обработки" text="Транскрипция или транскрипция с анализом — на ваш выбор." />
        <StepItem done title="Готово" text="Результаты появятся в обзоре звонка." />
      </aside>

      <form className="upload-form glass" onSubmit={submit} onKeyDown={handleFormKeyDown}>
        <h1>Загрузить звонок</h1>
        <p className="upload-draft-note" role="status">{draftWarning || "Черновик сохраняется на этом устройстве на 24 часа: файлы, участники и критерии. Можно перейти к инструкции и вернуться. При выходе из аккаунта черновик удаляется."}</p>
        <div>
          <span className="field-title">Режим загрузки</span>
          <SegmentedControl className="segmented scope">
            <button type="button" className={uploadMode === "single" ? "active" : ""} disabled={busy} onClick={() => setUploadMode("single")}>
              Один звонок
            </button>
            <button type="button" className={uploadMode === "multiple" ? "active" : ""} disabled={busy} onClick={() => setUploadMode("multiple")}>
              Несколько звонков
            </button>
          </SegmentedControl>
        </div>
        {uploadMode === "single" && (
          <label>
            Название звонка
            <div className="input-with-counter">
              <input
                value={title}
                maxLength={255}
                required
                placeholder="Например: обсуждение условий договора с клиентом"
                onChange={(event) => setTitle(event.target.value)}
              />
              <span>{title.length} / 255</span>
            </div>
          </label>
        )}
        <div>
          <span className="field-title">{uploadMode === "single" ? "Запись звонка" : `Записи звонков (до ${maxBatchFiles})`}</span>
          {uploadMode === "single" ? (
            <FileDropZone
              file={media}
              icon={media?.type.startsWith("video/") ? <FileVideo size={24} /> : <FileAudio size={24} />}
              accept={mediaAccept}
              buttonLabel="Выбрать запись"
              emptyLabel="Перетащите аудио или видео сюда"
              onFile={setMedia}
            />
          ) : (
            <label
              className={`file-dropzone ${batchDragActive ? "dragging" : ""}`}
              onDragEnter={handleBatchDrag}
              onDragOver={handleBatchDrag}
              onDragLeave={handleBatchDrag}
              onDrop={handleBatchDrop}
            >
              <input
                type="file"
                multiple
                accept={mediaAccept}
                disabled={busy}
                onChange={(event) => {
                  selectBatchFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <span className="file-dropzone-icon"><FileAudio size={24} /></span>
              <span className="file-dropzone-copy">
                <strong>{batchItems.length ? `Выбрано файлов: ${batchItems.length}` : "Выберите до 10 файлов"}</strong>
                <small>Для каждого автоматически будет задано название из имени файла.</small>
              </span>
              <span className="ghost-button file-dropzone-button">Выбрать файлы</span>
            </label>
          )}
          <small>Аудио: MP3, WAV, M4A, OGG. Видео: MP4, MOV, WEBM, MKV. Максимальный размер: 500 МБ.</small>
          {uploadMode === "multiple" && batchItems.length > 0 && (
            <div className="batch-upload-list">
              {batchItems.map((item) => (
                <div className={`batch-upload-item ${item.status}`} key={item.id}>
                  <FileAudio size={17} />
                  <span title={item.file.name}>{item.file.name}</span>
                  <input aria-label={`Название ${item.file.name}`} value={item.title} maxLength={255} disabled={busy} onChange={(event) => updateBatchItem(item.id, { title: event.target.value })} />
                  <small>{batchStatusLabel(item)}</small>
                  {!busy && <button className="icon-button" type="button" aria-label={`Удалить ${item.file.name}`} onClick={() => setBatchItems((items) => items.filter((current) => current.id !== item.id))}><X size={16} /></button>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <span className="field-title">Куда добавить звонок?</span>
          <SegmentedControl className="segmented scope">
            {availableCallScopes.map((item) => (
              <button
                type="button"
                key={item}
                className={scope === item ? "active" : ""}
                onClick={() => setScope(item)}
              >
                {item === "personal" && <CircleUserRound size={17} />}
                {item === "company" && <BriefcaseBusiness size={17} />}
                {item === "department" && <UsersRound size={17} />}
                {callScopeLabel(item)}
              </button>
            ))}
          </SegmentedControl>
        </div>
        {scope !== "personal" && (
          <div className="form-grid two">
            <label>
              Компания
              <SelectControl value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
                {selectableCompanies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </SelectControl>
            </label>
            {scope === "department" && (
              <label>
                Отдел
                <SelectControl value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                  {availableDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </SelectControl>
              </label>
            )}
          </div>
        )}
        <div className="upload-folder-field">
          <span className="field-title">Папка</span>
          <SelectControl
            aria-label="Папка для звонка"
            value={folderId}
            disabled={foldersLoading}
            onChange={(event) => setFolderId(event.target.value)}
          >
            <option value="">Без папки</option>
            {callFolders.map((folder) => (
              <option key={folder.id} value={folder.id} data-color={folder.color || "#ff7a43"}>
                {folder.name}
              </option>
            ))}
          </SelectControl>
          <small>
            {foldersLoading
              ? "Загружаю папки..."
              : callFolders.length > 0
                ? "Можно сразу положить звонок в папку выбранной области."
                : "Для выбранной области пока нет папок."}
          </small>
          {folderError && <div className="form-error compact">{folderError}</div>}
        </div>
        <section className="speaker-hints">
          <div className="speaker-hints-heading">
            <div>
              <strong>Участники звонка</strong>
              <small>Вы и контакты будут показаны по ФИО. Без участников звонок расшифровывается без меток спикеров.</small>
            </div>
            <UserRound size={21} />
          </div>
          <div className="speaker-hints-add">
            <button className="ghost-button small" type="button" disabled={busy || speakerHints.some((hint) => hint.id === session.user.id)} onClick={() => addSpeakerHint()}>
              <Plus size={15} /> Добавить себя
            </button>
            <SelectControl aria-label="Добавить контакт в участники" value={selectedContactId} disabled={busy || contacts.length === 0} onChange={(event) => {
              const contact = contacts.find((item) => item.id === event.target.value);
              if (contact) addSpeakerHint(contact);
            }}>
              <option value="">Добавить контакт…</option>
              {contacts.filter((contact) => !speakerHints.some((hint) => hint.id === contact.id)).map((contact) => (
                <option key={contact.id} value={contact.id}>{`${contact.full_name} ${contact.full_surname}`.trim() || contact.username}</option>
              ))}
            </SelectControl>
          </div>
          {speakerHints.length === 0 ? (
            <p className="speaker-hints-empty">Необязательно. Без участников будет обычная расшифровка без идентификации спикеров.</p>
          ) : (
            <div className="speaker-hints-list">
              {speakerHints.map((hint) => (
                <article className="speaker-hint-row" key={hint.id}>
                  <span className="avatar">{hint.name[0]?.toUpperCase() ?? "У"}</span>
                  <div className="speaker-hint-person"><strong title={hint.name}>{hint.name}</strong><small>{hint.role === "self" ? "Вы" : hint.username?.startsWith("@") ? hint.username : `@${hint.username ?? ""}`}</small></div>
                  <input aria-label={`Уточнение для ${hint.name}`} value={hint.note} maxLength={160} disabled={busy} placeholder="Необязательная подсказка" onChange={(event) => updateSpeakerHint(hint.id, { note: event.target.value })} />
                  <button className="icon-button" type="button" aria-label={`Убрать ${hint.name}`} disabled={busy} onClick={() => setSpeakerHints((current) => current.filter((item) => item.id !== hint.id))}><X size={16} /></button>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="diarization-roles">
          <div className="speaker-hints-heading">
            <div><strong>Дополнительные роли</strong><small>Для участников без известного профиля: интервьюер, кандидат, председатель комиссии, эксперт и любые другие.</small></div>
          </div>
          <div className="diarization-role-add">
            <input value={roleName} maxLength={80} disabled={busy} placeholder="Название роли" onChange={(event) => setRoleName(event.target.value)} />
            <input value={roleDescription} maxLength={300} disabled={busy} placeholder="Как распознать эту роль по разговору" onChange={(event) => setRoleDescription(event.target.value)} />
            <button className="ghost-button small" type="button" disabled={busy || !roleName.trim()} onClick={addDiarizationRole}><Plus size={15} />Добавить роль</button>
          </div>
          {diarizationRoles.length > 0 && <div className="diarization-role-list">{diarizationRoles.map((role) => <article key={role.id}><div><strong>{role.name}</strong><small>{role.description || "Без дополнительного описания"}</small></div><button className="icon-button" type="button" aria-label={`Убрать роль ${role.name}`} disabled={busy} onClick={() => setDiarizationRoles((current) => current.filter((item) => item.id !== role.id))}><X size={16} /></button></article>)}</div>}
        </section>
        <div className="context-note">
          <CircleAlert size={18} />
          <span>
            Выбранный контекст определяет, кто сможет просматривать звонок и какие критерии
            будут использованы для анализа.
          </span>
        </div>
        <div className="instruction-preview">
          <FileText size={21} />
          <div>
            <strong>Критерии для анализа</strong>
            <small>Выберите критерии или используйте обязательный набор папки.</small>
          </div>
          <button className="ghost-button small" type="button" onClick={() => onNavigate("settingsInstructions")}>
            <Pencil size={15} />
            Изменить инструкцию
          </button>
        </div>
        {catalogueLoading?<TableSkeleton />:catalogue&&<CriterionPicker catalogue={catalogue} selected={criterionKeys} disabled={busy} onChange={setCriterionKeys}/>}
        {catalogueError&&<p className="field-error" role="alert">{catalogueError}</p>}

        {error && <div className="form-error">{error}</div>}
        <div className="upload-processing-options">
          <div><FileText size={18}/><strong>Транскрипция</strong><p>Текст разговора. Роли участников можно поправить и запустить анализ позже.</p></div>
          <div><CloudUpload size={18}/><strong>Транскрипция и анализ</strong><p>Текст, разбор вопросов и оценка по выбранным критериям.</p></div>
        </div>
        {/* Running out of credits does not lose the upload: the call is accepted
            and starts by itself. Saying so here keeps the wait from looking
            like a failure. */}
        <details className="upload-processing-help"><summary>Как работает очередь и лимит кредитов</summary><p>Если кредитов недостаточно, звонок останется в очереди до обновления лимита. Размер очереди зависит от тарифа. Если очередь заполнена, покажем ошибку — незагруженные файлы сохранятся в черновике.</p></details>
        <div className="form-actions">
          <button className="ghost-button" type="submit" name="processing_mode" value="transcribe" disabled={busy}><FileText size={18} />{busy ? "Загружаю…" : uploadMode === "multiple" ? "Транскрибировать всё" : "Транскрибировать"}</button>
          <button className="primary-button" type="submit" name="processing_mode" value="analyze" disabled={busy}>
            <CloudUpload size={18} />
            {busy ? "Загружаю…" : uploadMode === "multiple" ? "Анализировать всё" : "Анализировать"}
          </button>
          <button className="ghost-button" type="button" onClick={() => onNavigate("calls")}>
            Отмена
          </button>
        </div>
      </form>

    </section>
  );
}

function folderFiltersForUpload(
  scope: VisibilityScope,
  companyId: string,
  departmentId: string
) {
  if (scope === "personal") {
    return { scope };
  }

  if (scope === "company") {
    return companyId ? { scope, company_uuid: companyId } : null;
  }

  return companyId && departmentId
    ? { scope, company_uuid: companyId, department_uuid: departmentId }
    : null;
}

function folderMatchesUploadContext(
  folder: CallFolderResponse,
  scope: VisibilityScope,
  companyId: string,
  departmentId: string
) {
  if (folder.scope !== scope) return false;
  if (scope === "personal") return true;
  if (folder.company_uuid !== companyId) return false;
  return scope !== "department" || folder.department_uuid === departmentId;
}

function titleFromFilename(filename: string) {
  const withoutExtension = filename.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || "Звонок";
}

function batchFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function readStoredUploadMode(): UploadMode {
  try {
    const currentMode = window.localStorage.getItem(uploadModeStorageKey);
    return currentMode === "multiple" ? "multiple" : "single";
  } catch {
    return "single";
  }
}

function batchStatusLabel(item: BatchUploadItem) {
  if (item.status === "uploading") return "Загружается";
  if (item.status === "success") return "Поставлен в очередь";
  if (item.status === "failed") return item.error ?? "Ошибка загрузки";
  return "Готов к загрузке";
}
