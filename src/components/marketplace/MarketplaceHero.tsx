import { useTranslation } from "react-i18next";
import { CleanerSearchBar } from "./CleanerSearchBar";
import livingroomAsset from "@/assets/home-livingroom.jpg.asset.json";

/**
 * MarketplaceHero — bright, editorial hero for the public homepage.
 * Left column: heading, trust chip, search bar. Right column: real
 * interior photography (existing licensed asset), no fake avatars.
 */
export function MarketplaceHero() {
  const { t } = useTranslation("marketplace");
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-10 px-5 pb-14 pt-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:px-8 lg:pt-16">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--mkt-ink-muted))]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--mkt-success))] opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--mkt-success))]" />
            </span>
            {t("hero.eyebrow", "Europe's cleaning marketplace")}
          </div>

          <h1 className="mt-6 font-serif text-[42px] leading-[1.02] tracking-[-0.02em] text-[hsl(var(--mkt-ink))] sm:text-[56px] lg:text-[68px]">
            {t("hero.title_line_1", "Book your cleaner.")}
            <br />
            <span className="text-[hsl(var(--mkt-brand))]">{t("hero.title_line_2", "Trusted, verified, local.")}</span>
          </h1>

          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
            {t("hero.subtitle", "Compare real reviews and transparent prices. Book directly in your cleaner's calendar — no bidding, no waiting.")}
          </p>

          <div className="mt-8">
            <CleanerSearchBar />
          </div>

          <p className="mt-4 text-[12.5px] text-[hsl(var(--mkt-ink-soft))]">
            {t("hero.price_note", "Price is calculated during booking based on your provider and service.")}
          </p>
        </div>

        <div className="relative hidden lg:block">
          <div className="absolute inset-0 -z-10 rounded-[36px] bg-[hsl(var(--mkt-brand-soft))]" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-[28px] border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] shadow-[var(--mkt-shadow-lift)]">
            <img
              src={livingroomAsset.url}
              alt={t("hero.image_alt", "Freshly cleaned home interior")}
              className="aspect-[4/5] w-full object-cover"
              loading="eager"
              width={640}
              height={800}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
