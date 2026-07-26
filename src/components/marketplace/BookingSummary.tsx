import { useTranslation } from "react-i18next";

/**
 * BookingSummary — DISPLAY ONLY.
 *
 * This component does not calculate prices, create quotes, lock prices,
 * create PaymentIntents, write bookings or infer provider earnings.
 * Pass `verifiedTotal` only when it originated from a server-issued quote
 * (via /book flow). Otherwise the placeholder wording is shown.
 */
export function BookingSummary({
  serviceLabel,
  when,
  where,
  verifiedTotal,
  currency,
}: {
  serviceLabel?: string;
  when?: string;
  where?: string;
  verifiedTotal?: number | null;
  currency?: string | null;
}) {
  const { t } = useTranslation("marketplace");
  return (
    <aside className="sticky top-24 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-5 shadow-[var(--mkt-shadow-soft)]">
      <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[hsl(var(--mkt-ink-soft))]">
        {t("summary.heading", "Booking summary")}
      </h3>
      <dl className="mt-4 space-y-3 text-[14px]">
        <Row label={t("summary.service", "Service")} value={serviceLabel} />
        <Row label={t("summary.when", "When")} value={when} />
        <Row label={t("summary.where", "Where")} value={where} />
      </dl>
      <div className="mt-5 border-t border-[hsl(var(--mkt-border))] pt-4">
        {verifiedTotal != null ? (
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] text-[hsl(var(--mkt-ink-muted))]">{t("summary.total", "Total")}</span>
            <span className="text-[18px] font-semibold text-[hsl(var(--mkt-ink))]">
              {verifiedTotal.toLocaleString(undefined, { style: "currency", currency: currency ?? "EUR" })}
            </span>
          </div>
        ) : (
          <p className="text-[13px] text-[hsl(var(--mkt-ink-muted))]">
            {t("summary.price_note", "Price calculated during booking based on your provider and service.")}
          </p>
        )}
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[hsl(var(--mkt-ink-soft))]">{label}</dt>
      <dd className="text-right text-[hsl(var(--mkt-ink))]">{value || <span className="text-[hsl(var(--mkt-ink-soft))]">—</span>}</dd>
    </div>
  );
}
