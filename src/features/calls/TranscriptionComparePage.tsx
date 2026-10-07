import { cssClass } from "../../shared/lib/css-styles";
import { ArrowLeft, Check, ChevronDown, GitCompareArrows, Plus, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";
import { api } from "../../api";
import type {
  CallResponse,
  TranscriptionRevisionContent,
  TranscriptionRevisionSummary,
  TranscriptionSpeakerAssignment,
  TranscriptionWordResponse
} from "../../types";
import { formatDate, transcriptionSpeakerLabel } from "../../shared/lib/formatters";

const VERSION_COLORS = ["#ff8058", "#66a8ff", "#b58cff", "#57c7a1", "#e6b85c"];
const MAX_COMPARED_VERSIONS = VERSION_COLORS.length;

type LoadedVersions = Record<number, TranscriptionRevisionContent>;
type CompareLane = number;
type DropTarget =
  | { kind: "lane"; lane: CompareLane; index: number }
  | { kind: "column"; index: number; lane: CompareLane; placement: "before" | "after" };
type WordChange = {
  kind: "speaker" | "replace" | "add" | "remove" | "speaker-and-replace";
  startIndex: number;
  endIndex: number;
  startSeconds?: number;
  endSeconds?: number;
  before: string;
  after: string;
  speakerBefore: string;
  speakerAfter: string;
};

export function TranscriptionComparePage({
  call,
  initialRevision,
  onBack
}: {
  call?: CallResponse;
  initialRevision?: number;
  onBack: () => void;
}) {
  const [revisions, setRevisions] = useState<TranscriptionRevisionSummary[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [contents, setContents] = useState<LoadedVersions>({});
  const [versionColors, setVersionColors] = useState<Record<number, string>>({});
  const [versionLanes, setVersionLanes] = useState<Record<number, CompareLane>>({});
  const [draggingRevision, setDraggingRevision] = useState<number | null>(null);
  const [dropTarget, setDropTargetState] = useState<DropTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [speakerAssignments, setSpeakerAssignments] = useState<TranscriptionSpeakerAssignment[]>([]);
  const selectedKey = selected.join(",");
  const laneKey = selected.map((revision) => `${revision}:${versionLanes[revision] ?? 0}`).join(",");
  const addVersionRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef(new Map<number, HTMLElement>());
  const cardRefs = useRef(new Map<number, HTMLElement>());
  const boardRef = useRef<HTMLElement>(null);
  const draggingRevisionRef = useRef<number | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);

  useEffect(() => {
    if (!call) return;
    let cancelled = false;
    setLoading(true); setError(""); setContents({});
    void api.listTranscriptionRevisions(call.id, 100, 0).then(async (history) => {
      if (cancelled) return;
      const ordered = [...history.items].sort((a, b) => a.revision - b.revision);
      setRevisions(ordered);
      const current = ordered.find((item) => item.is_current)?.revision ?? ordered.at(-1)?.revision;
      const queryVersions = (new URLSearchParams(window.location.search).get("versions") ?? "")
        .split(",").map(Number).filter((revision) => Number.isInteger(revision) && ordered.some((item) => item.revision === revision));
      const requested = ordered.some((item) => item.revision === initialRevision) ? initialRevision : undefined;
      const previous = [...ordered].reverse().find((item) => item.revision !== (requested ?? current))?.revision;
      const fallback = Array.from(new Set([requested, previous, current].filter((value): value is number => value !== undefined))).sort((a, b) => a - b);
      const initial = (queryVersions.length >= 2 ? Array.from(new Set(queryVersions)) : fallback).slice(0, MAX_COMPARED_VERSIONS);
      setSelected(initial);
      setVersionColors(Object.fromEntries(initial.map((revision, index) => [revision, VERSION_COLORS[index]])));
      const savedLayout = new Map((new URLSearchParams(window.location.search).get("layout") ?? "").split(",").map((item) => item.split(":").map(Number)).filter(([revision, lane]) => initial.includes(revision) && Number.isInteger(lane) && lane >= 0 && lane < MAX_COMPARED_VERSIONS) as Array<[number, CompareLane]>);
      const savedLaneIds = Array.from(new Set(savedLayout.values())).sort((a, b) => a - b);
      const hasCompleteSavedLayout = initial.every((revision) => savedLayout.has(revision));
      setVersionLanes(Object.fromEntries(initial.map((revision, index) => {
        const savedLane = hasCompleteSavedLayout ? savedLayout.get(revision) : undefined;
        return [revision, savedLane === undefined ? defaultLane(index, initial.length) : savedLaneIds.indexOf(savedLane)];
      })));
      const loaded = await Promise.all(initial.map((revision) => api.getTranscriptionRevision(call.id, revision)));
      if (!cancelled) setContents(Object.fromEntries(loaded.map((content) => [content.revision, content])));
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Не удалось загрузить версии транскрипции");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [call?.id, initialRevision]);

  useEffect(() => {
    if (!call) { setSpeakerAssignments([]); return; }
    let cancelled = false;
    void api.listTranscriptionSpeakerAssignments(call.id)
      .then((items) => { if (!cancelled) setSpeakerAssignments(items); })
      .catch(() => { if (!cancelled) setSpeakerAssignments([]); });
    return () => { cancelled = true; };
  }, [call?.id]);

  useEffect(() => {
    if (!call || selected.length === 0) return;
    const query = new URLSearchParams(window.location.search);
    query.set("call", call.id);
    query.set("versions", selected.join(","));
    query.set("layout", selected.map((revision) => `${revision}:${versionLanes[revision] ?? 0}`).join(","));
    query.delete("version");
    window.history.replaceState({}, "", `/app/calls/transcription-compare?${query}`);
  }, [call?.id, selectedKey, laneKey]);

  useEffect(() => {
    if (!adding) return;
    function closeOnPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !addVersionRef.current?.contains(event.target)) setAdding(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAdding(false);
        addVersionRef.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [adding]);

  useEffect(() => {
    if (draggingRevision === null) return;
    const move = (event: PointerEvent) => {
      const target = targetAtPoint(event.clientX, event.clientY);
      if (target) setDropTarget(target);
    };
    const end = (event: PointerEvent) => {
      const revision = draggingRevisionRef.current;
      if (revision === null) return;
      const target = targetAtPoint(event.clientX, event.clientY) ?? dropTargetRef.current;
      if (target) finishDrop(revision, target);
      else cancelDrag();
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
    return () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", end, true);
      document.removeEventListener("pointercancel", end, true);
    };
  }, [draggingRevision, selectedKey, laneKey]);

  async function addVersion(revision: number) {
    if (!call || selected.includes(revision) || selected.length >= MAX_COMPARED_VERSIONS) return;
    setError("");
    try {
      const content = contents[revision] ?? await api.getTranscriptionRevision(call.id, revision);
      setContents((current) => ({ ...current, [revision]: content }));
      const usedColors = new Set(selected.map((item) => versionColors[item]));
      setVersionColors((current) => ({ ...current, [revision]: VERSION_COLORS.find((color) => !usedColors.has(color)) ?? VERSION_COLORS[0] }));
      const laneIds = activeLaneIds(selected, versionLanes);
      const lane = laneIds.reduce((least, candidate) => countLane(selected, versionLanes, candidate) < countLane(selected, versionLanes, least) ? candidate : least, laneIds[0] ?? 0);
      updateSelectedWithAnimation([...selected, revision], { ...versionLanes, [revision]: lane });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось добавить версию");
    }
  }

  async function toggleVersion(revision: number) {
    if (selected.includes(revision)) {
      if (selected.length <= 2) return;
      updateSelectedWithAnimation(selected.filter((item) => item !== revision));
      return;
    }
    await addVersion(revision);
  }

  function updateSelectedWithAnimation(next: number[], nextLanes = versionLanes) {
    const laneIds = Array.from(new Set(next.map((revision) => nextLanes[revision] ?? 0))).sort((a, b) => a - b);
    const normalizedLanes = Object.fromEntries(next.map((revision) => [revision, Math.max(0, laneIds.indexOf(nextLanes[revision] ?? 0))]));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      flushSync(() => { setSelected(next); setVersionLanes(normalizedLanes); });
      return;
    }
    const chipRects = new Map([...chipRefs.current].map(([revision, element]) => [revision, element.getBoundingClientRect()]));
    const cardRects = new Map([...cardRefs.current].map(([revision, element]) => [revision, element.getBoundingClientRect()]));
    flushSync(() => { setSelected(next); setVersionLanes(normalizedLanes); });
    animateMovedVersions(chipRefs.current, chipRects);
    animateMovedVersions(cardRefs.current, cardRects);
  }

  function setDropTarget(target: DropTarget | null) {
    const current = dropTargetRef.current;
    const unchanged = current === target || (current !== null && target !== null && current.kind === target.kind && (current.kind === "lane"
      ? target.kind === "lane" && current.lane === target.lane && current.index === target.index
      : target.kind === "column" && current.index === target.index && current.lane === target.lane && current.placement === target.placement));
    if (unchanged) return;
    dropTargetRef.current = target;
    setDropTargetState(target);
  }

  function targetFromCoordinates(clientX: number, clientY: number, laneElement: HTMLElement, lane: CompareLane): DropTarget {
    const dragged = draggingRevisionRef.current;
    const source = dragged === null ? lane : versionLanes[dragged] ?? 0;
    const rect = laneElement.getBoundingClientRect();
    const horizontal = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1)));
    const boardLaneCount = laneElement.parentElement?.querySelectorAll(":scope > .compare-version-lane").length ?? 1;
    if (boardLaneCount === 1 && selected.length === 2 && (horizontal < .18 || horizontal > .82)) {
      const before = horizontal < .18;
      return { kind: "column", index: before ? 0 : 1, lane, placement: before ? "before" : "after" };
    }
    if (lane !== source && (horizontal < .22 || horizontal > .78)) {
      const before = horizontal < .22;
      return { kind: "column", index: lane + (before ? 0 : 1), lane, placement: before ? "before" : "after" };
    }
    const cards = [...laneElement.querySelectorAll<HTMLElement>(".compare-version-card:not(.is-dragging)")];
    const found = cards.findIndex((card) => clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2);
    return { kind: "lane", lane, index: found < 0 ? cards.length : found };
  }

  function targetFromPointer(event: DragEvent<HTMLDivElement>, lane: CompareLane) {
    return targetFromCoordinates(event.clientX, event.clientY, event.currentTarget, lane);
  }

  function updateDropTarget(event: DragEvent<HTMLDivElement>, lane: CompareLane) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(targetFromPointer(event, lane));
  }

  function cancelDrag() {
    draggingRevisionRef.current = null;
    setDraggingRevision(null);
    setDropTarget(null);
  }

  function finishDrop(revision: number, target: DropTarget) {
    const layout = moveVersion(selected, versionLanes, revision, target);
    if (layout.order.join("\0") !== selected.join("\0") || layout.order.some((item) => (layout.lanes[item] ?? 0) !== (versionLanes[item] ?? 0))) {
      updateSelectedWithAnimation(layout.order, layout.lanes);
    }
    cancelDrag();
  }

  function dropVersion(event: DragEvent<HTMLDivElement>, lane: CompareLane) {
    event.preventDefault();
    event.stopPropagation();
    const revision = draggingRevisionRef.current;
    if (revision === null) return;
    finishDrop(revision, targetFromPointer(event, lane));
  }

  function dropAsNewColumn(event: DragEvent<HTMLDivElement>, requestedIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    const revision = draggingRevisionRef.current;
    if (revision === null) return;
    const lane = Math.max(0, Math.min(requestedIndex, activeLaneIds(selected, versionLanes).length - 1));
    finishDrop(revision, { kind: "column", index: requestedIndex, lane, placement: requestedIndex <= lane ? "before" : "after" });
  }

  function targetAtPoint(clientX: number, clientY: number) {
    const board = boardRef.current;
    if (!board) return null;
    const laneElements = [...board.querySelectorAll<HTMLElement>(":scope > .compare-version-lane")];
    const hit = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>(".compare-version-lane");
    let lane = hit ? laneElements.indexOf(hit) : -1;
    if (lane < 0) lane = laneElements.reduce((best, element, index) => {
      const rect = element.getBoundingClientRect();
      const distance = Math.max(rect.left - clientX, 0, clientX - rect.right) + Math.max(rect.top - clientY, 0, clientY - rect.bottom);
      return distance < best.distance ? { index, distance } : best;
    }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
    return laneElements[lane] ? targetFromCoordinates(clientX, clientY, laneElements[lane], lane) : null;
  }

  function startPointerDrag(event: ReactPointerEvent<HTMLElement>, revision: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRevisionRef.current = revision;
    setDraggingRevision(revision);
    setDropTarget(null);
  }

  function movePointerDrag(event: ReactPointerEvent<HTMLElement>) {
    if (draggingRevisionRef.current === null) return;
    event.preventDefault();
    setDropTarget(targetAtPoint(event.clientX, event.clientY));
  }

  function endPointerDrag(event: ReactPointerEvent<HTMLElement>) {
    const revision = draggingRevisionRef.current;
    if (revision === null) return;
    event.preventDefault();
    const target = targetAtPoint(event.clientX, event.clientY) ?? dropTargetRef.current;
    if (target) finishDrop(revision, target);
    else cancelDrag();
  }

  function versionColor(revision: number) {
    return versionColors[revision] ?? VERSION_COLORS[0];
  }

  const selectedVersions = selected.map((revision) => ({
    summary: revisions.find((item) => item.revision === revision),
    content: contents[revision]
  })).filter((item): item is { summary: TranscriptionRevisionSummary; content: TranscriptionRevisionContent } => Boolean(item.summary && item.content));

  const changes = selectedVersions.slice(1).map((version, index) => ({
    from: selectedVersions[index],
    to: version,
    ranges: compareWords(selectedVersions[index].content.words, version.content.words)
  }));
  const laneIds = activeLaneIds(selected, versionLanes);
  const lanes = laneIds.map((lane) => selectedVersions.filter((version) => (versionLanes[version.content.revision] ?? 0) === lane));

  if (!call) return <div className="transcription-compare-page"><div className="empty-state">Звонок не найден.</div></div>;

  return <div className="transcription-compare-page">
    <header className="transcription-compare-header">
      <button type="button" className="ghost-button small" onClick={onBack}><ArrowLeft size={17} />К звонку</button>
      <div><span className="eyebrow">История расшифровки</span><h1>Сравнение версий</h1><p>{call.title}</p></div>
      <div className="compare-version-count"><GitCompareArrows size={18} /><strong>{selected.length}</strong><span>версии</span></div>
    </header>

    {error && <div className="form-error">{error}</div>}
    {loading ? <div className="transcription-compare-loading">Загружаю версии…</div> : <>
      <section className="compare-selection-panel" aria-label="Выбранные версии">
        <div className="compare-selected-versions">
          {selected.map((revision) => <span ref={(element) => { if (element) chipRefs.current.set(revision, element); else chipRefs.current.delete(revision); }} className={["compare-version-chip", cssClass({ "--version-color": versionColor(revision) } as CSSProperties)].filter(Boolean).join(" ")}  key={revision}>
            <i />Версия {revision}
            {selected.length > 2 && <button type="button" aria-label={`Убрать версию ${revision}`} onClick={() => updateSelectedWithAnimation(selected.filter((item) => item !== revision))}><X size={14} /></button>}
          </span>)}
        </div>
        <div className="compare-add-version" ref={addVersionRef}>
          <button type="button" className="ghost-button small" aria-expanded={adding} onClick={() => setAdding((current) => !current)}><Plus size={16} />Добавить версию<ChevronDown size={15} /></button>
          {adding && <div className="compare-version-menu">
            {revisions.map((revision) => {
              const isSelected = selected.includes(revision.revision);
              const cannotRemove = isSelected && selected.length <= 2;
              return <button type="button" key={revision.id} className={isSelected ? "selected" : ""} aria-pressed={isSelected} disabled={(!isSelected && selected.length >= MAX_COMPARED_VERSIONS) || cannotRemove} title={cannotRemove ? "Для сравнения нужны минимум две версии" : undefined} onClick={() => void toggleVersion(revision.revision)}>
              <span><strong>Версия {revision.revision}</strong><small>{formatDate(revision.created_at)}</small></span>
              {isSelected && (cannotRemove ? <Check size={16} /> : <X size={16} />)}
            </button>;})}
          </div>}
        </div>
      </section>

      <section ref={boardRef} className={[`compare-version-board${lanes.length === 1 ? " is-single" : lanes.length === 2 ? " is-pair" : ""}`, cssClass({ "--compare-column-count": lanes.length } as CSSProperties)].filter(Boolean).join(" ")} >
        {lanes.map((versions, laneIndex) => <div className={`compare-version-lane${dropTarget?.lane === laneIndex ? " is-drop-target" : ""}${dropTarget?.kind === "column" && dropTarget.lane === laneIndex ? ` is-column-${dropTarget.placement}` : ""}`} key={laneIndex} onDragOver={(event) => updateDropTarget(event, laneIndex as CompareLane)} onDrop={(event) => dropVersion(event, laneIndex as CompareLane)}>
          {draggingRevision !== null && selected.length > 2 && lanes.length < selected.length && <div
            className={`compare-column-drop-zone is-before${dropTarget?.kind === "column" && dropTarget.index === laneIndex ? " is-active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
              setDropTarget({ kind: "column", index: laneIndex, lane: laneIndex, placement: "before" });
            }}
            onDrop={(event) => dropAsNewColumn(event, laneIndex)}
          />}
          {draggingRevision !== null && selected.length > 2 && lanes.length < selected.length && laneIndex === lanes.length - 1 && <div
            className={`compare-column-drop-zone is-after${dropTarget?.kind === "column" && dropTarget.index === lanes.length ? " is-active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
              setDropTarget({ kind: "column", index: lanes.length, lane: laneIndex, placement: "after" });
            }}
            onDrop={(event) => dropAsNewColumn(event, lanes.length)}
          />}
          {versions.map((version, lanePosition) => {
            const globalIndex = selectedVersions.findIndex((item) => item.content.revision === version.content.revision);
            const referenceWords = globalIndex > 0
              ? selectedVersions[globalIndex - 1].content.words
              : selectedVersions[globalIndex + 1]?.content.words ?? [];
            return <Fragment key={version.content.revision}>
              {dropTarget?.kind === "lane" && dropTarget.lane === laneIndex && dropTarget.index === lanePosition && <div className="compare-drop-marker" />}
              <article data-revision={version.content.revision} ref={(element) => { if (element) cardRefs.current.set(version.content.revision, element); else cardRefs.current.delete(version.content.revision); }} className={[`compare-version-card${draggingRevision === version.content.revision ? " is-dragging" : ""}`, cssClass({ "--version-color": versionColor(version.content.revision) } as CSSProperties)].filter(Boolean).join(" ")} >
                <header onPointerDown={(event) => startPointerDrag(event, version.content.revision)} onPointerMove={movePointerDrag} onPointerUp={endPointerDrag} onPointerCancel={endPointerDrag}><div><span className="version-dot" /><strong>Версия {version.content.revision}</strong>{version.summary.is_current && <em>Текущая</em>}</div><time>{formatDate(version.summary.created_at)}</time></header>
                <VersionTranscript words={version.content.words} referenceWords={referenceWords} speakerAssignments={speakerAssignments} />
              </article>
            </Fragment>;
          })}
          {dropTarget?.kind === "lane" && dropTarget.lane === laneIndex && dropTarget.index === versions.length && <div className="compare-drop-marker" />}
          {versions.length === 0 && <div className="compare-empty-lane">Перетащите версию сюда</div>}
        </div>)}
      </section>

      <section className="compare-change-log">
        <div className="compare-section-heading"><div><span className="eyebrow">Хронология</span><h2>Что и где изменилось</h2></div><small>Каждая версия сравнивается с предыдущей выбранной</small></div>
        {changes.length === 0 ? <div className="empty-state compact">Добавьте ещё одну версию для сравнения.</div> : changes.map((change) => <article className={["compare-change-step", cssClass({ "--version-color": versionColor(change.to.content.revision) } as CSSProperties)].filter(Boolean).join(" ")}  key={change.to.content.revision}>
          <header><span className="version-dot" /><div><strong>Версия {change.from.content.revision} → {change.to.content.revision}</strong><time>{formatDate(change.to.summary.created_at)}</time></div><b>{change.ranges.length} {change.ranges.length === 1 ? "изменение" : "изменений"}</b></header>
          {change.ranges.length === 0 ? <p className="compare-no-changes">Текст и говорящие совпадают.</p> : <div className="compare-change-ranges">
            {change.ranges.map((range) => <div className={`compare-change-range is-${range.kind}`} key={`${range.startIndex}-${range.endIndex}`}>
              <div className="change-location"><strong>{changeKindLabel(range)}</strong><span>{formatRange(range.startSeconds, range.endSeconds)}</span></div>
              {(range.speakerBefore || range.speakerAfter) && range.speakerBefore !== range.speakerAfter && <div className="change-speaker">Говорящий: <del>{transcriptionSpeakerLabel(range.speakerBefore, speakerAssignments)}</del><span>→</span><ins>{transcriptionSpeakerLabel(range.speakerAfter, speakerAssignments)}</ins></div>}
              {range.kind !== "speaker" && <div className="change-text"><del>{range.before || "—"}</del><ins>{range.after || "—"}</ins></div>}
            </div>)}
          </div>}
        </article>)}
      </section>
    </>}
  </div>;
}

function VersionTranscript({ words, referenceWords, speakerAssignments }: { words: TranscriptionWordResponse[]; referenceWords: TranscriptionWordResponse[]; speakerAssignments: TranscriptionSpeakerAssignment[] }) {
  const diarized = words.some((word) => Boolean(word.speaker?.trim()));
  const groups = groupBySpeaker(words);
  const renderWord = (word: TranscriptionWordResponse, index: number) => {
    const reference = referenceWords[index];
    const changed = Boolean(reference) && (reference.text !== word.text || (reference.speaker ?? "") !== (word.speaker ?? ""));
    return <span className={changed ? "compare-word changed" : "compare-word"} title={changed ? "Изменено относительно соседней выбранной версии" : undefined} key={`${word.start_seconds}-${index}`}>{word.text}{" "}</span>;
  };
  if (!diarized) return <div className="compare-transcript-plain">{words.map(renderWord)}</div>;
  return <div className="compare-speaker-groups">{groups.map((group) => <section className="compare-speaker-group" key={`${group.speaker}-${group.startIndex}`}><header><strong>{transcriptionSpeakerLabel(group.speaker, speakerAssignments)}</strong><time>{formatRange(group.words[0]?.start_seconds, group.words.at(-1)?.end_seconds)}</time></header><p>{group.words.map((word, offset) => renderWord(word, group.startIndex + offset))}</p></section>)}</div>;
}

function groupBySpeaker(words: TranscriptionWordResponse[]) {
  const groups: Array<{ speaker: string; startIndex: number; words: TranscriptionWordResponse[] }> = [];
  words.forEach((word, index) => {
    const speaker = word.speaker?.trim() ?? "";
    const current = groups.at(-1);
    if (!current || current.speaker !== speaker) groups.push({ speaker, startIndex: index, words: [word] });
    else current.words.push(word);
  });
  return groups;
}

function compareWords(before: TranscriptionWordResponse[], after: TranscriptionWordResponse[]): WordChange[] {
  const changed: number[] = [];
  const length = Math.max(before.length, after.length);
  for (let index = 0; index < length; index += 1) {
    const left = before[index]; const right = after[index];
    if (!left || !right || left.text !== right.text || (left.speaker ?? "") !== (right.speaker ?? "")) changed.push(index);
  }
  const ranges: WordChange[] = [];
  for (const index of changed) {
    const kind = wordChangeKind(before[index], after[index]);
    const last = ranges.at(-1);
    if (last && last.kind === kind && index === last.endIndex + 1) {
      last.endIndex = index;
      last.endSeconds = after[index]?.end_seconds ?? before[index]?.end_seconds;
      last.before = before.slice(last.startIndex, index + 1).map((word) => word.text).join(" ");
      last.after = after.slice(last.startIndex, index + 1).map((word) => word.text).join(" ");
      if (last.speakerBefore !== (before[index]?.speaker ?? "")) last.speakerBefore = "";
      if (last.speakerAfter !== (after[index]?.speaker ?? "")) last.speakerAfter = "";
      continue;
    }
    ranges.push({ kind, startIndex: index, endIndex: index, startSeconds: after[index]?.start_seconds ?? before[index]?.start_seconds, endSeconds: after[index]?.end_seconds ?? before[index]?.end_seconds, before: before[index]?.text ?? "", after: after[index]?.text ?? "", speakerBefore: before[index]?.speaker ?? "", speakerAfter: after[index]?.speaker ?? "" });
  }
  return ranges;
}

function wordChangeKind(before?: TranscriptionWordResponse, after?: TranscriptionWordResponse): WordChange["kind"] {
  if (!before) return "add";
  if (!after) return "remove";
  const textChanged = before.text !== after.text;
  const speakerChanged = (before.speaker ?? "") !== (after.speaker ?? "");
  if (speakerChanged && textChanged) return "speaker-and-replace";
  if (speakerChanged) return "speaker";
  return "replace";
}

function changeKindLabel(change: WordChange) {
  switch (change.kind) {
    case "speaker": return "Смена говорящего";
    case "add": return "Добавление слов";
    case "remove": return "Удаление слов";
    case "speaker-and-replace": return "Замена слов и смена говорящего";
    default: return "Замена слов";
  }
}

function formatRange(start?: number, end?: number) {
  const stamp = (seconds?: number) => seconds === undefined ? "" : `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
  const left = stamp(start); const right = stamp(end);
  return left && right ? `${left}–${right}` : left || right || "Без таймкода";
}

function defaultLane(index: number, total: number): CompareLane {
  return total <= 2 ? index : index % 2;
}

function activeLaneIds(selected: number[], lanes: Record<number, CompareLane>) {
  const populated = Array.from(new Set(selected.map((revision) => lanes[revision] ?? 0))).sort((a, b) => a - b);
  return populated.length ? populated : [0];
}

function countLane(selected: number[], lanes: Record<number, CompareLane>, lane: CompareLane) {
  return selected.filter((revision) => (lanes[revision] ?? 0) === lane).length;
}

function moveVersion(selected: number[], lanes: Record<number, CompareLane>, dragged: number, target: DropTarget) {
  const groups = activeLaneIds(selected, lanes).map((lane) => selected.filter((revision) => (lanes[revision] ?? 0) === lane));
  const sourceIndex = groups.findIndex((group) => group.includes(dragged));
  if (sourceIndex < 0) return { order: selected, lanes };
  groups[sourceIndex] = groups[sourceIndex].filter((revision) => revision !== dragged);
  if (target.kind === "column") {
    let insertion = Math.max(0, Math.min(target.index, groups.length));
    if (groups[sourceIndex].length === 0) {
      groups.splice(sourceIndex, 1);
      if (sourceIndex < insertion) insertion -= 1;
    }
    groups.splice(Math.max(0, Math.min(insertion, groups.length)), 0, [dragged]);
  } else {
    const destination = Math.max(0, Math.min(target.lane, groups.length - 1));
    groups[destination].splice(Math.max(0, Math.min(target.index, groups[destination].length)), 0, dragged);
  }
  const populated = groups.filter((group) => group.length > 0);
  const normalized: Record<number, CompareLane> = {};
  populated.forEach((group, lane) => group.forEach((revision) => { normalized[revision] = lane; }));
  return { order: populated.flat(), lanes: normalized };
}

function animateMovedVersions<Key>(elements: Map<Key, HTMLElement>, before: Map<Key, DOMRect>) {
  elements.forEach((element, key) => {
    const first = before.get(key);
    if (!first || !element.isConnected) return;
    element.getAnimations().forEach((animation) => animation.cancel());
    const last = element.getBoundingClientRect();
    const deltaX = first.left - last.left;
    const deltaY = first.top - last.top;
    const scaleX = last.width > 0 ? first.width / last.width : 1;
    const scaleY = last.height > 0 ? first.height / last.height : 1;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1 && Math.abs(scaleX - 1) < .005 && Math.abs(scaleY - 1) < .005) return;
    element.animate(
      [
        { transformOrigin: "top left", transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})` },
        { transformOrigin: "top left", transform: "translate(0, 0) scale(1, 1)" },
      ],
      { duration: 480, easing: "cubic-bezier(.22,1,.36,1)" },
    );
  });
}
