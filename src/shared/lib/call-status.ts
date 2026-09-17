import type {
AnalysisResponse,
CallStatus,
CallStatusEvent
} from "../../types";

export const statusMeta: Record<
  CallStatus,
  {
    label: string;
    chip: string;
    description: string;
  }
> = {
  new: { label: "Новый", chip: "Новый", description: "Файл загружен и принят" },
  processing: { label: "В обработке", chip: "В обработке", description: "Идет обработка аудио" },
  // Waiting for credits is not a failure and must never look like one: the call
  // is fine, there is simply no budget to process it yet.
  awaiting_credits: {
    label: "Ждёт кредитов",
    chip: "Ждёт кредитов",
    description: "Лимит кредитов исчерпан. Обработка начнётся, когда он обновится"
  },
  // Cancelled is a decision, not a breakdown. The recording is intact.
  cancelled: {
    label: "Обработка отменена",
    chip: "Отменён",
    description: "Обработка остановлена. Запись на месте, её можно обработать заново"
  },
  transcribed: { label: "Расшифрован", chip: "Расшифрован", description: "Текстовая расшифровка готова" },
  analyzed: { label: "Проанализирован", chip: "Анализ готов", description: "AI-анализ завершен" },
  failed: { label: "Ошибка", chip: "Ошибка", description: "Нужно проверить файл" }
};

export const normalTimelineSteps: CallStatus[] = ["new", "processing", "transcribed", "analyzed"];

// Statuses where the queue still owns the call. Deleting is refused here; the
// way out is to cancel the processing.
export function isCallBeingProcessed(status: CallStatus) {
  return status === "new" || status === "processing" || status === "awaiting_credits";
}

type AnalysisStatus = AnalysisResponse["status"] | undefined;

export function isCallStatus(value: unknown): value is CallStatus {
  return typeof value === "string" && value in statusMeta;
}

export function timelineFromStatus(status: CallStatus) {
  if (status === "failed") return [status];
  // Waiting and cancelling both happen before anything was produced, so the
  // timeline shows the call as accepted and stops there.
  if (status === "awaiting_credits" || status === "cancelled") return ["new"] as CallStatus[];

  const currentIndex = normalTimelineSteps.indexOf(status);
  if (currentIndex === -1) return ["new"] as CallStatus[];

  return normalTimelineSteps.slice(0, currentIndex + 1);
}

export function nextTimelineStatuses(previous: CallStatus[], status: CallStatus) {
  if (status === "failed") {
    const completedSteps = previous.filter((step) => step !== "failed" && step !== "analyzed");
    return [...completedSteps, "failed"] as CallStatus[];
  }

  return timelineFromStatus(status);
}

export function callStatusChip(status: CallStatus, analysisStatus?: AnalysisStatus) {
  if (status === "failed") return statusMeta.failed.chip;
  if (status === "awaiting_credits" || status === "cancelled") return statusMeta[status].chip;
  if (analysisStatus === "failed") return "Ошибка анализа";
  if (status === "new") return "В очереди";
  if (status === "processing") return "Транскрибируется";
  if (status === "transcribed") return "Анализируется";
  if (status === "analyzed" && analysisStatus !== undefined && analysisStatus !== "done") return "Анализируется";
  return statusMeta[status].chip;
}

export function callStatusTone(status: CallStatus, analysisStatus?: AnalysisStatus) {
  if (status === "failed" || analysisStatus === "failed") return "bad";
  if (
    status === "new" ||
    status === "processing" ||
    status === "awaiting_credits" ||
    status === "cancelled" ||
    status === "transcribed" ||
    (status === "analyzed" && analysisStatus !== undefined && analysisStatus !== "done")
  ) return "warn";
  return "ok";
}

export function activeCallProcess(status: CallStatus, analysisStatus?: AnalysisStatus) {
  if (status === "processing") return "transcription";
  if (status === "transcribed" && analysisStatus !== "done" && analysisStatus !== "failed") return "analysis";
  if (status === "analyzed" && (analysisStatus === "pending" || analysisStatus === "processing")) return "analysis";
  return null;
}

export function parseCallStatusEvent(event: Event): CallStatusEvent | null {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") return null;

  try {
    const payload = JSON.parse(event.data) as Partial<CallStatusEvent>;
    if (
      typeof payload.call_id !== "string" ||
      !isCallStatus(payload.status) ||
      typeof payload.terminal !== "boolean" ||
      typeof payload.timestamp !== "string"
    ) {
      return null;
    }

    return {
      call_id: payload.call_id,
      status: payload.status,
      terminal: payload.terminal,
      timestamp: payload.timestamp
    };
  } catch {
    return null;
  }
}
