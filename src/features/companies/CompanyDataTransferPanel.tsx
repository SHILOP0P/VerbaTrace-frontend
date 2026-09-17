import { ArrowRightLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { CompanyDataTransfer, CompanyResponse } from "../../types";
import { formatDate } from "../../shared/lib/formatters";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import { SelectControl } from "../../shared/ui/primitives";

/**
 * CompanyDataTransferPanel moves calls and instruction folders out of one of the
 * owner's companies into another.
 *
 * It exists because the lifecycle deletes companies on its own: a freeze runs
 * out, a soft deletion runs out, and the data goes. Offering to move the data
 * first only means something if there is a way to do it.
 *
 * The move is deliberately explicit rather than automatic at freeze time: two
 * companies have different departments, people and privacy policies, and a
 * silent merge would hand the wrong people access to recordings.
 */
export function CompanyDataTransferPanel({
  companies,
  sourceCompanyId,
}: {
  /** The companies this person owns — both ends have to be one of them. */
  companies: CompanyResponse[];
  sourceCompanyId: string;
}) {
  const others = companies.filter((company) => company.id !== sourceCompanyId);
  const [targetId, setTargetId] = useState(others[0]?.id ?? "");
  const [includeCalls, setIncludeCalls] = useState(true);
  const [includeFolders, setIncludeFolders] = useState(true);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [history, setHistory] = useState<CompanyDataTransfer[]>([]);

  const reload = useCallback(async () => {
    try {
      const response = await api.listCompanyDataTransfers(10);
      setHistory(response.items);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!others.some((company) => company.id === targetId)) {
      setTargetId(others[0]?.id ?? "");
    }
  }, [others, targetId]);

  const companyName = (id: string) =>
    companies.find((company) => company.id === id)?.name ?? "Компания";

  async function transfer() {
    if (!targetId) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api.transferCompanyData({
        sourceCompanyId,
        targetCompanyId: targetId,
        includeCalls,
        includeFolders,
        reason: reason.trim(),
      });
      setConfirmOpen(false);
      setReason("");
      setSuccess(
        `Перенесено: звонков — ${result.calls}, папок с инструкциями — ${result.folders}.`,
      );
      await reload();
    } catch (transferError) {
      setConfirmOpen(false);
      setError(
        transferError instanceof Error
          ? transferError.message
          : "Не удалось перенести данные",
      );
    } finally {
      setBusy(false);
    }
  }

  if (others.length === 0) return null;

  return (
    <section className="company-list-panel glass-panel">
      <div className="panel-heading large">
        <div>
          <h2>Перенос данных</h2>
          <p>
            Перенесите звонки и папки с инструкциями в другую свою компанию, пока эта
            не удалена окончательно.
          </p>
        </div>
      </div>

      <div className="data-transfer-form">
        <label>
          Куда переносим
          <SelectControl
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {others.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </SelectControl>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={includeCalls}
            onChange={(event) => setIncludeCalls(event.target.checked)}
          />
          <span>Звонки с транскриптами, анализами, оценками и действиями</span>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={includeFolders}
            onChange={(event) => setIncludeFolders(event.target.checked)}
          />
          <span>Папки с инструкциями</span>
        </label>
        <label>
          Причина, по желанию
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Закрываем старую компанию"
          />
        </label>
        <div className="panel-actions">
          <button
            className="primary-button small"
            type="button"
            disabled={busy || !targetId || (!includeCalls && !includeFolders)}
            onClick={() => setConfirmOpen(true)}
          >
            <ArrowRightLeft size={16} />
            {busy ? "Переношу..." : "Перенести"}
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
        {success && <div className="form-success">{success}</div>}
      </div>

      {history.length > 0 && (
        <div className="company-mini-list">
          <h3>Что уже переносили</h3>
          {history.map((item) => (
            <article className="company-mini-card" key={item.id}>
              <div>
                <strong>
                  {companyName(item.source_company_uuid)} →{" "}
                  {companyName(item.target_company_uuid)}
                </strong>
                <small>
                  Звонков: {item.calls} · папок: {item.folders} ·{" "}
                  {formatDate(item.created_at)}
                  {item.reason ? ` · ${item.reason}` : ""}
                </small>
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Перенести данные?"
        message={`Выбранные данные перейдут в компанию «${companyName(targetId)}». Отдел у перенесённых звонков и папок будет снят, потому что в новой компании его нет, — доступ к ним получат владелец и заместитель. Автор звонка останется прежним, но доступ у него сохранится только если он работает в новой компании.`}
        confirmLabel="Перенести"
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void transfer()}
      />
    </section>
  );
}
