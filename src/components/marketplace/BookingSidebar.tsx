import { useTranslation } from "react-i18next";
import { MapPin, Sparkles, Calendar, Repeat, ShieldCheck, Lock, Star, Headphones } from "lucide-react";

/**
 * BookingSidebar — DISPLAY ONLY.
 * Static placeholder sidebar that mirrors the reference "Your booking"
 * summary + "Why choose MyCleaner" panel. Does not compute prices, quotes
 * or PaymentIntents; the authoritative booking flow lives in /book.
 */
export function BookingSidebar() {
  const { t } = useTranslation("marketplace");

  return (
    <aside className="flex flex-col gap-4">
      {/* Your booking */}
      <div className="rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-5 shadow-[var(--mkt-shadow-soft)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15.5px] font-semibold text-[hsl(var(--mkt-ink))]">
            {t("sidebar.your_booking", "Your booking")}
          </h3>
          <span className="text-[12.5px] font-semibold text-[hsl(var(--mkt-ink-soft))]">
            {t("sidebar.edit", "Edit")}
          </span>
        </div>

        <SummaryRow
          icon={<MapPin className="h-4 w-4" />}
          value={t("sidebar.address_placeholder", "Add your address")}
        />
        <Divider />
        <SummaryRow
          icon={<Sparkles className="h-4 w-4" />}
          value={t("sidebar.service_placeholder", "Choose a service")}
          hint={t("sidebar.service_hint", "2 hours")}
        />
        <Divider />
        <SummaryRow
          icon={<Calendar className="h-4 w-4" />}
          value={t("sidebar.datetime_placeholder", "Pick date & time")}
        />
        <Divider />
        <SummaryRow
          icon={<Repeat className="h-4 w-4" />}
          value={t("sidebar.frequency", "Frequency")}
          hint={t("sidebar.frequency_default", "One-time")}
        />

        <div className="mt-5 rounded-xl border border-dashed border-[hsl(var(--mkt-border-strong))] bg-[hsl(var(--mkt-surface-muted))] p-4 text-center">
          <p className="text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">
            {t("sidebar.price_note", "Price is calculated during booking based on your provider and service.")}
          </p>
        </div>

        <button
          type="button"
          disabled
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[hsl(var(--mkt-brand))] px-4 py-3 text-[14px] font-semibold text-[hsl(var(--mkt-brand-on))] opacity-60"
        >
          {t("sidebar.continue", "Continue")}
        </button>
        <p className="mt-2 text-center text-[11.5px] text-[hsl(var(--mkt-ink-soft))]">
          🔒 {t("sidebar.no_charge", "You won't be charged yet")}
        </p>
      </div>

      {/* Why choose */}
      <div className="rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-5 shadow-[var(--mkt-shadow-soft)]">
        <h3 className="text-[15.5px] font-semibold text-[hsl(var(--mkt-ink))]">
          {t("sidebar.why_heading", "Why choose MyCleaner?")}
        </h3>
        <ul className="mt-3 space-y-2.5 text-[13.5px] text-[hsl(var(--mkt-ink))]">
          <WhyItem icon={<ShieldCheck className="h-4 w-4 text-[hsl(var(--mkt-success))]" />} label={t("sidebar.why_verified", "Identity-verified cleaners")} />
          <WhyItem icon={<Lock className="h-4 w-4 text-[hsl(var(--mkt-success))]" />} label={t("sidebar.why_payments", "Secure online payments")} />
          <WhyItem icon={<Star className="h-4 w-4 text-[hsl(var(--mkt-success))]" />} label={t("sidebar.why_reviews", "Rated by real customers")} />
          <WhyItem icon={<Headphones className="h-4 w-4 text-[hsl(var(--mkt-success))]" />} label={t("sidebar.why_support", "Human customer support")} />
        </ul>
      </div>
    </aside>
  );
}

function SummaryRow({ icon, value, hint }: { icon: React.ReactNode; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="flex items-center gap-2 text-[13.5px] text-[hsl(var(--mkt-ink))]">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]">
          {icon}
        </span>
        {value}
      </span>
      {hint && <span className="text-[12.5px] text-[hsl(var(--mkt-ink-soft))]">{hint}</span>}
    </div>
  );
}

function Divider() {
  return <div className="my-2 h-px bg-[hsl(var(--mkt-border))]" />;
}

function WhyItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2.5">
      {icon}
      <span>{label}</span>
    </li>
  );
}
