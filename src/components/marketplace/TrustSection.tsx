import { useTranslation } from "react-i18next";
import { ShieldCheck, Lock, Star, Headphones } from "lucide-react";

/**
 * Trust section — only claims we can substantiate today.
 * Do NOT add background checks / insurance / satisfaction guarantees /
 * 24/7 support here unless those are operationally supported and legally
 * approved.
 */
const ITEMS = [
  { key: "identity", icon: ShieldCheck },
  { key: "payments", icon: Lock },
  { key: "reviews",  icon: Star },
  { key: "support",  icon: Headphones },
] as const;

export function TrustSection() {
  const { t } = useTranslation("marketplace");
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-14 lg:px-8">
      <div className="rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-8 shadow-[var(--mkt-shadow-soft)] sm:p-10">
        <h2 className="font-serif text-[26px] tracking-[-0.02em] text-[hsl(var(--mkt-ink))] sm:text-[32px]">
          {t("trust.heading", "Why customers choose MyCleaner")}
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(({ key, icon: Icon }) => (
            <div key={key} className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]">
                <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">{t(`trust.${key}.title`, key)}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">{t(`trust.${key}.body`, "")}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
