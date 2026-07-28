import { useMemo } from "react";
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
  StatCard,
  WelcomeHeader,
} from "@/components/dashboard/primitives";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
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
  const data = useProviderDashboard();
  const notifications = useNotifications();

  const nextJob = data.upcoming[0] ?? null;
  const earnings =
    data.stats.currency && data.stats.earningsMinor > 0
      ? formatMoney(data.stats.earningsMinor, data.stats.currency)
      : "—";

  const responseText = useMemo(() => {
    const s = data.stats.avgResponseSeconds;
    if (s == null) return "—";
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)} min`;
    return `${Math.round(s / 3600)} t`;
  }, [data.stats.avgResponseSeconds]);

  const verification = describeVerification(data.profile);

  return (
    <DashboardLayout role="provider" title="Cleaner">
      <DashboardPage
        title="Dashboard"
        description="Overblik over dine jobs, indtjening og profilstatus."
      >
        <div className="grid gap-5 lg:gap-6">
          <AppErrorBoundary>
            <WelcomeHeader
              greeting="Cleaner-dashboard"
              name={data.firstName}
              completion={data.profile?.completion_pct ?? null}
              loading={data.loading}
              subtitle={
                nextJob
                  ? `Næste job: ${formatDate(nextJob.booking_date)}${nextJob.slot ? ` kl. ${nextJob.slot}` : ""}.`
                  : data.openRequests.length
                    ? `Du har ${data.openRequests.length} åbne anmodning${data.openRequests.length === 1 ? "" : "er"} — svar hurtigt for bedre placering.`
                    : "Ingen kommende jobs. Sørg for at din profil er komplet og synlig."
              }
              actions={
                <Button asChild size="sm" variant="outline">
                  <Link to="/provider/profile">Rediger profil</Link>
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
                      <Link to={a.to}>{a.label}</Link>
                    </Button>
                  ))}
                </div>
              </div>
            </AppErrorBoundary>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Gennemførte jobs"
              value={data.stats.completed}
              icon={ListChecks}
              loading={data.loading}
            />
            <StatCard
              label="Indtjening"
              value={earnings}
              hint={data.stats.completed ? "Fra gennemførte jobs" : undefined}
              icon={Wallet}
              loading={data.loading}
            />
            <StatCard
              label="Accept-rate"
              value={data.stats.acceptanceRate == null ? "—" : `${data.stats.acceptanceRate}%`}
              hint={data.stats.acceptanceRate == null ? "Ingen tilbud endnu" : undefined}
              icon={TrendingUp}
              loading={data.loading}
            />
            <StatCard
              label="Svartid"
              value={responseText}
              hint={data.stats.avgResponseSeconds == null ? "Ingen svar endnu" : "Gennemsnit"}
              icon={Clock}
              loading={data.loading}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
            {/* Left column */}
            <div className="space-y-5 lg:col-span-2 lg:space-y-6">
              <AppErrorBoundary>
                <SectionCard
                  title="I dag"
                  description="Dine planlagte jobs i dag."
                  loading={data.loading}
                  empty={!data.loading && data.todaysSchedule.length === 0}
                  emptyState={
                    <EmptyState
                      icon={CalendarClock}
                      title="Ingen jobs i dag"
                      description="Nyd en pause — eller opdater din tilgængelighed for flere anmodninger."
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
                  title="Åbne anmodninger"
                  description="Svar hurtigt for bedre placering i marketplace."
                  action={
                    <Link
                      to="/provider-dashboard?legacy=1"
                      className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline"
                    >
                      Klassisk visning
                    </Link>
                  }
                  loading={data.loading}
                  empty={!data.loading && data.openRequests.length === 0}
                  emptyState={
                    <EmptyState
                      icon={Inbox}
                      title="Ingen åbne anmodninger"
                      description="Nye anmodninger dukker op her i realtid."
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
                  title="Kommende jobs"
                  loading={data.loading}
                  empty={!data.loading && data.upcoming.length === 0}
                  emptyState={
                    <EmptyState
                      icon={Calendar}
                      title="Ingen kommende jobs"
                      description="Accepterede jobs vises her indtil de er gennemført."
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
                  title="Anmeldelser"
                  description="Ratings og skriftlige anmeldelser fra dine kunder."
                >
                  <ComingSoonCard
                    title="Rating & anmeldelser"
                    description="Vi aktiverer stjerner og skriftlige anmeldelser når review-motoren går live. Indtil da vises kun jobs og indtjening."
                  />
                </SectionCard>
              </AppErrorBoundary>
            </div>

            {/* Right column */}
            <div className="space-y-5 lg:space-y-6">
              <AppErrorBoundary>
                <SectionCard title="Genveje">
                  <div className="grid gap-3">
                    <QuickActionCard
                      title="Beskeder"
                      description="Chat med kunder"
                      icon={MessageSquare}
                      to="/inbox"
                      badge={notifications.unread > 0 ? `${notifications.unread}` : undefined}
                    />
                    <QuickActionCard
                      title="Priser"
                      description="Juster timepris og pakker"
                      icon={Sparkles}
                      to="/provider/pricing"
                    />
                    <QuickActionCard
                      title="Økonomi"
                      description="Payouts og statements"
                      icon={CreditCard}
                      to="/provider/finance"
                    />
                    <QuickActionCard
                      title="Bilag"
                      description="Kvitteringer og udgifter"
                      icon={FileText}
                      to="/provider/bilag"
                    />
                    <QuickActionCard
                      title="Profil"
                      description="Rediger din offentlige profil"
                      icon={Settings}
                      to="/provider/profile"
                    />
                    <QuickActionCard
                      title="Support"
                      description="Vi hjælper dig"
                      icon={LifeBuoy}
                      to="/faq"
                    />
                  </div>
                </SectionCard>
              </AppErrorBoundary>

              <AppErrorBoundary>
                <SectionCard
                  title="Nøgletal"
                  description="Baseret på reelle bookinger og tilbud."
                  loading={data.loading}
                >
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <MiniStat
                      icon={CheckCircle2}
                      label="Accept"
                      value={data.stats.acceptanceRate == null ? "—" : `${data.stats.acceptanceRate}%`}
                    />
                    <MiniStat
                      icon={AlertTriangle}
                      label="Annullering"
                      value={data.stats.cancellationRate == null ? "—" : `${data.stats.cancellationRate}%`}
                    />
                    <MiniStat icon={Clock} label="Svartid" value={responseText} />
                    <MiniStat
                      icon={Star}
                      label="Rating"
                      value={data.stats.ratingAvg == null ? "—" : data.stats.ratingAvg.toFixed(1)}
                    />
                  </dl>
                  {data.profile?.provider_tier && (
                    <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-background/50 px-3 py-2">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Tier</span>
                      <Badge variant="secondary" className="capitalize">
                        {data.profile.provider_tier.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  )}
                </SectionCard>
              </AppErrorBoundary>

              <AppErrorBoundary>
                <SectionCard
                  title="Payout status"
                  action={
                    <Link
                      to="/provider/finance"
                      className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline"
                    >
                      Se alle
                    </Link>
                  }
                  loading={data.loading}
                  empty={!data.loading && data.payouts.length === 0}
                  emptyState={
                    <EmptyState
                      icon={Wallet}
                      title="Ingen payouts endnu"
                      description="Din første udbetaling vises her når et job er afsluttet og frigivet."
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

const STATUS_META: Record<
  ProviderBooking["status"],
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  pending: { label: "Ny anmodning", variant: "secondary" },
  accepted: { label: "Accepteret", variant: "default" },
  completed: { label: "Udført", variant: "outline" },
  declined: { label: "Afvist", variant: "destructive" },
  cancelled: { label: "Annulleret", variant: "outline" },
};

function BookingRow({ booking, highlight }: { booking: ProviderBooking; highlight?: boolean }) {
  const meta = STATUS_META[booking.status];
  return (
    <li>
      <Link
        to={`/booking/${booking.id}/plan`}
        className={`block rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm ${
          highlight ? "border-primary/40 bg-primary/5" : "border-border bg-background/50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-base text-foreground">
              {booking.service ?? "Rengøring"}
              {booking.hours ? ` · ${booking.hours} t` : ""}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {booking.currency && typeof booking.provider_gets === "number"
                ? `Du får ${formatMoney(booking.provider_gets, booking.currency)}`
                : ""}
            </p>
          </div>
          <Badge variant={meta.variant} className="shrink-0">
            {meta.label}
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
              <span>kl. {booking.slot}</span>
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

const PAYOUT_META: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  paid: { label: "Udbetalt", variant: "default" },
  in_transit: { label: "Undervejs", variant: "secondary" },
  pending: { label: "Afventer", variant: "secondary" },
  failed: { label: "Fejlet", variant: "destructive" },
  canceled: { label: "Annulleret", variant: "outline" },
};

function PayoutRow({ payout }: { payout: ProviderPayout }) {
  const meta = PAYOUT_META[payout.status] ?? { label: payout.status, variant: "outline" as const };
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
      <Badge variant={meta.variant}>{meta.label}</Badge>
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
      title: "Verificér din identitet",
      description: "Vi skal bekræfte din identitet før du kan modtage bookinger.",
      actions: [{ label: "Start verifikation", to: "/provider/profile", primary: true }],
    };
  }
  if (needsStripe) {
    return {
      showBanner: true,
      title: "Fuldfør Stripe-onboarding",
      description: "Tilslut din bankkonto for at kunne modtage udbetalinger.",
      actions: [{ label: "Åbn Stripe", to: "/provider/finance", primary: true }],
    };
  }
  if (needsPublic) {
    return {
      showBanner: true,
      title: "Din profil er ikke synlig",
      description: "Aktivér offentlig visning for at modtage anmodninger fra kunder.",
      actions: [{ label: "Rediger profil", to: "/provider/profile", primary: true }],
    };
  }
  if (typeof pp.completion_pct === "number" && pp.completion_pct < 100) {
    return {
      showBanner: true,
      title: `Din profil er ${pp.completion_pct}% færdig`,
      description: "Fuldfør din profil for bedre placering i marketplace.",
      actions: [{ label: "Færdiggør", to: "/provider/profile" }],
    };
  }
  return { showBanner: false, title: "", description: "", actions: [] };
}
