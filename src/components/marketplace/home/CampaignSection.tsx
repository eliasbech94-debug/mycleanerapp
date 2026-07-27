import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";

/**
 * CampaignSection — CMS-driven country/campaign banner. Copy resolves via
 * the Localization + Country engines; when there's no active headline the
 * section renders nothing so the Campaign Engine can decide visibility
 * without ever shipping an empty ribbon.
 *
 * Mobile (<md) renders a premium, invitation-styled Founding Cleaner card.
 * Desktop (md+) keeps the previous banner untouched.
 */
export function CampaignSection() {
  const { t } = useTranslation("marketplace");
  const title = t("campaign.title", { defaultValue: "" });
  if (!title) return null;
  const body = t("campaign.body", { defaultValue: "" });
  const note = t("campaign.note", { defaultValue: "" });
  const cta = t("campaign.cta", { defaultValue: "Læs mere" });
  const href = t("campaign.href", { defaultValue: "/founding-cleaner" });

  // Mobile card copy (short, invitation style).
  const badgePrimary = t("campaign.badgePrimary", { defaultValue: "FOUNDING CLEANER" });
  const badgeSecondary = t("campaign.badgeSecondary", { defaultValue: "FIRST 500" });
  const edition = t("campaign.edition", { defaultValue: "2026 EDITION" });
  const amount = t("campaign.amount", { defaultValue: "0" });
  const amountSuffix1 = t("campaign.amountSuffix1", { defaultValue: "in platform fees" });
  const amountSuffix2 = t("campaign.amountSuffix2", { defaultValue: "for 3 months" });
  const explain = t("campaign.explain", { defaultValue: body });
  const noteShort = t("campaign.noteShort", { defaultValue: note });
  const ctaShort = t("campaign.ctaShort", { defaultValue: cta });

  return (
    <section
      className="mx-auto max-w-[1400px] px-6 pt-6 pb-8 md:px-5 md:py-14 md:pb-14 lg:px-8"
      aria-labelledby="campaign-title"
    >
      {/* -------------------------- MOBILE CARD (<md) -------------------------- */}
      <Link
        to={href}
        aria-label={`${badgePrimary} — ${amount} ${amountSuffix1} ${amountSuffix2}`}
        data-testid="founding-cleaner-card-mobile"
        className="group relative block overflow-hidden rounded-[28px] border border-white/10 shadow-[0_20px_60px_-20px_rgba(6,20,50,0.55)] outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--mkt-bg))] md:hidden"
        style={{
          backgroundImage:
            "radial-gradient(120% 80% at 85% -10%, rgba(122,90,248,0.35) 0%, rgba(122,90,248,0) 55%), radial-gradient(120% 90% at -10% 110%, rgba(45,212,191,0.32) 0%, rgba(45,212,191,0) 55%), linear-gradient(160deg, #0b1e4a 0%, #0d2a63 45%, #0a1b3f 100%)",
        }}
      >
        {/* Decorative sparkles / halo — aria-hidden, pointer-events off */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0 opacity-[0.09]"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
          <div className="absolute left-1/2 top-[46%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/15 blur-3xl" />
          <Sparkles className="absolute right-6 top-16 h-3.5 w-3.5 text-white/70" />
          <Sparkles className="absolute left-10 bottom-14 h-3 w-3 text-white/50" />
          <Sparkles className="absolute right-16 bottom-24 h-2.5 w-2.5 text-white/40" />
        </div>

        <div className="relative flex flex-col gap-4 p-7 text-white">
          {/* Top row: badges */}
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] backdrop-blur">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {badgePrimary}
            </span>
            <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#0b1e4a] shadow-sm">
              {badgeSecondary}
            </span>
          </div>

          {/* Primary focus: 0 KR. */}
          <h2 id="campaign-title" className="mt-1">
            <span className="block text-[64px] font-black leading-[0.95] tracking-[-0.04em] text-white drop-shadow-[0_4px_20px_rgba(255,255,255,0.15)]">
              {amount}
            </span>
            <span className="mt-1.5 block text-[15px] font-semibold leading-tight text-white/95">
              {amountSuffix1}
            </span>
            <span className="block text-[13.5px] font-medium leading-tight text-white/75">
              {amountSuffix2}
            </span>
          </h2>

          {/* Explanation */}
          <p className="text-[13px] leading-[1.5] text-white/85">{explain}</p>

          {/* Note */}
          {noteShort && (
            <p className="text-[11.5px] leading-snug text-white/65">{noteShort}</p>
          )}

          {/* CTA row */}
          <div className="mt-1 flex items-center justify-between gap-3">
            <span
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0b1e4a] shadow-[0_6px_18px_-6px_rgba(0,0,0,0.35)] transition-transform group-active:translate-y-[1px] motion-reduce:transition-none"
            >
              {ctaShort}
              <span
                aria-hidden="true"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0b1e4a] text-white transition-transform group-active:translate-x-0.5 motion-reduce:transition-none"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </span>
            <span
              aria-hidden="true"
              className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55"
            >
              {edition}
            </span>
          </div>
        </div>
      </Link>

      {/* -------------------------- DESKTOP BANNER (md+) ----------------------- */}
      <div className="relative hidden overflow-hidden rounded-3xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-brand))] text-[hsl(var(--mkt-brand-on))] shadow-[var(--mkt-shadow-lift)] md:block md:rounded-[28px]">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[hsl(var(--mkt-accent))]/40 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-4 p-6 sm:p-10 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--mkt-brand-on))]/15 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.14em]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("campaign.eyebrow", "Kampagne")}
            </span>
            <h2 className="mt-3 font-serif text-[20px] leading-tight tracking-[-0.02em] sm:text-[34px]">
              {title}
            </h2>
            {body && <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed opacity-90">{body}</p>}
            {note && <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed opacity-80">{note}</p>}
          </div>
          <Link
            to={href}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-[hsl(var(--mkt-brand-on))] px-5 py-3 text-[14px] font-semibold text-[hsl(var(--mkt-brand))] transition-colors hover:bg-[hsl(var(--mkt-brand-on))]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand-on))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--mkt-brand))]"
          >
            {cta}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
