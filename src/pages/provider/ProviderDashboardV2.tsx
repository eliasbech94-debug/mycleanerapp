import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCountryPath } from "@/lib/countryPath";
import type { TFunction } from "i18next";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BadgeCheck,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Inbox,
  LifeBuoy,
  ListChecks,
  MapPin,
  MessageSquare,
  Settings,
  Sparkles,
  Star,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import {
  ComingSoonCard,
  EmptyState,
  QuickActionCard,
  SectionCard,
  SectionErrorState,
  StatCard,
  WelcomeHeader,
} from "@/components/dashboard/primitives";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import ProviderDecisionBanner from "@/components/provider/ProviderDecisionBanner";
import { ProviderOnboardingDashboard } from "@/components/provider/ProviderOnboardingDashboard";
import { deriveProviderActivation } from "@/lib/provider/activation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/components/Inbox";
import {
  useProviderDashboard,
  type ProviderBooking,
  type ProviderPayout,
} from "@/hooks/useProviderDashboard";
import { formatMoney } from "@/i18n/money";

/**
 * ProviderDashboardV2 — Phase 2 v1.
 *
 * Uses design-system tokens only. Real data via `useProviderDashboard`
 * (parallel queries against `provider_profiles`, `bookings`,
 * `provider_offers`, `finance_payouts`, `booking_cancellations`).
 *
 * Metrics with no backend source (ratings / written reviews) render a
 * `<ComingSoonCard>` — nothing is fabricated.
 */
export default function ProviderDashboardV2() {
  const { t } = useTranslation("provider");
  const data = useProviderDashboard();
  const localize = useCountryPath();
  const notifications = useNotifications();

  const nextJob = data.upcoming[0] ?? null;
  const earnings =
    data.stats.currency && data.stats.earningsMinor > 0
      ? formatMoney(data.stats.earningsMinor, data.stats.currency)
      : "—";

  const responseText = useMemo(() => {
    const s = data.stats.avgResponseSeconds;
    if (s == null) return "—";
    if (s < 60) return t("dashboard.time.seconds", { count: s });
    if (s < 3600) return t("dashboard.time.minutes", { count: Math.round(s / 60) });
    return t("dashboard.time.hours", { count: Math.round(s / 3600) });
  }, [data.stats.avgResponseSeconds, t]);

  const verification = describeVerification(data.profile, t);
  // Fail-closed activation gate: while loading, and for any non-active
  // profile, the operational dashboard is not rendered at all.
  const activation = deriveProviderActivation(data.profile);

  if (!data.loading && !activation.active) {
    return (
      <DashboardLayout role="provider" title={t("dashboard.brandTitle")}>
        <DashboardPage
          title={t("activation.restricted.title")}
          description={t("activation.restricted.description")}
        >
          <div className="grid gap-5 lg:gap-6">
            <AppErrorBoundary>
              <ProviderDecisionBanner />
            </AppErrorBoundary>
            {data.error && (
              <SectionErrorState message={data.error} onRetry={data.refetch} compact />
            )}
            <AppErrorBoundary>
              <ProviderOnboardingDashboard activation={activation} />
            </AppErrorBoundary>
          </div>
        </DashboardPage>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="provider" title={t("dashboard.brandTitle")}>
      <DashboardPage
        title={t("dashboard.title")}
        description={t("dashboard.description")}
      >
        <div className="grid gap-5 lg:gap-6">
          <AppErrorBoundary>
            <ProviderDecisionBanner />
          </AppErrorBoundary>

          {data.error && (
            <SectionErrorState
              message={data.error}
              onRetry={data.refetch}
              compact
            />
          )}


          <AppErrorBoundary>
            <WelcomeHeader
              greeting={t("dashboard.greeting")}
              name={data.firstName}
              completion={data.profile?.completion_pct ?? null}
              loading={data.loading}
              subtitle={
                nextJob
                  ? nextJob.slot
                    ? t("dashboard.subtitle.nextJobWithSlot", { date: formatDate(nextJob.booking_date), slot: nextJob.slot })
                    : t("dashboard.subtitle.nextJob", { date: formatDate(nextJob.booking_date) })
                  : data.openRequests.length
                    ? t("dashboard.subtitle.openRequests", { count: data.openRequests.length })
                    : t("dashboard.subtitle.noBookings")
              }
              actions={
                <Button asChild size="sm" variant="outline">
                  <Link to={localize("/provider/profile")}>{t("dashboard.editProfile")}</Link>
                </Button>
              }
            />
          </AppErrorBoundary>

          {/* Verification / profile status strip */}
          {!data.loading && verification.showBanner && (
            <AppErrorBoundary>
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  >
                    <BadgeCheck className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-base text-foreground">
                      {verification.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {verification.description}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {verification.actions.map((a) => (
                    <Button key={a.to} asChild size="sm" variant={a.primary ? "default" : "outline"}>
                      <Link to={localize(a.to)}>{a.label}</Link>
                    </Button>
                  ))}
                </div>
              </div>
            </AppErrorBoundary>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              label={t("dashboard.stats.completedBookings")}
              value={data.stats.completed}
              icon={ListChecks}
              loading={data.loading}
            />
            <StatCard
              label={t("dashboard.stats.earnings")}
              value={earnings}
              hint={data.stats.completed ? t("dashboard.stats.earningsHint") : undefined}
              icon={Wallet}
              loading={data.loading}
            />
            <StatCard
              label={t("dashboard.stats.acceptanceRate")}
              value={data.stats.acceptanceRate == null ? "—" : `${data.stats.acceptanceRate}%`}
              hint={data.stats.acceptanceRate == null ? t("dashboard.stats.noOffersYet") : undefined}
              icon={TrendingUp}
              loading={data.loading}
            />
            <StatCard
              label={t("dashboard.stats.responseTime")}
              value={responseText}
              hint={data.stats.avgResponseSeconds == null ? t("dashboard.stats.noResponsesYet") : t("dashboard.stats.average")}
              icon={Clock}
              loading={data.loading}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
            {/* Left column */}
            <div className="space-y-5 lg:col-span-2 lg:space-y-6">
              <AppErrorBoundary>
                <SectionCard
                  title={t("dashboard.sections.today.title")}
                  description={t("dashboard.sections.today.description")}
                  loading={data.loading}
                  empty={!data.loading && data.todaysSchedule.length === 0}
                  emptyState={
                    <EmptyState
                      icon={CalendarClock}
                      title={t("dashboard.sections.today.emptyTitle")}
                      description={t("dashboard.sections.today.emptyDescription")}
                    />
                  }
                >
                  <ul className="space-y-3">
                    {data.todaysSchedule.map((b) => (
                      <BookingRow key={b.id} booking={b} highlight />
                    ))}
                  </ul>
                </SectionCard>
              </AppErrorBoundary>

              <AppErrorBoundary>
                <SectionCard
                  title={t("dashboard.sections.newRequests.title")}
                  description={t("dashboard.sections.newRequests.description")}
                  loading={data.loading}
                  empty={!data.loading && data.openRequests.length === 0}
                  emptyState={
                    <EmptyState
                      icon={Inbox}
                      title={t("dashboard.sections.newRequests.emptyTitle")}
                      description={t("dashboard.sections.newRequests.emptyDescription")}
                    />
                  }
                >
                  <ul className="space-y-3">
                    {data.openRequests.slice(0, 5).map((b) => (
                      <BookingRow key={b.id} booking={b} />
                    ))}
                  </ul>
                </SectionCard>
              </AppErrorBoundary>

              <AppErrorBoundary>
                <SectionCard
                  title={t("dashboard.sections.upcoming.title")}
                  loading={data.loading}
                  empty={!data.loading && data.upcoming.length === 0}
                  emptyState={
                    <EmptyState
                      icon={Calendar}
                      title={t("dashboard.sections.upcoming.emptyTitle")}
                      description={t("dashboard.sections.upcoming.emptyDescription")}
                    />
                  }
                >
                  <ul className="space-y-3">
                    {data.upcoming.slice(0, 5).map((b) => (
                      <BookingRow key={b.id} booking={b} />
                    ))}
                  </ul>
                </SectionCard>
              </AppErrorBoundary>

              <AppErrorBoundary>
                <SectionCard
                  title={t("dashboard.sections.reviews.title")}
                  description={t("dashboard.sections.reviews.description")}
                >
                  <ComingSoonCard
                    title={t("dashboard.sections.reviews.comingSoonTitle")}
                    description={t("dashboard.sections.reviews.comingSoonDescription")}
                  />
                </SectionCard>
              </AppErrorBoundary>
            </div>

            {/* Right column */}
            <div className="space-y-5 lg:space-y-6">
              <AppErrorBoundary>
                <SectionCard title={t("dashboard.shortcuts.title")}>
                  <div className="grid gap-3">
                    <QuickActionCard
                      title={t("dashboard.shortcuts.messages.title")}
                      description={t("dashboard.shortcuts.messages.description")}
                      icon={MessageSquare}
                      to={localize("/inbox")}
                      badge={notifications.unread > 0 ? `${notifications.unread}` : undefined}
                    />
                    <QuickActionCard
                      title={t("dashboard.shortcuts.pricing.title")}
                      description={t("dashboard.shortcuts.pricing.description")}
                      icon={Sparkles}
                      to={localize("/provider/pricing")}
                    />
                    <QuickActionCard
                      title={t("dashboard.shortcuts.finance.title")}
                      description={t("dashboard.shortcuts.finance.description")}
                      icon={CreditCard}
                      to={localize("/provider/finance")}
                    />
                    <QuickActionCard
                      title={t("dashboard.shortcuts.receipts.title")}
                      description={t("dashboard.shortcuts.receipts.description")}
                      icon={FileText}
                      to={localize("/provider/bilag")}
                    />
                    <QuickActionCard
                      title={t("dashboard.shortcuts.profile.title")}
                      description={t("dashboard.shortcuts.profile.description")}
                      icon={Settings}
                      to={localize("/provider/profile")}
                    />
                    <QuickActionCard
                      title={t("dashboard.shortcuts.support.title")}
                      description={t("dashboard.shortcuts.support.description")}
                      icon={LifeBuoy}
                      to={localize("/faq")}
                    />
                  </div>
                </SectionCard>
              </AppErrorBoundary>

              <AppErrorBoundary>
                <SectionCard
                  title={t("dashboard.keyFigures.title")}
                  description={t("dashboard.keyFigures.description")}
                  loading={data.loading}
                >
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <MiniStat
                      icon={CheckCircle2}
                      label={t("dashboard.keyFigures.accept")}
                      value={data.stats.acceptanceRate == null ? "—" : `${data.stats.acceptanceRate}%`}
                    />
                    <MiniStat
                      icon={AlertTriangle}
                      label={t("dashboard.keyFigures.cancellation")}
                      value={data.stats.cancellationRate == null ? "—" : `${data.stats.cancellationRate}%`}
                    />
                    <MiniStat icon={Clock} label={t("dashboard.keyFigures.responseTime")} value={responseText} />
                    <MiniStat
                      icon={Star}
                      label={t("dashboard.keyFigures.rating")}
                      value={data.stats.ratingAvg == null ? "—" : data.stats.ratingAvg.toFixed(1)}
                    />
                  </dl>
                  {data.profile?.provider_tier && (
                    <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-background/50 px-3 py-2">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("dashboard.keyFigures.tier")}</span>
                      <Badge variant="secondary" className="capitalize">
                        {data.profile.provider_tier.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  )}
                </SectionCard>
              </AppErrorBoundary>

              <AppErrorBoundary>
                <SectionCard
                  title={t("dashboard.payouts.title")}
                  action={
                    <Link
                      to={localize("/provider/finance")}
                      className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline"
                    >
                      {t("dashboard.payouts.seeAll")}
                    </Link>
                  }
                  loading={data.loading}
                  empty={!data.loading && data.payouts.length === 0}
                  emptyState={
                    <EmptyState
                      icon={Wallet}
                      title={t("dashboard.payouts.emptyTitle")}
                      description={t("dashboard.payouts.emptyDescription")}
                    />
                  }
                >
                  <ul className="space-y-2">
                    {data.payouts.slice(0, 4).map((p) => (
                      <PayoutRow key={p.id} payout={p} />
                    ))}
                  </ul>
                </SectionCard>
              </AppErrorBoundary>
            </div>
          </div>
        </div>
      </DashboardPage>
    </DashboardLayout>
  );
}

/* ---------- helpers ---------- */

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const STATUS_VARIANT: Record<
  ProviderBooking["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  accepted: "default",
  completed: "outline",
  declined: "destructive",
  cancelled: "outline",
};

function BookingRow({ booking, highlight }: { booking: ProviderBooking; highlight?: boolean }) {
  const { t } = useTranslation("provider");
  const localize = useCountryPath();
  const variant = STATUS_VARIANT[booking.status];
  const label = t(`booking.status.${booking.status}`);
  return (
    <li>
      <Link
        to={localize(`/booking/${booking.id}/plan`)}
        className={`block rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm ${
          highlight ? "border-primary/40 bg-primary/5" : "border-border bg-background/50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-base text-foreground">
              {booking.service ?? t("booking.defaultService")}
              {booking.hours ? ` ${t("booking.hoursSuffix", { count: booking.hours })}` : ""}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {booking.currency && typeof booking.provider_gets === "number"
                ? t("booking.providerGets", { amount: formatMoney(booking.provider_gets, booking.currency) })
                : ""}
            </p>
          </div>
          <Badge variant={variant} className="shrink-0">
            {label}
          </Badge>
        </div>
        <dl className="mt-3 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            <span>{formatDate(booking.booking_date)}</span>
          </div>
          {booking.slot && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              <span>{t("booking.atSlot", { slot: booking.slot })}</span>
            </div>
          )}
          {booking.address && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{booking.address}</span>
            </div>
          )}
        </dl>
      </Link>
    </li>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span>{label}</span>
      </div>
      <p className="mt-1 font-display text-xl text-foreground">{value}</p>
    </div>
  );
}

const PAYOUT_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  paid: "default",
  in_transit: "secondary",
  pending: "secondary",
  failed: "destructive",
  canceled: "outline",
};

function PayoutRow({ payout }: { payout: ProviderPayout }) {
  const { t } = useTranslation("provider");
  const variant = PAYOUT_VARIANT[payout.status] ?? ("outline" as const);
  const label = PAYOUT_VARIANT[payout.status]
    ? t(`payout.status.${payout.status}`)
    : payout.status;
  const amount =
    payout.currency && typeof payout.net_amount === "number"
      ? formatMoney(payout.net_amount, payout.currency)
      : "—";
  return (
    <li className="flex items-center justify-between rounded-xl border border-border bg-background/50 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{amount}</p>
        <p className="text-xs text-muted-foreground">
          {payout.arrival_date
            ? new Date(payout.arrival_date).toLocaleDateString("da-DK")
            : new Date(payout.created_at).toLocaleDateString("da-DK")}
        </p>
      </div>
      <Badge variant={variant}>{label}</Badge>
    </li>
  );
}

interface VerificationSummary {
  showBanner: boolean;
  title: string;
  description: string;
  actions: Array<{ label: string; to: string; primary?: boolean }>;
}

function describeVerification(
  pp: ReturnType<typeof useProviderDashboard>["profile"],
  t: TFunction,
): VerificationSummary {
  if (!pp) {
    return { showBanner: false, title: "", description: "", actions: [] };
  }
  const needsIdentity = pp.identity_status !== "approved";
  const needsStripe = !pp.stripe_charges_enabled || !pp.stripe_payouts_enabled;
  const needsPublic = !pp.is_public || pp.visibility !== "public";

  if (needsIdentity) {
    return {
      showBanner: true,
      title: t("verification.identity.title"),
      description: t("verification.identity.description"),
      actions: [{ label: t("verification.identity.action"), to: "/verify-identity", primary: true }],
    };
  }
  if (needsStripe) {
    return {
      showBanner: true,
      title: t("verification.stripe.title"),
      description: t("verification.stripe.description"),
      actions: [{ label: t("verification.stripe.action"), to: "/provider/finance", primary: true }],
    };
  }
  if (needsPublic) {
    return {
      showBanner: true,
      title: t("verification.public.title"),
      description: t("verification.public.description"),
      actions: [{ label: t("verification.public.action"), to: "/provider/profile", primary: true }],
    };
  }
  if (typeof pp.completion_pct === "number" && pp.completion_pct < 100) {
    return {
      showBanner: true,
      title: t("verification.completion.title", { percent: pp.completion_pct }),
      description: t("verification.completion.description"),
      actions: [{ label: t("verification.completion.action"), to: "/provider/profile" }],
    };
  }
  return { showBanner: false, title: "", description: "", actions: [] };
}
