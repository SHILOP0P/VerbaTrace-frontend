import { ArrowLeft, Check, Eye, Plus, RotateCcw, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "../../api";
import type { CallResponse, CallSubjectCandidate, PrivacyCorrectionPreview, PrivacyCorrectionRequest, PrivacyEntityType, TranscriptionResponse, TranscriptionSpeakerAssignment, TranscriptionSpeakerRole, TranscriptionWordResponse, UserResponse } from "../../types";
import { formatSegmentTimeRange, speakerLabel } from "../../shared/lib/formatters";
import { speakerColor as colorOfSpeaker } from "../../shared/lib/speaker-colors";
import { SelectControl } from "../../shared/ui/primitives";

type DraftWord = { text: string; speaker: string };

export function TranscriptionEditPage({
  call,
  currentUser,
  transcription,
  loading,
  onBack,
  onSaved
}: {
  call?: CallResponse;
  currentUser?: UserResponse;
  transcription?: TranscriptionResponse;
  loading?: boolean;
  onBack: () => void;
  onSaved: (transcription: TranscriptionResponse, reanalysisRequired?: boolean) => void;
}) {
  const words = transcription?.words ?? [];
  const [draft, setDraft] = useState<DraftWord[]>(() => createDraft(words));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<UserResponse[]>([]);
  // Employees of the call's company: marking one as a speaker shares the call.
  const [employees, setEmployees] = useState<CallSubjectCandidate[]>([]);
  const [assignments, setAssignments] = useState<TranscriptionSpeakerAssignment[]>([]);
  const [savedAssignments, setSavedAssignments] = useState("");
  const [removingSpeaker, setRemovingSpeaker] = useState<string>();
  const [privacyOperation, setPrivacyOperation] = useState<"add_mask">();
  const [maskSelection, setMaskSelection] = useState<number[]>([]);
  const [privacyEntity, setPrivacyEntity] = useState<PrivacyEntityType>("person_name");
  const [privacyReason, setPrivacyReason] = useState("");
  const [privacyPreview, setPrivacyPreview] = useState<PrivacyCorrectionPreview>();
  const [privacyBusy, setPrivacyBusy] = useState(false);

  useEffect(() => {
    setDraft(createDraft(words));
    setError("");
  }, [transcription?.revision, transcription?.updated_at]);

  useEffect(() => {
    if (!call || words.length === 0) return;
    let cancelled = false;
    Promise.all([api.listContacts(), api.listTranscriptionSpeakerAssignments(call.id), call.company_uuid ? api.listCallSubjectCandidates(call.id).then((result) => result.items).catch(() => []) : Promise.resolve([])]).then(([contactItems, stored, employeeItems]) => {
      if (cancelled) return;
      const detected = Array.from(new Set(words.map((word) => word.speaker?.trim() || "unknown")));
      const speakerKeys = Array.from(new Set([...detected, ...stored.map((item) => item.speaker_key)]));
      const merged = speakerKeys.map((speakerKey) => stored.find((item) => item.speaker_key === speakerKey) ?? { speaker_key: speakerKey, display_name: speakerLabel(speakerKey === "unknown" ? "" : speakerKey), role: "unknown" as const });
      setContacts(contactItems); setEmployees(employeeItems); setAssignments(merged); setSavedAssignments(JSON.stringify(merged));
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Не удалось загрузить участников"); });
    return () => { cancelled = true; };
  }, [call?.id, transcription?.revision]);

  const groups = useMemo(() => groupDraftWords(words, draft), [words, draft]);
  const changedIndexes = useMemo(() => draft.flatMap((word, index) => {
    const original = words[index];
    return original && (word.text !== original.text || word.speaker !== (original.speaker ?? "")) ? [index] : [];
  }), [draft, words]);
  const changed = new Set(changedIndexes);
  const participantsChanged = JSON.stringify(assignments) !== savedAssignments;
  const employeeIds = useMemo(() => new Set(employees.map((item) => item.user_uuid)), [employees]);
  // The editor comes first: marking their own voice is what tells whose work a
  // personal call shows, so speech and growth areas count for them.
  const people = useMemo(() => {
    const me = currentUser ? [{ id: currentUser.id, name: `${currentUser.full_name} ${currentUser.full_surname}`.trim(), label: `Это я · ${currentUser.full_name} ${currentUser.full_surname}`.trim() }] : [];
    const isMe = (id: string) => id === currentUser?.id;
    return [
      ...me,
      ...contacts.filter((contact) => !isMe(contact.id)).map((contact) => ({ id: contact.id, name: `${contact.full_name} ${contact.full_surname}`.trim(), label: `${contact.full_name} ${contact.full_surname} · ${contact.username}` })),
      ...employees.filter((item) => !isMe(item.user_uuid) && !contacts.some((contact) => contact.id === item.user_uuid)).map((item) => ({ id: item.user_uuid, name: item.full_name, label: `Сотрудник компании · ${item.full_name}` })),
    ];
  }, [contacts, currentUser, employees]);

  function updateWord(index: number, patch: Partial<DraftWord>) {
    setDraft((current) => current.map((word, wordIndex) => wordIndex === index ? { ...word, ...patch } : word));
  }

  function updateGroupSpeaker(startIndex: number, length: number, speaker: string) {
    setDraft((current) => current.map((word, index) => index >= startIndex && index < startIndex + length && !words[index]?.redaction ? { ...word, speaker } : word));
  }

  function addSpeaker() {
    if (assignments.length >= 32) {
      setError("Нельзя добавить больше 32 участников разговора.");
      return;
    }
    const speakerKey = nextSpeakerKey(assignments.map((item) => item.speaker_key));
    setAssignments((current) => [...current, { speaker_key: speakerKey, display_name: speakerLabel(speakerKey), role: "unknown" }]);
    setError("");
  }

  function requestRemoveSpeaker(speakerKey: string) {
    if (words.some(word => word.redaction && word.speaker === speakerKey)) {
      setError("Нельзя удалить спикера со скрытыми словами. Можно изменить его имя и роль.");
      return;
    }
    const hasWords = draft.some((word) => word.speaker === speakerKey);
    if (!hasWords) {
      setAssignments((current) => current.filter((item) => item.speaker_key !== speakerKey));
      return;
    }
    if (assignments.length === 1) {
      setError("Нельзя удалить единственного спикера с репликами. Сначала добавьте другого участника.");
      return;
    }
    setRemovingSpeaker(speakerKey);
    setError("");
  }

  function removeSpeaker(speakerKey: string, replacementKey: string) {
    if (!replacementKey || replacementKey === speakerKey) return;
    setDraft((current) => current.map((word, index) => word.speaker === speakerKey && !words[index]?.redaction ? { ...word, speaker: replacementKey } : word));
    setAssignments((current) => current.filter((item) => item.speaker_key !== speakerKey));
    setRemovingSpeaker(undefined);
  }

  function resetDraft() {
    setDraft(createDraft(words));
    if (savedAssignments) setAssignments(JSON.parse(savedAssignments) as TranscriptionSpeakerAssignment[]);
    setRemovingSpeaker(undefined);
    setError("");
  }

  function closePrivacyReview() { setPrivacyOperation(undefined); setMaskSelection([]); setPrivacyReason(""); setPrivacyPreview(undefined); }
  function selectMaskWord(index: number) { setMaskSelection((current) => current.length === 0 || current.length >= 2 ? [index] : [Math.min(current[0], index), Math.max(current[0], index)]); setPrivacyPreview(undefined); }
  function correctionRequest(): PrivacyCorrectionRequest | null {
    if (!transcription || !privacyOperation) return null;
    const request: PrivacyCorrectionRequest = { schema_version: 1, operation: privacyOperation, expected_revision: transcription.revision ?? 1, reason: privacyReason.trim() };
    if (privacyOperation === "add_mask") { if (maskSelection.length === 0) return null; request.word_start_index = maskSelection[0]; request.word_end_index = maskSelection.at(-1); request.entity_type = privacyEntity; }
    return request;
  }
  async function previewCorrection() { if (!call) return; const request = correctionRequest(); if (!request) return; setPrivacyBusy(true); setError(""); try { setPrivacyPreview(await api.previewPrivacyCorrection(call.id, request)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось проверить исправление маски"); } finally { setPrivacyBusy(false); } }
  async function applyCorrection() { if (!call) return; const request = correctionRequest(); if (!request) return; setPrivacyBusy(true); setError(""); try { await api.applyPrivacyCorrection(call.id, request); const updated = await api.getTranscription(call.id); closePrivacyReview(); onSaved(updated, true); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось исправить маску"); } finally { setPrivacyBusy(false); } }

  async function save() {
    if (!call || !transcription || (changedIndexes.length === 0 && !participantsChanged) || saving) return;
    const edits = changedIndexes.map((wordIndex) => ({
      word_index: wordIndex,
      text: draft[wordIndex].text,
      speaker: draft[wordIndex].speaker
    }));
    setSaving(true); setError("");
    try {
      let savedTranscription = transcription;
      if (edits.length > 0) {
        const result = await api.updateTranscription(call.id, { expected_revision: transcription.revision ?? 1, reason: "Исправление транскрипции", edits });
        savedTranscription = result.transcription;
      }
      if (participantsChanged) {
        const saved = await api.replaceTranscriptionSpeakerAssignments(call.id, assignments);
        setAssignments(saved);
        setSavedAssignments(JSON.stringify(saved));
      }
      onSaved(savedTranscription);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить исправления");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !transcription) return <div className="transcription-edit-page"><div className="transcription-edit-loading">Загружаю транскрипцию…</div></div>;
  if (!call || !transcription) return <div className="transcription-edit-page"><div className="empty-state">Транскрипция не найдена.</div></div>;
  if (!transcription.editable) return <div className="transcription-edit-page"><button className="ghost-button small" type="button" onClick={onBack}><ArrowLeft size={17} />К звонку</button><div className="empty-state">Эту транскрипцию нельзя редактировать{transcription.editability_reason ? `: ${transcription.editability_reason}` : "."}</div></div>;

  return <div className="transcription-edit-page">
    <header className="transcription-edit-header">
      <button className="ghost-button small" type="button" onClick={onBack}><ArrowLeft size={17} />К звонку</button>
      <div><span className="eyebrow">Редактор расшифровки</span><h1>Исправление транскрипции</h1><p>{call.title}</p></div>
      <div className="transcription-edit-revision"><span>Версия</span><strong>{transcription.revision ?? 1}</strong></div>
    </header>

    <section className="transcription-edit-guide">
      <div><strong>Редактируйте диалог, а не таблицу</strong><span>Исправьте слово прямо в реплике. Поле говорящего над репликой меняет его сразу для всех слов блока.</span></div>
      <div className="transcription-edit-counter"><Check size={17} /><strong>{changedIndexes.length}</strong><span>изменено</span></div>
    </section>

    {call.privacy?.protected && call.privacy.capabilities.can_review_redactions && <section className="transcription-privacy-review glass-panel">
      <header><div><ShieldCheck size={20} /><span><strong>Проверка маски</strong><small>Существующие маски нельзя изменить или снять. Можно скрыть дополнительные слова; это создаст новую версию.</small></span></div>{privacyOperation ? <button className="ghost-button small" type="button" onClick={closePrivacyReview}><X size={16} />Закрыть</button> : <button className="ghost-button small" type="button" onClick={() => setPrivacyOperation("add_mask")}>Добавить маску</button>}</header>
      {privacyOperation && <div className="transcription-privacy-form">
        <p>{maskSelection.length === 0 ? "Нажмите первое слово диапазона ниже." : maskSelection.length === 1 ? "Теперь нажмите последнее слово диапазона." : `Выбраны слова ${maskSelection[0] + 1}–${maskSelection[1] + 1}.`}</p>
        <label><span>Категория</span><SelectControl value={privacyEntity} onChange={(event) => { setPrivacyEntity(event.target.value as PrivacyEntityType); setPrivacyPreview(undefined); }}>{privacyCategoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectControl></label>
        <label><span>Причина (минимум 10 символов)</span><textarea value={privacyReason} onChange={(event) => { setPrivacyReason(event.target.value); setPrivacyPreview(undefined); }} placeholder="Почему нужно скрыть эти слова" /></label>
        <div className="transcription-privacy-actions"><button className="ghost-button small" type="button" disabled={privacyBusy || privacyReason.trim().length < 10 || !correctionRequest()} onClick={() => void previewCorrection()}><Eye size={16} />Предпросмотр</button><button className="primary-button small" type="button" disabled={privacyBusy || !privacyPreview} onClick={() => void applyCorrection()}>Сохранить маску</button></div>
        {privacyPreview && <div className="transcription-privacy-preview"><span>После добавления маски</span><p>{privacyPreview.after}</p><small>Текущий анализ будет помечен для повторного запуска.</small></div>}
      </div>}
    </section>}

    {error && <div className="form-error">{error}</div>}
    {words.length > 0 && <section className="transcription-participants">
      <div className="compare-section-heading"><div><span className="eyebrow">Участники разговора</span><h2>Роли и контакты</h2></div><button className="ghost-button small" type="button" onClick={addSpeaker}><Plus size={17} />Добавить спикера</button></div>
      <div className="transcription-participant-grid">
        {assignments.map((assignment) => {
          const color = speakerColor(assignment.speaker_key, assignments);
          return <article className="transcription-participant-card" style={{ "--speaker-color": color } as CSSProperties} key={assignment.speaker_key}>
            <div className="transcription-participant-title"><span /><div><small>Спикер</small><strong>{assignment.display_name || assignment.speaker_key}</strong></div><button className="transcription-participant-remove" type="button" aria-label={`Удалить спикера ${assignment.display_name || assignment.speaker_key}`} title="Удалить спикера" onClick={() => requestRemoveSpeaker(assignment.speaker_key)}><Trash2 size={17} /></button></div>
            <label><span>Отображаемое имя</span><input value={assignment.display_name} onChange={(event) => setAssignments((current) => current.map((item) => item.speaker_key === assignment.speaker_key ? { ...item, display_name: event.target.value } : item))} /></label>
            <label><span>Роль</span><SelectControl aria-label={`Роль спикера ${assignment.speaker_key}`} value={assignment.role} onChange={(event) => setAssignments((current) => current.map((item) => item.speaker_key === assignment.speaker_key ? { ...item, role: event.target.value as TranscriptionSpeakerRole, custom_role: event.target.value === "other" ? item.custom_role : undefined } : item))}><option value="unknown">Не определена</option><option value="client">Клиент</option><option value="manager">Менеджер</option><option value="operator">Оператор</option><option value="partner">Партнёр</option><option value="other">Другая</option></SelectControl></label>
            {assignment.role === "other" && <label><span>Название роли</span><input value={assignment.custom_role ?? ""} placeholder="Например, юрист" onChange={(event) => setAssignments((current) => current.map((item) => item.speaker_key === assignment.speaker_key ? { ...item, custom_role: event.target.value } : item))} /></label>}
            <label><span>Контакт</span><SelectControl aria-label={`Контакт спикера ${assignment.speaker_key}`} value={assignment.contact_user_uuid ?? ""} onChange={(event) => { const person = people.find((item) => item.id === event.target.value); setAssignments((current) => current.map((item) => item.speaker_key === assignment.speaker_key ? { ...item, contact_user_uuid: person?.id || undefined, display_name: person ? person.name : item.display_name } : item)); }}><option value="">Не привязан</option>{people.map((person) => <option value={person.id} key={person.id}>{person.label}</option>)}</SelectControl></label>
            {assignment.contact_user_uuid && assignment.contact_user_uuid === currentUser?.id && ["manager", "operator", "unknown"].includes(assignment.role) && <p className="speaker-access-warning">Это вы: речь этого спикера и зоны роста после следующего анализа попадут в ваш прогресс.</p>}
            {assignment.contact_user_uuid && assignment.contact_user_uuid !== currentUser?.id && employeeIds.has(assignment.contact_user_uuid) && ["manager", "operator", "unknown"].includes(assignment.role) && <p className="speaker-access-warning">Он получит доступ к звонку на чтение, а оценка попадёт в его показатели.</p>}
            {removingSpeaker === assignment.speaker_key && <div className="transcription-participant-transfer"><strong>Кому передать реплики?</strong><div>{assignments.filter((item) => item.speaker_key !== assignment.speaker_key).map((item) => <button type="button" key={item.speaker_key} onClick={() => removeSpeaker(assignment.speaker_key, item.speaker_key)}>{item.display_name || item.speaker_key}</button>)}</div><button className="ghost-button small" type="button" onClick={() => setRemovingSpeaker(undefined)}>Отмена</button></div>}
          </article>;
        })}
      </div>
    </section>}
    <main className="transcription-edit-dialogue">
      {groups.map((group) => <section className={`transcription-edit-utterance${group.words.some((_, offset) => changed.has(group.startIndex + offset)) ? " is-changed" : ""}`} key={group.startIndex} style={{ "--speaker-color": speakerColor(group.speaker || "unknown", assignments) } as CSSProperties}>
        <header>
          <label><span>Говорящий</span><SelectControl aria-label={`Говорящий в реплике ${group.startIndex + 1}`} value={group.speaker || "unknown"} onChange={(event) => updateGroupSpeaker(group.startIndex, group.words.length, event.target.value)}>{assignments.map((item) => <option value={item.speaker_key} key={item.speaker_key}>{item.display_name || speakerLabel(item.speaker_key)}</option>)}</SelectControl></label>
          <time>{formatSegmentTimeRange(group.words[0]?.start_seconds, group.words.at(-1)?.end_seconds)}</time>
        </header>
        <div className="transcription-edit-words">
          {group.words.map((word, offset) => {
            const index = group.startIndex + offset;
            const value = draft[index]?.text ?? word.text;
            return word.redaction ? <span className="transcription-redaction-chip" key={`${index}-${word.start_seconds}`}>{word.redaction.marker}</span> : privacyOperation === "add_mask" ? <button type="button" className={`transcription-mask-word${maskSelection.length > 0 && index >= maskSelection[0] && index <= (maskSelection.at(-1) ?? maskSelection[0]) ? " selected" : ""}`} key={`${index}-${word.start_seconds}`} onClick={() => selectMaskWord(index)}>{value}</button> : <input
              className={changed.has(index) ? "is-changed" : ""}
              aria-label={`Слово ${index + 1}`}
              value={value}
              size={Math.max(1, value.length)}
              key={`${index}-${word.start_seconds}`}
              onChange={(event) => updateWord(index, { text: event.target.value })}
            />;
          })}
        </div>
      </section>)}
    </main>

    <footer className="transcription-edit-dock">
      <div><strong>{changedIndexes.length === 0 && !participantsChanged ? "Изменений пока нет" : `Изменено слов: ${changedIndexes.length}${participantsChanged ? " · участники изменены" : ""}`}</strong><span>Текстовые исправления создадут новую версию в истории.</span></div>
      <div className="transcription-edit-dock-actions">
        <button className="ghost-button small" type="button" disabled={saving || (changedIndexes.length === 0 && !participantsChanged)} onClick={resetDraft}><RotateCcw size={16} />Сбросить</button>
        <button className="primary-button small" type="button" disabled={saving || (changedIndexes.length === 0 && !participantsChanged)} onClick={() => void save()}><Save size={16} />{saving ? "Сохраняю…" : "Сохранить исправления"}</button>
      </div>
    </footer>
  </div>;
}

const privacyCategoryOptions: Array<[PrivacyEntityType, string]> = [
  ["person_name", "Имя"], ["phone_number", "Телефон"], ["email_address", "Электронная почта"], ["address", "Адрес"], ["date_of_birth", "Дата рождения"], ["passport_number", "Номер паспорта"], ["drivers_license", "Водительское удостоверение"], ["account_number", "Номер счёта"], ["banking_information", "Банковские данные"], ["credit_card_number", "Номер карты"], ["credit_card_cvv", "Код карты"], ["credit_card_expiration", "Срок действия карты"], ["password", "Секрет"], ["ip_address", "Сетевой адрес"], ["username", "Имя пользователя"], ["medical_condition", "Медицинские данные"], ["money_amount", "Денежная сумма"], ["organization", "Организация"]
];

function createDraft(words: TranscriptionWordResponse[]): DraftWord[] {
  return words.map((word) => ({ text: word.text, speaker: word.speaker ?? "" }));
}

function nextSpeakerKey(existingKeys: string[]) {
  const used = new Set(existingKeys.map((key) => key.trim().toLocaleLowerCase("ru")));
  for (let code = 65; code <= 90; code += 1) {
    const candidate = String.fromCharCode(code);
    if (!used.has(candidate.toLocaleLowerCase("ru"))) return candidate;
  }
  let index = existingKeys.length + 1;
  while (used.has(`speaker_${index}`)) index += 1;
  return `speaker_${index}`;
}

function groupDraftWords(words: TranscriptionWordResponse[], draft: DraftWord[]) {
  const groups: Array<{ speaker: string; startIndex: number; words: TranscriptionWordResponse[] }> = [];
  words.forEach((word, index) => {
    const originalSpeaker = word.speaker ?? "";
    const current = groups.at(-1);
    const previousOriginalSpeaker = index > 0 ? words[index - 1].speaker ?? "" : undefined;
    if (current && previousOriginalSpeaker === originalSpeaker) current.words.push(word);
    else groups.push({ speaker: draft[index]?.speaker ?? originalSpeaker, startIndex: index, words: [word] });
  });
  return groups;
}

function speakerColor(speaker: string, assignments: TranscriptionSpeakerAssignment[]) {
  return colorOfSpeaker(speaker, assignments.map((item) => item.speaker_key));
}
