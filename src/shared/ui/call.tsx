import {
  Check,
  ChevronRight,
  CloudUpload,
  FileText,
  RefreshCw,
  X
} from "lucide-react";
import type {
  AnalysisResponse,
  CallStatus,
  MediaSeekTarget,
  TranscriptionResponse,
  TranscriptionSpeakerAssignment,
  TranscriptionWordResponse
} from "../../types";
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, Ref } from "react";
import { splitRedactedWord, wordNeedsLeadingSpace } from "../lib/transcript";
import { maskProfanity } from "../lib/display-text";

import {
  activeCallProcess,
  callStatusChip,
  callStatusTone,
  normalTimelineSteps,
  statusMeta,
  timelineFromStatus
} from "../lib/call-status";
import { formatSegmentTimeRange, transcriptionSpeakerLabel } from "../lib/formatters";
import { TextBlockSkeleton } from "./loading";

type StatusTone = "ok" | "warn" | "bad";

export function StatusChip({
  status,
  analysisStatus,
  label,
  transcriptionOnly = false
}: {
  status: CallStatus;
  analysisStatus?: AnalysisResponse["status"];
  label?: string;
  transcriptionOnly?: boolean;
}) {
  const transcriptReady = transcriptionOnly && status === "transcribed" && !analysisStatus;
  return <span className={`status-chip ${transcriptReady ? "ok" : callStatusTone(status, analysisStatus)}`}>{label ?? (transcriptReady ? "Транскрипция готова" : callStatusChip(status, analysisStatus))}</span>;
}

export function StatusTimeline({
  current,
  statuses,
  analysisStatus,
  transcriptionOnly = false
}: {
  transcriptionOnly?: boolean;
  current: CallStatus;
  statuses?: CallStatus[];
  analysisStatus?: AnalysisResponse["status"];
}) {
  const steps = visibleTimelineSteps(current, statuses).filter((step) => !transcriptionOnly || step !== "analyzed");
  const currentIndex = steps.indexOf(current);

  return (
    <div
      className="status-timeline"
      style={{ "--timeline-steps": steps.length } as React.CSSProperties}
    >
      {steps.map((step, index) => (
        <div
          className={`timeline-step ${timelineStepClass(step, index, current, currentIndex, analysisStatus)}`}
          key={step}
        >
          <span>
            {step === "new" && <CloudUpload size={19} />}
            {step === "processing" && <RefreshCw size={19} />}
            {step === "transcribed" && <FileText size={19} />}
            {step === "analyzed" && <Check size={19} />}
            {step === "failed" && <X size={19} />}
          </span>
          <strong>{transcriptionOnly && step === "transcribed" ? "Транскрипция готова" : timelineStepLabel(step)}</strong>
          <small>{transcriptionOnly && step === "transcribed" && current === "transcribed" ? "Транскрипция готова" : timelineStepCaption(step, index, current, currentIndex, analysisStatus)}</small>
        </div>
      ))}
    </div>
  );
}

function visibleTimelineSteps(current: CallStatus, statuses?: CallStatus[]) {
  if (current !== "failed") return normalTimelineSteps;
  if (!statuses?.length) return timelineFromStatus(current);

  const currentIndex = statuses.indexOf(current);
  if (currentIndex >= 0) return statuses.slice(0, currentIndex + 1);

  return timelineFromStatus(current);
}

function timelineStepClass(
  step: CallStatus,
  index: number,
  current: CallStatus,
  currentIndex: number,
  analysisStatus?: AnalysisResponse["status"]
) {
  const activeProcess = activeCallProcess(current, analysisStatus);

  if (step === "failed") return "danger";
  if (analysisStatus === "failed" && step === "analyzed") return "danger current";
  if (activeProcess === "transcription" && step === "processing") return "processing current";
  if (activeProcess === "analysis" && step === "analyzed") return "processing current";
  if (isTimelineStepReady(step, current, index, currentIndex, analysisStatus)) return "ready";
  return "";
}

function timelineStepCaption(
  step: CallStatus,
  index: number,
  current: CallStatus,
  currentIndex: number,
  analysisStatus?: AnalysisResponse["status"]
) {
  const activeProcess = activeCallProcess(current, analysisStatus);

  if (step === "failed") return "ошибка";
  if (analysisStatus === "failed" && step === "analyzed") return "ошибка анализа";
  if (activeProcess === "transcription" && step === "processing") return "Транскрибируется";
  if (activeProcess === "analysis" && step === "analyzed") return "Анализируется";
  if (step === "new" && current === "new") return "В очереди";
  if (activeProcess && isTimelineStepReady(step, current, index, currentIndex, analysisStatus)) return "";
  if (isTimelineStepReady(step, current, index, currentIndex, analysisStatus)) return "готово";
  return "";
}

function timelineStepLabel(step: CallStatus) {
  if (step === "new") return "Загрузка";
  if (step === "processing") return "Транскрибация";
  if (step === "transcribed") return "Подготовка анализа";
  if (step === "analyzed") return "Анализ";
  return statusMeta[step].label;
}

function isTimelineStepReady(
  step: CallStatus,
  current: CallStatus,
  index: number,
  currentIndex: number,
  analysisStatus?: AnalysisResponse["status"]
) {
  if (step === "new" && current !== "failed") return true;
  if (step === "processing") return current === "transcribed" || current === "analyzed" || analysisStatus === "done";
  if (step === "transcribed") return current === "transcribed" || current === "analyzed" || analysisStatus === "done";
  if (step === "analyzed") return current === "analyzed" || analysisStatus === "done";
  return index <= currentIndex || currentIndex === -1;
}

export function InfoCard({
  title,
  status,
  statusTone = "ok",
  statusThinking = false,
  action,
  children,
  onAction,
  actionVariant = "link",
  expanded = false,
  cardRef,
  className = "",
  style
}: {
  title: string;
  status: string;
  statusTone?: StatusTone;
  statusThinking?: boolean;
  action?: string;
  children: React.ReactNode;
  onAction?: () => void;
  actionVariant?: "link" | "analysis";
  expanded?: boolean;
  cardRef?: Ref<HTMLDivElement>;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`info-card ${className}`.trim()} ref={cardRef} style={style}>
      <div className="card-title">
        <h3>{title}</h3>
        <span className={`status-chip ${statusTone} ${statusThinking ? "thinking-status" : ""}`}>{status}</span>
      </div>
      {children}
      {action && (actionVariant === "analysis" ? (
        <button
          className={`analysis-toggle-button ${expanded ? "expanded" : ""}`}
          type="button"
          aria-expanded={expanded}
          onClick={onAction}
        >
          <span>{action}</span>
          <span className="analysis-toggle-icon">
            <ChevronRight size={18} />
          </span>
        </button>
      ) : (
        <button className="text-link" type="button" onClick={onAction}>
          {action}
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}

export function TranscriptPreview({
  transcription,
  expanded,
  loading,
  activeWordIndex = -1,
  selectedEvidence,
  speakerAssignments = [],
  onOverflowChange
}: {
  transcription?: TranscriptionResponse;
  expanded: boolean;
  loading?: boolean;
  activeWordIndex?: number;
  selectedEvidence?: MediaSeekTarget | null;
  speakerAssignments?: TranscriptionSpeakerAssignment[];
  onOverflowChange?: (overflowing: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef(new Map<number, HTMLSpanElement>());
  const pendingEvidenceScrollRef = useRef(false);
  const words = useMemo(() => validTranscriptWords(transcription?.words), [transcription?.words]);
  const wordGroups = useMemo(() => groupTranscriptWords(words), [words]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || loading) {
      onOverflowChange?.(false);
      return;
    }
    const measure = () => onOverflowChange?.(container.scrollHeight > 169);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [loading, onOverflowChange, transcription, wordGroups]);

  function scrollToWord(index: number) {
    if (index < 0) return;
    const word = wordRefs.current.get(index);
    if (!word) return;
    const scrollContainer = nearestScrollContainer(word);
    if (!scrollContainer) return;
    const containerRect = scrollContainer.getBoundingClientRect();
    const wordRect = word.getBoundingClientRect();
    const relativeWordTop = scrollContainer === document.scrollingElement
      ? wordRect.top
      : wordRect.top - containerRect.top;
    const targetScrollTop = scrollContainer.scrollTop
      + relativeWordTop
      - (scrollContainer.clientHeight - wordRect.height) / 2;
    scrollContainer.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: reducedMotion() ? "auto" : "smooth"
    });
  }

  useEffect(() => {
    if (selectedEvidence?.wordStartIndex === undefined) return;
    pendingEvidenceScrollRef.current = true;
    scrollToWord(selectedEvidence.wordStartIndex);
  }, [selectedEvidence]);

  useEffect(() => {
    if (pendingEvidenceScrollRef.current) {
      const targetStart = selectedEvidence?.wordStartIndex;
      const targetEnd = selectedEvidence?.wordEndIndex ?? targetStart;
      if (targetStart !== undefined && targetEnd !== undefined && activeWordIndex >= targetStart && activeWordIndex <= targetEnd) {
        pendingEvidenceScrollRef.current = false;
      } else {
        return;
      }
    }
  }, [activeWordIndex, selectedEvidence]);

  if (loading) {
    return <TextBlockSkeleton rows={4} />;
  }

  if (words.length > 0) {
    return (
      <div className="transcript-word-shell">
        <div
          ref={containerRef}
          className={`transcript-preview word-synced expandable-content ${expanded ? "expanded" : "collapsed"}`}
        >
          {wordGroups.some((group) => group.speaker) ? wordGroups.map((group) => (
            <div className="transcript-segment word-segment" key={`${group.startIndex}-${group.speaker}`}>
              <div className="segment-meta">
                <strong>{transcriptionSpeakerLabel(group.speaker, speakerAssignments)}</strong>
                <span>{formatSegmentTimeRange(group.words[0]?.start_seconds, group.words.at(-1)?.end_seconds)}</span>
              </div>
              <p>{group.words.map((word, offset) => renderWord(word, group.startIndex + offset, offset === 0))}</p>
            </div>
          )) : <p>{words.map((word, index) => renderWord(word, index, index === 0))}</p>}
        </div>
      </div>
    );
  }

  function renderWord(word: TranscriptionWordResponse, index: number, firstInBlock: boolean) {
    return <TranscriptWord
      key={`${index}-${word.start_seconds}`}
      word={word}
      index={index}
      firstInBlock={firstInBlock}
      active={index === activeWordIndex}
      selected={isSelectedEvidenceWord(index, selectedEvidence)}
      selectedStart={index === selectedEvidence?.wordStartIndex}
      selectedEnd={index === selectedEvidence?.wordEndIndex}
      setRef={(element) => { if (element) wordRefs.current.set(index, element); else wordRefs.current.delete(index); }}
    />;
  }

  const segments = transcriptionSegments(transcription);

  if (segments.length > 0) {
    return (
      <div ref={containerRef} className={`transcript-preview segmented expandable-content ${expanded ? "expanded" : "collapsed"}`}>
        {segments.map((segment, index) => (
          <div className="transcript-segment" key={`${segment.start_seconds ?? index}-${segment.text}`}>
            <div className="segment-meta">
              <strong>{transcriptionSpeakerLabel(segment.speaker, speakerAssignments)}</strong>
              <span>{formatSegmentTimeRange(segment.start_seconds, segment.end_seconds)}</span>
            </div>
            <p>{segment.text}</p>
          </div>
        ))}
      </div>
    );
  }

  if (!transcription?.text) {
    return <p className="muted">Расшифровка появится после обработки звонка.</p>;
  }

  return (
    <div ref={containerRef} className={`transcript-preview fallback expandable-content ${expanded ? "expanded" : "collapsed"}`}>
      {transcription.text
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line, index) => (
          <p key={`${line}-${index}`}>{line}</p>
        ))}
    </div>
  );
}

const TranscriptWord = memo(function TranscriptWord({ word, index, firstInBlock, active, selected, selectedStart, selectedEnd, setRef }: {
  word: TranscriptionWordResponse;
  index: number;
  firstInBlock: boolean;
  active: boolean;
  selected: boolean;
  selectedStart: boolean;
  selectedEnd: boolean;
  setRef: (element: HTMLSpanElement | null) => void;
}) {
  const redaction = splitRedactedWord(word.text, word.redaction?.marker);
  return <>
    {!firstInBlock && wordNeedsLeadingSpace(word.text, index) ? " " : ""}
    <span
      ref={setRef}
      className={`transcript-word ${word.redaction ? "is-redacted" : ""} ${active ? "active" : ""} ${selected ? "evidence-selected" : ""} ${selectedStart ? "evidence-start" : ""} ${selectedEnd ? "evidence-end" : ""}`}
      title={word.redaction ? `${word.redaction.label}: значение скрыто` : undefined}
      data-word-index={index}
    >
      {redaction ? <>
        {redaction.before}
        <span className="transcript-redaction-marker">
          {redaction.marker.split("_").map((part, partIndex, parts) => <Fragment key={partIndex}>
            {part}{partIndex < parts.length - 1 ? <>_<wbr /></> : null}
          </Fragment>)}
        </span>
        {redaction.after}
      </> : maskProfanity(word.text)}
    </span>
  </>;
});

function groupTranscriptWords(words: TranscriptionWordResponse[]) {
  return words.reduce<Array<{ speaker: string; startIndex: number; words: TranscriptionWordResponse[] }>>((groups, word, index) => {
    const speaker = word.speaker?.trim() ?? "";
    const current = groups.at(-1);
    if (!current || current.speaker !== speaker) groups.push({ speaker, startIndex: index, words: [word] });
    else current.words.push(word);
    return groups;
  }, []);
}

function validTranscriptWords(words?: TranscriptionWordResponse[]) {
  if (!Array.isArray(words)) return [];
  return words.filter((word) => word && word.text?.length > 0 && Number.isFinite(word.start_seconds) && Number.isFinite(word.end_seconds));
}

function isSelectedEvidenceWord(index: number, target?: MediaSeekTarget | null) {
  return target?.wordStartIndex !== undefined && target.wordEndIndex !== undefined && index >= target.wordStartIndex && index <= target.wordEndIndex;
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function nearestScrollContainer(element: HTMLElement) {
  let parent = element.parentElement;
  while (parent) {
    const overflowY = window.getComputedStyle(parent).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

export function transcriptionSegments(transcription?: TranscriptionResponse) {
  const segments = transcription?.segments;
  if (!Array.isArray(segments)) return [];

  const nonEmptySegments = segments.filter((segment) => segment.text.trim().length > 0);

  // A continuous transcript must not be presented as a diarized dialogue.
  // This also keeps old Start transcriptions readable after the tariff rule
  // changed: no speaker label means no segment metadata at all.
  if (nonEmptySegments.some((segment) => !segment.speaker?.trim())) return [];

  return nonEmptySegments;
}
