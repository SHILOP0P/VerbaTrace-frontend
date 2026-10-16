import { useEffect, useState } from "react";
import { api } from "../../api";
import type { AssistantExport } from "../../types";

export function AssistantExportLink({ initial, onError }: { initial: AssistantExport; onError: (error: unknown) => void }) {
  const [job, setJob] = useState(initial), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (["completed", "failed", "access_revoked"].includes(job.state)) return;
    let alive = true;
    let timer: number;
    async function poll() {
      try {
        const value = await api.getAssistantExport(job.id);
        if (!alive) return;
        setJob(value);
        if (!["completed", "failed", "access_revoked"].includes(value.state)) timer = window.setTimeout(() => void poll(), 1500);
      } catch (error) { if (alive) onError(error); }
    }
    timer = window.setTimeout(() => void poll(), 1500);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [job.id, job.state, onError]);
  async function download() { setBusy(true); try { const value = await api.downloadAssistantExport(job.id); const url = URL.createObjectURL(value); const link = document.createElement("a"); link.href = url; link.download = job.filename || "VerbaTrace"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (error) { onError(error); } finally { setBusy(false); } }
  if (job.state === "completed") return <button type="button" className="assistant-export-ready" disabled={busy} onClick={() => void download()}>Скачать {job.format === "md" ? "Markdown с изображениями" : job.format.toUpperCase()}</button>;
  if (job.state === "failed" || job.state === "access_revoked") return <p className="assistant-error" role="alert">Не удалось подготовить файл: {job.error_code ?? "нет доступа"}</p>;
  return <p className="assistant-progress"><span className="assistant-spinner"/>Подготовка и проверка файла…</p>;
}
