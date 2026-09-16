import { UserRoundCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { CompanyOwnershipTransfer, CompanyResponse } from "../../types";
import { formatDate } from "../../shared/lib/formatters";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";

/**
 * OwnershipOffersPanel shows companies whose owner asked this user to take over.
 * Ownership only moves after an explicit yes, so the offer lives here until it
 * is answered or expires.
 */
export function OwnershipOffersPanel({
  companies,
  onOwnershipAccepted,
}: {
  companies: CompanyResponse[];
  onOwnershipAccepted: () => void;
}) {
  const [offers, setOffers] = useState<CompanyOwnershipTransfer[]>([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<CompanyOwnershipTransfer | null>(null);

  const reload = useCallback(async () => {
    try {
      const response = await api.listIncomingOwnershipTransfers();
      setOffers(response.items);
    } catch {
      setOffers([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function decide(offer: CompanyOwnershipTransfer, accept: boolean) {
    setBusyId(offer.id);
    setError("");
    try {
      await api.decideCompanyOwnership(offer.id, accept);
      setPending(null);
      await reload();
      if (accept) onOwnershipAccepted();
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : "Не удалось ответить на предложение");
    } finally {
      setBusyId("");
    }
  }

  if (offers.length === 0) return null;

  const companyName = (id: string) => companies.find((company) => company.id === id)?.name ?? "Компания";

  return (
    <section className="company-list-panel glass-panel">
      <div className="panel-heading large">
        <div>
          <h2>Передача компании</h2>
          <p>Владелец предлагает вам стать владельцем компании.</p>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="company-mini-list">
        {offers.map((offer) => (
          <article className="company-mini-card" key={offer.id}>
            <div>
              <strong>{companyName(offer.company_uuid)}</strong>
              <small>Предложение действует до {formatDate(offer.expires_at)}</small>
            </div>
            <div className="panel-actions">
              <button
                className="primary-button small"
                type="button"
                disabled={busyId === offer.id}
                onClick={() => setPending(offer)}
              >
                <UserRoundCog size={16} />
                Принять
              </button>
              <button
                className="ghost-button small"
                type="button"
                disabled={busyId === offer.id}
                onClick={() => void decide(offer, false)}
              >
                Отклонить
              </button>
            </div>
          </article>
        ))}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title="Стать владельцем компании?"
        message={`Вы станете владельцем компании «${pending ? companyName(pending.company_uuid) : ""}». Подписка и лимиты перейдут вместе с компанией, а прежний владелец останется заместителем.`}
        confirmLabel="Принять компанию"
        busy={Boolean(busyId)}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && void decide(pending, true)}
      />
    </section>
  );
}
