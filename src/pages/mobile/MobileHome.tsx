/**
 * MobileHome — role-dependent mobile landing screen at `/`.
 *
 * Presentation only. Reuses existing hooks/queries:
 *   - useAuth() / useUserRoles()          → role resolution
 *   - useHomeAudience()                   → audience bucket (guest|customer|provider)
 *   - useMarketplaceProviders()           → featured cleaners (existing RPC)
 *   - useActiveMarket()                   → market for featured carousel
 *   - supabase `bookings` query           → same shape used by CustomerDashboard/
 *     MyBookings (customer_user_id filter). No new tables, no new logic.
 *   - supabase `provider_profiles` query  → same shape used by ProviderDashboard
 *     for onboarding progress fields only.
 *
 * NO fabrication: earnings are NOT computed client-side. If a provider has no
 * trusted earnings source we render an honest unavailable state.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import EarlyAccessBanner from "@/components/launch/EarlyAccessBanner";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Calendar as CalendarIcon,
  MessageCircle,
  Search,
  Wallet,
  Sparkles,
  MapPin,
  Clock,
  ChevronRight,
  ShieldCheck,
  Star,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHomeAudience } from "@/components/marketplace/home/useHomeAudience";
import { useActiveMarket } from "@/context/ActiveMarketContext";
import { useMarketplaceProviders } from "@/hooks/useMarketplaceProviders";
import { EarlyAccessEmptyState } from "@/components/marketplace/EarlyAccessEmptyState";

import { CountryConfirmDialog } from "@/components/marketplace/CountryConfirmDialog";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullIndicator } from "@/components/mobile/PullIndicator";
import { MobileServicesCarousel } from "@/components/mobile/MobileServicesCarousel";
import { MobileHowItWorksCard } from "@/components/mobile/MobileHowItWorksCard";
import { CampaignSection } from "@/components/marketplace/home/CampaignSection";
import { CompactProviderCard as ProviderCard } from "@/components/marketplace/CompactProviderCard";


const HomeSections = lazy(() =>
  import("@/components/marketplace/home/HomeSections").then((m) => ({ default: m.HomeSections })),
);

/* ------------------------------ shared bits ------------------------------- */

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 pt-6">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="type-mobile-title text-[17px] font-semibold text-[hsl(var(--mkt-ink))]">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function TapAction({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="tap-target flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] px-2 py-3 text-center shadow-[var(--app-shadow-card,0_1px_2px_rgba(0,0,0,0.04))] active:scale-[0.98] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100"
      style={{ WebkitTapHighlightColor: "var(--app-tap-highlight)" }}
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]">
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="text-[12px] font-semibold leading-tight text-[hsl(var(--mkt-ink))]">{label}</span>
    </Link>
  );
}

function TrustChips() {
  const { t } = useTranslation("marketplace");
  const chips = [
    { icon: ShieldCheck, label: t("hero.trust.verified", "Verificerede Cleaners") },
    { icon: Wallet, label: t("hero.trust.payments", "Sikre betalinger") },
    { icon: Star, label: t("hero.trust.fixed_price", "Fast pris uden overraskelser") },
  ];
  return (
    <div
      data-testid="mobile-trust-chips"
      role="list"
      aria-label={t("hero.trust.rowLabel", "Fordele")}
      className="no-scrollbar mt-3 flex snap-x snap-mandatory flex-nowrap gap-2 overflow-x-auto overflow-y-hidden px-4 pb-1 [scroll-padding-inline:1rem]"
    >
      {chips.map(({ icon: Icon, label }) => (
        <span
          role="listitem"
          key={label}
          className="inline-flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] px-3 py-1.5 text-[12px] font-medium text-[hsl(var(--mkt-ink))]"
        >
          <Icon className="h-3.5 w-3.5 text-[hsl(var(--mkt-brand))]" aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}


/* ------------------------------ hero cards ------------------------------- */

function GreetingBar({ name }: { name?: string | null }) {
  const { t } = useTranslation("marketplace");
  return (
    <div className="px-4 pt-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--mkt-ink-muted))]">
        MyCleaner
      </div>
      <h1 className="type-mobile-display mt-1 text-[26px] font-semibold leading-tight text-[hsl(var(--mkt-ink))]">
        {name
          ? t("mobileHome.greeting_named", "Hej {{name}}", { name })
          : t("mobileHome.greeting_guest", "Find den perfekte Cleaner")}
      </h1>
      <p className="mt-1 text-[13.5px] leading-snug text-[hsl(var(--mkt-ink-muted))]">
        {name
          ? t("mobileHome.subtitle_customer", "Book din næste Cleaner på få sekunder.")
          : t("mobileHome.subtitle_guest", "Verificerede Cleaners – hurtigt, sikkert og nemt.")}
      </p>
    </div>
  );
}

function PrimaryBookingCard() {
  const { t } = useTranslation("marketplace");
  return (
    <div className="px-4 pt-4">
      <Link
        to="/find-cleaner"
        className="tap-target !block w-full rounded-3xl bg-[hsl(var(--mkt-brand))] p-5 text-white shadow-[0_18px_36px_-16px_hsl(var(--mkt-brand)/0.55)] active:scale-[0.99] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--mkt-brand))]"
        style={{ WebkitTapHighlightColor: "var(--app-tap-highlight)" }}
        aria-label={t("mobileHome.bookingCard.ariaLabel", "Find en Cleaner")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
              {t("mobileHome.bookingCard.eyebrow", "Book en Cleaner")}
            </div>
            <div className="mt-1.5 text-[22px] font-semibold leading-tight text-white">
              {t("mobileHome.bookingCard.title", "Find din Cleaner")}
            </div>
            <div className="mt-1.5 text-[13.5px] leading-snug text-white/90">
              {t("mobileHome.bookingCard.subtitle", "Sammenlign profiler, priser og ledige tider.")}
            </div>
          </div>
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/18">
            <Search className="h-5 w-5" aria-hidden />
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3">
          <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-[12px] font-medium text-white/90">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{t("mobileHome.bookingCard.trust", "Verificerede profiler · Sikker betaling")}</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold text-white">
            {t("mobileHome.bookingCard.cta", "Find en Cleaner")}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>
      </Link>
    </div>
  );
}

/* ------------------------------ featured carousel ------------------------ */

function FeaturedCleanersCarousel({ refreshNonce = 0 }: { refreshNonce?: number }) {
  const { t } = useTranslation("marketplace");
  const { market, isNeutral } = useActiveMarket();
  const { data, loading, error, refetch } = useMarketplaceProviders(
    {
      countryCode: isNeutral ? null : market.code,
      serviceCategory: "cleaning",
      sort: "score",
      limit: 8,
    },
    { realtime: false },
  );
  // Reuse existing refetch; no new query.
  useEffect(() => {
    if (refreshNonce > 0) {
      void refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  return (
    <Section
      title={t("mobileHome.featured.title", "Anbefalede Cleaners")}
      action={
        <Link
          to="/find-cleaner"
          className="text-[13px] font-semibold text-[hsl(var(--mkt-brand))]"
        >
          {t("mobileHome.featured.viewAll", "Se alle")}
        </Link>
      }
    >
      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[164px] w-[160px] shrink-0 animate-pulse rounded-2xl bg-[hsl(var(--mkt-surface-alt,var(--mkt-surface)))]/70"
            />
          ))}
        </div>
      ) : error || !data || data.length === 0 ? (
        <EarlyAccessEmptyState compact />
      ) : (
        <div
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {data.map((raw) => {
            const p = raw as typeof raw & { slug?: string; public_slug?: string; id?: string; name?: string };
            const slug = p.provider_slug || p.slug || p.public_slug || p.id || "";

            return (
              <ProviderCard
                key={slug}
                provider={{ ...p, provider_slug: slug, display_name: p.display_name || p.name || "Cleaner" }}
                to={`/p/${slug}`}
                className="w-[212px] shrink-0 snap-start"
              />
            );
          })}

        </div>
      )}
    </Section>
  );
}

/* ------------------------------ Guest home ------------------------------- */

function GuestHome() {
  const { t } = useTranslation("marketplace");
  const [nonce, setNonce] = useState(0);
  const { pullY, refreshing, thresholdReached } = usePullToRefresh({
    enabled: true,
    onRefresh: async () => {
      // Bump nonce → FeaturedCleanersCarousel re-runs its existing refetch.
      // The nested carousel does not expose a completion promise, so we
      // hold the indicator for a short bounded window and then release it
      // neutrally. No success haptic — actual refetch completion is
      // unknown to this scope. Presentation-only; no new query issued.
      setNonce((n) => n + 1);
      await new Promise((r) => setTimeout(r, 650));
    },
  });
  return (
    <>
      <PtrRow pullY={pullY} refreshing={refreshing} thresholdReached={thresholdReached} />
      <GreetingBar />
      {/* Primary booking CTA — sidens visuelt stærkeste element. */}
      <PrimaryBookingCard />
      <TrustChips />
      {/* Mobile: horizontal swipe carousel replaces the desktop grid. */}
      <MobileServicesCarousel />
      {/* Featured Cleaners (existing carousel, uses useMarketplaceProviders). */}
      <FeaturedCleanersCarousel refreshNonce={nonce} />
      {/* "Sådan virker" — single swipe card (mobile-only presentation). */}
      <MobileHowItWorksCard />
      {/* Campaign section (renders nothing if no active headline). */}
      <CampaignSection />
    </>
  );
}


/* ---------------------------- shared PTR helpers ------------------------- */

function tryVibrate() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(8);
    }
  } catch {
    /* noop */
  }
}

function PtrRow({
  pullY,
  refreshing,
  thresholdReached,
}: {
  pullY: number;
  refreshing: boolean;
  thresholdReached: boolean;
}) {
  const { t } = useTranslation("marketplace");
  return (
    <PullIndicator
      pullY={pullY}
      refreshing={refreshing}
      thresholdReached={thresholdReached}
      label={t("mobile.ptr.pull", "Træk for at opdatere")}
      releaseLabel={t("mobile.ptr.release", "Slip for at opdatere")}
      refreshingLabel={t("mobile.ptr.refreshing", "Opdaterer…")}
    />
  );
}

/* ------------------------------ Customer home ---------------------------- */

type CustomerBooking = {
  id: string;
  provider_name: string | null;
  service: string | null;
  booking_date: string;
  slot: string | null;
  address: string | null;
  status: string;
};

function useNearestCustomerBooking() {
  const { user } = useAuth();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [nearest, setNearest] = useState<CustomerBooking | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const { data, error } = await supabase
      .from("bookings")
      .select("id,provider_name,service,booking_date,slot,address,status")
      .eq("customer_user_id", user.id)
      .order("booking_date", { ascending: true });
    if (error) {
      setState("error");
      return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = ((data ?? []) as CustomerBooking[]).filter(
      (b) => new Date(b.booking_date) >= today && b.status !== "cancelled" && b.status !== "declined",
    );
    setNearest(upcoming[0] ?? null);
    setState("ready");
    return true;
  }, [user]);


  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [user, load]);
  return { state, nearest, refetch: load };
}

function CustomerHome({ firstName }: { firstName: string | null }) {
  const { t } = useTranslation("marketplace");
  const { state, nearest, refetch } = useNearestCustomerBooking();
  const { pullY, refreshing, thresholdReached } = usePullToRefresh({
    enabled: true,
    onRefresh: async () => {
      const ok = await refetch();
      if (ok) tryVibrate();
    },

  });

  return (
    <>
      <PtrRow pullY={pullY} refreshing={refreshing} thresholdReached={thresholdReached} />
      <GreetingBar name={firstName ?? t("mobileHome.greeting_fallback_name", "der")} />

      <Section title={t("mobileHome.customer.upcoming", "Kommende booking")}>
        {state === "loading" ? (
          <div className="flex h-[92px] items-center gap-2 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] px-4 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("mobileHome.customer.loading", "Henter…")}
          </div>
        ) : state === "error" ? (
          <div className="rounded-2xl border border-dashed border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
            {t("mobileHome.customer.error", "Kunne ikke hente bookinger.")}
          </div>
        ) : nearest ? (
          <Link
            to="/mine-bookinger"
            className="tap-target block rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4 shadow-[var(--app-shadow-card,0_1px_2px_rgba(0,0,0,0.04))]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">
                  {nearest.provider_name || t("mobileHome.customer.provider", "Cleaner")}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">
                  <span className="inline-flex items-center gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" aria-hidden />
                    {new Date(nearest.booking_date).toLocaleDateString()}
                  </span>
                  {nearest.slot ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {nearest.slot}
                    </span>
                  ) : null}
                  {nearest.address ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{nearest.address}</span>
                    </span>
                  ) : null}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--mkt-ink-muted))]" aria-hidden />
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl border border-dashed border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
            {t("mobileHome.customer.empty", "Du har ingen kommende bookinger. Book din næste Cleaner nu.")}
          </div>
        )}
      </Section>

      <Section title={t("mobileHome.quickActions.title", "Hurtige handlinger")}>
        <div className="grid grid-cols-3 gap-2.5">
          <TapAction to="/find-cleaner" icon={Search} label={t("mobileHome.quickActions.book_again", "Book igen")} />
          <TapAction to="/find-cleaner" icon={Sparkles} label={t("mobileHome.quickActions.find_cleaner", "Find cleaner")} />
          <TapAction to="/profil?tab=inbox" icon={MessageCircle} label={t("mobileHome.quickActions.messages", "Beskeder")} />
        </div>
      </Section>

      <Suspense fallback={<div className="h-16" aria-hidden />}>
        <HomeSections slot="bottom" />
      </Suspense>
    </>
  );
}

/* ------------------------------ Provider home ---------------------------- */

type ProviderJob = {
  id: string;
  service: string | null;
  booking_date: string;
  slot: string | null;
  address: string | null;
  status: string;
};

function useProviderTodayAndNext() {
  const { user } = useAuth();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [todayCount, setTodayCount] = useState(0);
  const [nextJob, setNextJob] = useState<ProviderJob | null>(null);
  const load = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const { data, error } = await supabase
      .from("bookings")
      .select("id,service,booking_date,slot,address,status")
      .order("booking_date", { ascending: true });
    if (error) {
      setState("error");
      return false;
    }
    const now = new Date();
    const todayISO = now.toISOString().slice(0, 10);
    const active = ((data ?? []) as ProviderJob[]).filter(
      (b) => b.status === "accepted" || b.status === "pending",
    );
    setTodayCount(active.filter((b) => b.booking_date?.slice(0, 10) === todayISO).length);
    const upcoming = active
      .filter((b) => new Date(b.booking_date) >= new Date(todayISO))
      .sort((a, b) => a.booking_date.localeCompare(b.booking_date));
    setNextJob(upcoming[0] ?? null);
    setState("ready");
    return true;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [user, load]);
  return { state, todayCount, nextJob, refetch: load };
}

function useProviderOnboarding() {
  const { user } = useAuth();
  const [pp, setPp] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async (): Promise<void> => {
    if (!user) return;
    const { data } = await supabase
      .from("provider_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    setPp(data);
    setLoaded(true);
  }, [user]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [user, load]);
  return { pp, loaded, refetch: load };
}

function ProviderHome({ firstName }: { firstName: string | null }) {
  const { t } = useTranslation("marketplace");
  const { state, todayCount, nextJob, refetch: refetchJobs } = useProviderTodayAndNext();
  const { pp, loaded, refetch: refetchOnboarding } = useProviderOnboarding();
  const { pullY, refreshing, thresholdReached } = usePullToRefresh({
    enabled: true,
    onRefresh: async () => {
      const [ok] = await Promise.all([refetchJobs(), refetchOnboarding()]);
      if (ok) tryVibrate();
    },

  });

  // Onboarding progress — count filled required fields already validated
  // by /provider-dashboard's OnboardingChecklist. Presentation-only summary.
  const onboardingFields: Array<[string, boolean]> = pp
    ? [
        ["identity", pp.identity_verified_at != null],
        ["stripe", pp.stripe_charges_enabled === true],
        ["bank", pp.bank_verified === true || pp.stripe_payouts_enabled === true],
        ["profile", Boolean(pp.display_name && pp.bio)],
      ]
    : [];
  const doneCount = onboardingFields.filter(([, v]) => v).length;
  const progressPct =
    onboardingFields.length > 0 ? Math.round((doneCount / onboardingFields.length) * 100) : 0;
  const onboardingComplete = onboardingFields.length > 0 && doneCount === onboardingFields.length;

  return (
    <>
      <PtrRow pullY={pullY} refreshing={refreshing} thresholdReached={thresholdReached} />
      <GreetingBar name={firstName ?? t("mobileHome.greeting_fallback_name", "der")} />

      {/* Today overview */}
      <Section title={t("mobileHome.provider.today", "I dag")}>
        <div className="rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4">
          {state === "loading" ? (
            <div className="flex items-center gap-2 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("mobileHome.customer.loading", "Henter…")}
            </div>
          ) : state === "error" ? (
            <div className="text-[13px] text-[hsl(var(--mkt-ink-muted))]">
              {t("mobileHome.provider.error", "Kunne ikke hente jobs.")}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="type-mobile-display text-[28px] font-semibold text-[hsl(var(--mkt-ink))]">
                  {todayCount}
                </div>
                <div className="text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">
                  {t("mobileHome.provider.todayJobs", {
                    count: todayCount,
                    defaultValue_one: "aktiv opgave i dag",
                    defaultValue_other: "aktive opgaver i dag",
                  })}
                </div>
              </div>
              <Link
                to="/provider-dashboard"
                className="tap-target inline-flex items-center gap-1 rounded-full bg-[hsl(var(--mkt-brand-soft))] px-3 py-1.5 text-[12.5px] font-semibold text-[hsl(var(--mkt-brand))]"
              >
                {t("mobileHome.provider.openDashboard", "Åbn dashboard")}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      </Section>

      {/* Next confirmed job */}
      <Section title={t("mobileHome.provider.nextJob", "Næste opgave")}>
        {state === "loading" ? (
          <div className="h-[76px] animate-pulse rounded-2xl bg-[hsl(var(--mkt-surface))]" />
        ) : nextJob ? (
          <Link
            to="/provider-dashboard"
            className="tap-target block rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">
                  {nextJob.service || t("mobileHome.provider.job", "Opgave")}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">
                  <span className="inline-flex items-center gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" aria-hidden />
                    {new Date(nextJob.booking_date).toLocaleDateString()}
                  </span>
                  {nextJob.slot ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {nextJob.slot}
                    </span>
                  ) : null}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--mkt-ink-muted))]" aria-hidden />
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl border border-dashed border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
            {t("mobileHome.provider.noJobs", "Ingen kommende opgaver.")}
          </div>
        )}
      </Section>

      {/* Earnings — honest unavailable state (no trusted client-side source). */}
      <Section title={t("mobileHome.provider.earnings", "Månedens indtjening")}>
        <div className="rounded-2xl border border-dashed border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4">
          <div className="text-[13px] text-[hsl(var(--mkt-ink-muted))]">
            {t(
              "mobileHome.provider.earningsUnavailable",
              "Se din opdaterede indtjening i Finans.",
            )}
          </div>
          <Link
            to="/provider/finance"
            className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[hsl(var(--mkt-brand))]"
          >
            {t("mobileHome.provider.openFinance", "Åbn Finans")}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </Section>

      {/* Onboarding progress */}
      {loaded && onboardingFields.length > 0 && !onboardingComplete ? (
        <Section title={t("mobileHome.provider.onboarding", "Kom i gang")}>
          <div className="rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4">
            <div className="flex items-center justify-between text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">
              <span>
                {t("mobileHome.provider.onboardingProgress", "{{done}} af {{total}} trin gennemført", {
                  done: doneCount,
                  total: onboardingFields.length,
                })}
              </span>
              <span className="font-semibold text-[hsl(var(--mkt-brand))]">{progressPct}%</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--mkt-brand-soft))]">
              <div
                className="h-full bg-[hsl(var(--mkt-brand))]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <Link
              to="/provider-dashboard"
              className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[hsl(var(--mkt-brand))]"
            >
              {t("mobileHome.provider.continueOnboarding", "Fortsæt")}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </Section>
      ) : null}

      {/* Quick actions */}
      <Section title={t("mobileHome.quickActions.title", "Hurtige handlinger")}>
        <div className="grid grid-cols-3 gap-2.5">
          <TapAction
            to="/provider-dashboard"
            icon={CalendarIcon}
            label={t("mobileHome.provider.calendar", "Kalender")}
          />
          <TapAction
            to="/profil?tab=inbox"
            icon={MessageCircle}
            label={t("mobileHome.quickActions.messages", "Beskeder")}
          />
          <TapAction to="/provider/finance" icon={Wallet} label={t("mobileHome.provider.payouts", "Udbetalinger")} />
        </div>
      </Section>

      <Suspense fallback={<div className="h-16" aria-hidden />}>
        <HomeSections slot="bottom" />
      </Suspense>
    </>
  );
}

/* ------------------------------ root export ------------------------------ */

export default function MobileHome() {
  const { user, profile } = useAuth();
  const { audience, ready } = useHomeAudience();
  const firstName =
    (profile?.full_name || user?.user_metadata?.full_name || "")
      .toString()
      .split(" ")[0] || null;

  // Skeleton preserves layout while auth/roles resolve.
  if (!ready) {
    return (
      <div data-testid="mobile-home-skeleton" aria-hidden className="animate-pulse">
        <div className="px-4 pt-4">
          <div className="h-3 w-24 rounded bg-[hsl(var(--mkt-brand-soft))]" />
          <div className="mt-2 h-7 w-3/4 rounded bg-[hsl(var(--mkt-brand-soft))]" />
          <div className="mt-2 h-4 w-2/3 rounded bg-[hsl(var(--mkt-brand-soft))]" />
        </div>
        <div className="px-4 pt-4">
          <div className="h-[104px] rounded-3xl bg-[hsl(var(--mkt-brand-soft))]" />
        </div>
        <div className="px-4 pt-4 grid grid-cols-3 gap-2.5">
          <div className="h-[76px] rounded-2xl bg-[hsl(var(--mkt-brand-soft))]" />
          <div className="h-[76px] rounded-2xl bg-[hsl(var(--mkt-brand-soft))]" />
          <div className="h-[76px] rounded-2xl bg-[hsl(var(--mkt-brand-soft))]" />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="mobile-home" data-audience={audience} className="pb-6">
      {/* Marketing banner is for unauthenticated visitors only. */}
      {audience === "guest" ? <EarlyAccessBanner /> : null}
      {audience === "guest" ? (
        <GuestHome />
      ) : audience === "provider" ? (
        <ProviderHome firstName={firstName} />
      ) : (
        <CustomerHome firstName={firstName} />
      )}
      <CountryConfirmDialog />
    </div>
  );
}
