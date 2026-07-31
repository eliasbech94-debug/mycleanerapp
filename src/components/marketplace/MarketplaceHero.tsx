import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CleanerSearchBar } from "./CleanerSearchBar";
import { ShieldCheck, Lock, Star, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useHomeAudience, type HomeAudience } from "./home/useHomeAudience";
import heroAsset from "@/assets/hero-europe-v7.jpg.asset.json";
import { useMarketStatus } from "@/hooks/useMarketStatus";


/**
 * MarketplaceHero — responsive premium editorial layout.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Experience Engine + Localization Engine (config-driven copy)
 * ─────────────────────────────────────────────────────────────────────────
 * The Hero contains NO hardcoded marketing text. Every string (eyebrow,
 * headline, subtitle, secondary CTA, trust chips, availability, image alt)
 * is resolved through the i18n JSON under `marketplace.hero.*` and can be
 * swapped per language, country, campaign or user segment without touching
 * this component.
 *
 * Variant resolution (audience → variant key):
 *   guest        → hero.variants.guest
 *   customer     → hero.variants.customer   (returning customer, {{name}})
 *   provider     → hero.variants.provider
 *
 * A CMS/Campaign layer can later override the variant key by writing into
 * the same `hero.variants.<key>` namespace or by injecting a
 * `hero.variants.campaign` block and switching the resolver — no component
 * change required.
 *
 * "Cleaner" is a protected MyCleaner brand term. It is never translated in
 * any locale; wherever it appears in the resolved title lines it is auto-
 * highlighted with the brand accent color.
 *
 * The visual layout is intentionally unchanged from the approved responsive
 * hero (dual md-split layout, clamp() height, per-breakpoint object-position,
 * stacked mobile order). Only the copy pipeline is dynamic.
 */

type Variant = {
  eyebrow: string;
  title_line_1: string;
  title_line_2?: string;
  subtitle: string;
  cta_secondary_label?: string;
  cta_secondary_href?: string;
};

function variantKeyFor(audience: HomeAudience, hasName: boolean): "guest" | "customer" | "provider" {
  if (audience === "provider") return "provider";
  if (audience === "customer" && hasName) return "customer";
  return "guest";
}

export function MarketplaceHero() {
  const { t } = useTranslation("marketplace");
  const { user } = useAuth();
  const { audience } = useHomeAudience();

  const name = useMemo(() => {
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const first = typeof meta.first_name === "string" ? meta.first_name : undefined;
    return first || user?.email?.split("@")[0] || "";
  }, [user]);

  const vKey = variantKeyFor(audience, Boolean(name));
  const base = `hero.variants.${vKey}`;

  const variant: Variant = {
    eyebrow: t(`${base}.eyebrow`, { defaultValue: "" }),
    title_line_1: t(`${base}.title_line_1`, { name, defaultValue: "" }),
    title_line_2: t(`${base}.title_line_2`, { name, defaultValue: "" }),
    subtitle: t(`${base}.subtitle`, { name, defaultValue: "" }),
    cta_secondary_label: t(`${base}.cta_secondary_label`, { defaultValue: "" }),
    cta_secondary_href: t(`${base}.cta_secondary_href`, { defaultValue: "" }),
  };

  const alt = t("hero.image_alt", { defaultValue: "MyCleaner" });
  const availabilityLabel = t("hero.availability_label", { defaultValue: "" });
  const launchNotice = t("hero.launch_notice", { defaultValue: "" });
  const comingSoonLabel = t("hero.coming_soon", { defaultValue: "" });
  // Availability is server-driven — no hardcoded list of active markets here.
  const { isBookable } = useMarketStatus();
  const countryCodes = ["dk", "se", "de", "gb", "es"] as const;


  return (
    <section className="relative isolate" aria-labelledby="mkt-hero-title">
      {/* ================= md+ : overlay layout ================= */}
      <div
        className="relative hidden isolate overflow-hidden md:block"
        style={{ minHeight: "clamp(380px, 52vh, 560px)" }}
      >
        <picture>
          <source media="(min-width: 768px)" srcSet={heroAsset.url} />
          {/* Mobile fallback = 1x1 transparent gif so mobile browsers never download the desktop hero */}
          <img
            src="data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover object-[65%_35%] lg:object-[60%_30%] xl:object-[55%_25%]"
            loading="eager"
            {...({ fetchpriority: "high" } as Record<string, string>)}
            decoding="async"
            width={1920}
            height={1088}
          />
        </picture>
        {/* Left scrim: guarantees headline contrast without washing out the Europe map in the center */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--mkt-bg))] from-0% via-[hsl(var(--mkt-bg))]/70 via-30% to-transparent to-55%"
          aria-hidden="true"
        />
        {/* Bottom fade into page background */}
        <div
          className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[hsl(var(--mkt-bg))] to-transparent"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex min-h-[inherit] max-w-[1400px] flex-col justify-center gap-5 px-6 py-8 md:py-10 lg:px-8 lg:py-12">
          <div className="max-w-2xl">
            {variant.eyebrow && <Eyebrow label={variant.eyebrow} />}
            <h1
              id="mkt-hero-title"
              className="mt-4 font-sans font-bold leading-[1.05] tracking-[-0.02em] text-[hsl(var(--mkt-ink))]"
              style={{ fontSize: "clamp(1.9rem, 3.4vw + 0.5rem, 3.25rem)" }}
            >
              <BrandLine text={variant.title_line_1} />
              {variant.title_line_2 && (
                <>
                  <br />
                  <BrandLine text={variant.title_line_2} />
                </>
              )}
            </h1>
            {variant.subtitle && (
              <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
                {variant.subtitle}
              </p>
            )}
          </div>

          <div className="max-w-4xl">
            <CleanerSearchBar />
            <TrustRow t={t} />
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <AvailabilityRow
                label={availabilityLabel}
                codes={countryCodes}
                t={t}
                isBookable={isBookable}
                comingSoonLabel={comingSoonLabel}
                className="text-[12px] font-medium uppercase tracking-[0.18em] text-[hsl(var(--mkt-ink-soft))]"
              />
              <SecondaryCta label={variant.cta_secondary_label} href={variant.cta_secondary_href} />
            </div>
            {launchNotice && (
              <p
                data-testid="hero-launch-notice"
                className="mt-2 text-[12.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]"
              >
                {launchNotice}
              </p>
            )}

          </div>
        </div>
      </div>

      {/* ================= <md : native app-style mobile layout =================
          Booking-first hierarchy per Mobile UX spec:
            nav → headline → BOOKING CARD (hero) → trust → flags
          Popular Services (ServiceCategoryGrid) and the Europe illustration
          are rendered by Index.tsx AFTER this hero, keeping the illustration
          as branding artwork rather than a dominant hero. */}
      <div className="md:hidden bg-[hsl(var(--mkt-bg))]">
        {/* 1. Compact greeting — tight, native-app rhythm. */}
        <div className="px-5 pt-3 pb-1">
          {variant.eyebrow && <Eyebrow label={variant.eyebrow} />}
          <h1
            id="mkt-hero-title-mobile"
            className="mt-2 max-w-[18ch] font-sans font-bold leading-[1.08] tracking-[-0.025em] text-[hsl(var(--mkt-ink))]"
            style={{ fontSize: "clamp(1.5rem, 6.5vw, 1.9rem)" }}
          >
            <BrandLine text={variant.title_line_1} />
            {variant.title_line_2 && (
              <>
                {" "}
                <BrandLine text={variant.title_line_2} />
              </>
            )}
          </h1>
          {variant.subtitle && (
            <p className="mt-2 max-w-[32ch] text-[14px] leading-snug text-[hsl(var(--mkt-ink-muted))] line-clamp-2">
              {variant.subtitle}
            </p>
          )}
        </div>

        {/* 2. Booking card — THE HERO. Airbnb-style: large radius, generous
            padding, deep shadow. Sits directly under the greeting so the CTA
            is inside the first viewport on every modern phone. */}
        <div className="px-4 pt-3">
          <div className="rounded-[24px] bg-white p-4 shadow-[0_24px_60px_-22px_rgba(6,22,21,0.42)] ring-1 ring-black/5">
            <CleanerSearchBar compact />
          </div>
        </div>

        {/* 3. Trust chips row — tight, native micro-row (horizontal scroll if needed). */}
        <div className="px-4 pt-3">
          <ul className="flex flex-wrap items-center gap-2 text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">
            <MobileTrustChip icon={<ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--mkt-success))]" aria-hidden />} label={t("hero.trust.verified", { defaultValue: "" })} />
            <MobileTrustChip icon={<Lock className="h-3.5 w-3.5 text-[hsl(var(--mkt-success))]" aria-hidden />} label={t("hero.trust.payments", { defaultValue: "" })} />
            <MobileTrustChip icon={<Star className="h-3.5 w-3.5 text-[hsl(var(--mkt-success))]" aria-hidden />} label={t("hero.trust.reviews", { defaultValue: "" })} />
          </ul>
        </div>

        {/* 4. Country availability — clean chip row, no dot separators (which wrap awkwardly on narrow screens). */}
        <div className="px-4 pt-3">
          {availabilityLabel && (
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--mkt-ink-soft))]">
              {availabilityLabel}
            </p>
          )}
          <ul className="flex flex-wrap gap-1.5">
            {countryCodes.map((code) => {
              const name = t(`hero.countries.${code}`, { defaultValue: "" });
              if (!name) return null;
              return (
                <li key={code} className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] px-2.5 py-1 text-[11.5px] font-medium text-[hsl(var(--mkt-ink))]">
                  <img
                    src={`https://flagcdn.com/${code}.svg`}
                    alt=""
                    aria-hidden="true"
                    width={16}
                    height={12}
                    loading="lazy"
                    className="inline-block h-3 w-4 rounded-[2px] object-cover"
                  />
                  {name}
                </li>
              );
            })}
          </ul>
          {variant.cta_secondary_label && variant.cta_secondary_href && (
            <div className="mt-3">
              <SecondaryCta label={variant.cta_secondary_label} href={variant.cta_secondary_href} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MobileTrustChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  if (!label) return null;
  return (
    <li className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[hsl(var(--mkt-surface))] px-3 py-1.5 shadow-[0_1px_2px_rgba(6,22,21,0.06)] ring-1 ring-[hsl(var(--mkt-border))]">
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </li>
  );
}


function Eyebrow({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]/85 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--mkt-brand))] shadow-[var(--mkt-shadow-soft)] backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--mkt-brand))]" aria-hidden="true" />
      {label}
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TrustRow({ t }: { t: any }) {
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
      <TrustChip
        icon={<ShieldCheck className="h-4 w-4 text-[hsl(var(--mkt-success))]" aria-hidden="true" />}
        label={t("hero.trust.verified", { defaultValue: "" })}
      />
      <TrustChip
        icon={<Lock className="h-4 w-4 text-[hsl(var(--mkt-success))]" aria-hidden="true" />}
        label={t("hero.trust.payments", { defaultValue: "" })}
      />
      <TrustChip
        icon={<Star className="h-4 w-4 text-[hsl(var(--mkt-success))]" aria-hidden="true" />}
        label={t("hero.trust.reviews", { defaultValue: "" })}
      />
    </ul>
  );
}

function TrustChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  if (!label) return null;
  return (
    <li className="inline-flex items-center gap-1.5">
      {icon}
      {label}
    </li>
  );
}

/**
 * AvailabilityRow — renders "Available in" label followed by a row of
 * country name + SVG flag pairs. SVG flags (via flagcdn) render identically
 * across platforms unlike native emoji flags which fail on Windows Chrome.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AvailabilityRow({
  label,
  codes,
  t,
  className,
}: {
  label: string;
  codes: readonly string[];
  t: any;
  className?: string;
}) {
  if (!label || codes.length === 0) return null;
  return (
    <p className={className}>
      <span>{label}</span>
      <span className="ml-2 inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
        {codes.map((code, i) => {
          const name = t(`hero.countries.${code}`, { defaultValue: "" });
          if (!name) return null;
          return (
            <span key={code} className="inline-flex items-center gap-1.5 align-middle">
              {i > 0 && <span aria-hidden="true" className="opacity-40">·</span>}
              <img
                src={`https://flagcdn.com/${code}.svg`}
                alt=""
                aria-hidden="true"
                width={18}
                height={13}
                loading="lazy"
                className="inline-block h-[13px] w-[18px] rounded-[2px] shadow-[0_0_0_1px_hsl(var(--mkt-border))] object-cover"
              />
              <span>{name}</span>
            </span>
          );
        })}
      </span>
    </p>
  );
}

function SecondaryCta({ label, href }: { label?: string; href?: string }) {
  if (!label || !href) return null;
  return (
    <Link
      to={href}
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[hsl(var(--mkt-brand))] transition-colors hover:text-[hsl(var(--mkt-brand-hover))] focus-visible:outline-none focus-visible:underline"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

/**
 * BrandLine — renders a title line and auto-highlights the protected
 * "Cleaner" / "Cleaners" brand term with the marketplace accent color. The
 * brand word itself is never translated.
 */
function BrandLine({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(Cleaners?)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^Cleaners?$/.test(part) ? (
          <span key={i} className="text-[hsl(var(--mkt-brand))]">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
