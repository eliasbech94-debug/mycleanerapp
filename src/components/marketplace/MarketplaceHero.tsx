import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CleanerSearchBar } from "./CleanerSearchBar";
import { ShieldCheck, Lock, Star, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useHomeAudience, type HomeAudience } from "./home/useHomeAudience";
import heroAsset from "@/assets/hero-europe-v5.jpg.asset.json";

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
  const countryCodes = ["dk", "se", "de", "gb", "es"] as const;

  return (
    <section className="relative isolate" aria-labelledby="mkt-hero-title">
      {/* ================= md+ : overlay layout ================= */}
      <div
        className="relative hidden isolate overflow-hidden md:block"
        style={{ minHeight: "clamp(380px, 52vh, 560px)" }}
      >
        <img
          src={heroAsset.url}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover object-[68%_6%] lg:object-[70%_4%] xl:object-[72%_2%]"
          loading="eager"
          {...({ fetchpriority: "high" } as Record<string, string>)}
          decoding="async"
          width={1920}
          height={1088}
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--mkt-bg))] via-[hsl(var(--mkt-bg))]/85 to-[hsl(var(--mkt-bg))]/10 lg:to-transparent"
          aria-hidden="true"
        />
        <div
          className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[hsl(var(--mkt-bg))] to-transparent"
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
                className="text-[12px] font-medium uppercase tracking-[0.18em] text-[hsl(var(--mkt-ink-soft))]"
              />
              <SecondaryCta label={variant.cta_secondary_label} href={variant.cta_secondary_href} />
            </div>
          </div>
        </div>
      </div>

      {/* ================= <md : stacked mobile layout ================= */}
      <div className="md:hidden">
        <div className="px-5 pt-6 pb-4">
          {variant.eyebrow && <Eyebrow label={variant.eyebrow} />}
          <h1
            id="mkt-hero-title-mobile"
            className="mt-3 font-sans font-bold leading-[1.08] tracking-[-0.02em] text-[hsl(var(--mkt-ink))]"
            style={{ fontSize: "clamp(1.75rem, 7.5vw, 2.25rem)" }}
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
            <p className="mt-3 text-[14.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
              {variant.subtitle}
            </p>
          )}
        </div>

        <div
          className="relative isolate mx-5 overflow-hidden rounded-2xl border border-[hsl(var(--mkt-border))] shadow-[var(--mkt-shadow-soft)]"
          style={{ aspectRatio: "16 / 10" }}
        >
          <img
            src={heroAsset.url}
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover object-[58%_18%]"
            loading="eager"
            decoding="async"
            width={1920}
            height={1088}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[hsl(var(--mkt-bg))]/60 to-transparent"
            aria-hidden="true"
          />
        </div>

        <div className="px-5 pt-5 pb-6">
          <CleanerSearchBar />
          <TrustRow t={t} />
          <div className="mt-4 flex flex-col gap-2">
            {availability && (
              <p className="text-[11.5px] font-medium uppercase tracking-[0.16em] text-[hsl(var(--mkt-ink-soft))]">
                {availability}
              </p>
            )}
            <SecondaryCta label={variant.cta_secondary_label} href={variant.cta_secondary_href} />
          </div>
        </div>
      </div>
    </section>
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
