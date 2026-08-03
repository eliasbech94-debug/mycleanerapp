import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, MapPin, Calendar as CalendarIcon, Sparkles } from "lucide-react";

/**
 * Search submission contract (must NOT diverge across surfaces).
 * Destination: /marketplace
 * Accepted params:
 *   - q?:        free-text location (city/postcode) — optional
 *   - category?: one of cleaning|handyman|garden|moving — optional
 *   - date?:     YYYY-MM-DD — optional hint, not authoritative
 *   - time?:     HH:MM — optional hint, not authoritative
 * Only `q` and `category` are consumed by Marketplace.tsx today; date/time
 * are carried forward for BookingEntry/BookingFlow when a provider is chosen.
 * No new URL contract is introduced.
 */
/**
 * Cleaning-only: MyCleaner is a cleaning marketplace. The `Service`
 * selector lists cleaning subcategories (mirroring ServiceCategoryGrid)
 * and never exposes handyman/garden/moving — those are not supported
 * services on the platform today.
 */
const SUBCATEGORIES = ["regular", "deep", "move", "office", "custom"] as const;

export function CleanerSearchBar({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation("marketplace");
  const navigate = useNavigate();
  const [where, setWhere] = useState("");
  const [date, setDate] = useState("");
  const [sub, setSub] = useState<(typeof SUBCATEGORIES)[number]>("regular");

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (where.trim()) params.set("q", where.trim());
    params.set("category", "cleaning");
    if (sub) params.set("sub", sub);
    if (date) params.set("date", date);
    const qs = params.toString();
    navigate(`/marketplace${qs ? `?${qs}` : ""}`);
  }

  return (
    <form
      onSubmit={submit}
      className={`grid w-full grid-cols-1 gap-1 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-1 shadow-[var(--mkt-shadow-lift)] transition focus-within:border-[hsl(var(--mkt-brand))] focus-within:shadow-[0_0_0_3px_hsl(var(--mkt-brand)/0.14),var(--mkt-shadow-lift)] sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1.2fr_auto] ${compact ? "" : ""}`}
      aria-label={t("search.aria", "Find cleaner")}
    >
      <Field label={t("search.where", "Where")} icon={<MapPin className="h-4 w-4" />}>
        <input
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          placeholder={t("search.where_placeholder", "City or postcode")}
          className="w-full min-w-0 bg-transparent text-[15px] text-[hsl(var(--mkt-ink))] placeholder:text-[hsl(var(--mkt-ink-soft))] focus:outline-none"
          aria-label={t("search.where", "Where")}
        />
      </Field>
      <Field label={t("search.when", "When")} icon={<CalendarIcon className="h-4 w-4" />}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full min-w-0 bg-transparent text-[15px] text-[hsl(var(--mkt-ink))] focus:outline-none"
          aria-label={t("search.when", "When")}
        />
      </Field>
      <Field label={t("search.service", "Service")} icon={<Sparkles className="h-4 w-4" />}>
        <select
          value={sub}
          onChange={(e) => setSub(e.target.value as (typeof SUBCATEGORIES)[number])}
          className="w-full min-w-0 appearance-none bg-transparent text-[15px] text-[hsl(var(--mkt-ink))] focus:outline-none"
          aria-label={t("search.service", "Service")}
        >
          {SUBCATEGORIES.map((c) => (
            <option key={c} value={c}>{t(`categories.tiles.${c}`, c)}</option>
          ))}
        </select>
      </Field>
      <button
        type="submit"
        className="mt-1 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--mkt-brand))] px-6 py-4 text-[15px] active:scale-[0.99] motion-reduce:active:scale-100 sm:col-span-2 lg:col-span-1 lg:mt-0 lg:w-auto lg:text-[14px] font-semibold text-[hsl(var(--mkt-brand-on))] transition hover:bg-[hsl(var(--mkt-brand-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))] focus-visible:ring-offset-2"
      >
        <Search className="h-4 w-4" strokeWidth={2.5} />
        {t("search.submit", "Find cleaner")}
      </button>
    </form>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="group flex min-h-[56px] min-w-0 cursor-text flex-col justify-center gap-0.5 rounded-xl px-4 py-2.5 transition hover:bg-[hsl(var(--mkt-surface-muted))] focus-within:bg-[hsl(var(--mkt-surface-muted))]">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--mkt-ink-soft))]">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-[hsl(var(--mkt-ink-muted))]">
        {icon}
        {children}
      </span>
    </label>
  );
}
