import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import {
  Calendar,
  Clock,
  FileText,
  Heart,
  LifeBuoy,
  ListChecks,
  MapPin,
  MessageSquare,
  Sparkles,
  UserCircle,
  Wallet,
  Bell,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/components/Inbox";
import { useCustomerDashboard, type CustomerBooking } from "@/hooks/useCustomerDashboard";
import { formatMoney } from "@/i18n/money";
import { useCountryPath } from "@/lib/countryPath";

/**
 * CustomerDashboardV2 — Phase 1 v1.
 *
 * Uses design-system tokens only. Real data via `useCustomerDashboard`
 * (parallel queries against `profiles` and `bookings`). No mock data.
 * Deferred sections render `<ComingSoonCard>` so nothing fabricated
 * reaches the customer.
 */
export default function CustomerDashboardV2() {
  const { t } = useTranslation("customer");
  const { user } = useAuth();
  const data = useCustomerDashboard();
  const notifications = useNotifications();
  const localize = useCountryPath();

  const nextBooking = data.upcoming[0] ?? null;
  const recentHistory = useMemo(() => data.history.slice(0, 4), [data.history]);

  const totalSpent =
    data.stats.currency && data.stats.totalSpentMinor > 0
      ? formatMoney(data.stats.totalSpentMinor, data.stats.currency)
      : "—";

  return (
    <DashboardLayout role="customer" title="Kunde">
      <DashboardPage
        title="Dashboard"
        description={t("surfaces.dashboard.description")}
      >
        <div className="grid gap-5 lg:gap-6">
          {data.error && (
            <SectionErrorState
              message={data.error}
              onRetry={data.refetch}
              compact
            />
          )}

          <AppErrorBoundary>
            <WelcomeHeader
              greeting="Velkommen tilbage"
              name={data.firstName}
              completion={data.profileCompletion}
              loading={data.loading}
              subtitle={
                nextBooking
                  ? `Din næste booking er ${formatDate(nextBooking.booking_date)}${nextBooking.slot ? ` kl. ${nextBooking.slot}` : ""}.`
                  : "Du har ingen kommende bookinger. Find en cleaner, når du er klar."
              }
              actions={
                <Button asChild size="sm">
                  <Link to={localize("/book")}>{t("surfaces.dashboard.bookCleaning")}</Link>
                </Button>
              }
            />
          </AppErrorBoundary>

          {!data.loading && (data.missing.phone || data.missing.address) && (
            <AppErrorBoundary>
              <SectionCard
                title={t("surfaces.dashboard.complete.title")}
                description={t("surfaces.dashboard.complete.description")}
              >
                <div className="flex flex-wrap gap-2">
                  {data.missing.phone && (
                    <Button asChild size="sm" variant="outline">
                      <Link to={localize("/customer/profile?edit=contact")}>
                        <Phone className="mr-2 h-4 w-4" aria-hidden />
                        {t("surfaces.dashboard.complete.addPhone")}
                      </Link>
                    </Button>
                  )}
                  {data.missing.address && (
                    <Button asChild size="sm" variant="outline">
                      <Link to={localize("/customer/profile?edit=addresses")}>
                        <MapPin className="mr-2 h-4 w-4" aria-hidden />
                        {t("surfaces.dashboard.complete.addAddress")}
                      </Link>
                    </Button>
                  )}
                </div>
              </SectionCard>
            </AppErrorBoundary>
          )}



          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Kommende"
              value={data.stats.upcoming}
              icon={Calendar}
              loading={data.loading}
            />
            <StatCard
              label={t("surfaces.dashboard.stats.completed")}
              value={data.stats.completed}
              icon={ListChecks}
              loading={data.loading}
            />
            <StatCard
              label={t("surfaces.dashboard.stats.totalSpent")}
              value={totalSpent}
              icon={Wallet}
              loading={data.loading}
            />
            <StatCard
              label={t("surfaces.dashboard.stats.memberSince")}
              value={memberSince(user?.created_at)}
              icon={UserCircle}
              loading={data.loading}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
            {/* Left: bookings + history */}
            <div className="space-y-5 lg:col-span-2 lg:space-y-6">
              <AppErrorBoundary>
                <SectionCard
                  title={t("surfaces.dashboard.upcoming.title")}
                  action={
                    <Link
                      to={localize("/customer/bookings")}
                      className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline"
                    >
                      Se alle
                    </Link>
                  }
                  loading={data.loading}
                  empty={!data.loading && data.upcoming.length === 0}
                  emptyState={
                    <EmptyState
                      icon={Calendar}
                      title={t("surfaces.dashboard.upcoming.emptyTitle")}
                      description={t("surfaces.dashboard.upcoming.emptyDescription")}
                      action={
                        <Button asChild>
                          <Link to={localize("/find-cleaner")}>{t("surfaces.dashboard.upcoming.findCleaner")}</Link>
                        </Button>
                      }
                    />
                  }
                >
                  <ul className="space-y-3">
                    {data.upcoming.slice(0, 3).map((b) => (
                      <BookingRow key={b.id} booking={b} highlight={b.id === nextBooking?.id} />
                    ))}
                  </ul>
                </SectionCard>
              </AppErrorBoundary>

              <AppErrorBoundary>
                <SectionCard
                  title={t("surfaces.dashboard.history.title")}
                  description={t("surfaces.dashboard.history.description")}
                  action={
                    <Link
                      to={localize("/customer/bookings")}
                      className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline"
                    >
                      Se alle
                    </Link>
                  }
                  loading={data.loading}
                  empty={!data.loading && recentHistory.length === 0}
                  emptyState={
                    <EmptyState
                      icon={FileText}
                      title={t("surfaces.dashboard.history.emptyTitle")}
                      description={t("surfaces.dashboard.history.emptyDescription")}
                    />
                  }
                >
                  <ul className="space-y-3">
                    {recentHistory.map((b) => (
                      <BookingRow key={b.id} booking={b} />
                    ))}
                  </ul>
                </SectionCard>
              </AppErrorBoundary>

              <AppErrorBoundary>
                <ComingSoonCard
                  title={t("surfaces.dashboard.feed.title")}
                  description={t("surfaces.dashboard.feed.description")}
                />
              </AppErrorBoundary>
            </div>

            {/* Right: quick actions + notifications */}
            <div className="space-y-5 lg:space-y-6">
              <AppErrorBoundary>
                <SectionCard title="Genveje">
                  <div className="grid gap-3">
                    <QuickActionCard
                      title={t("surfaces.dashboard.quickActions.book.title")}
                      description={t("surfaces.dashboard.quickActions.book.description")}
                      icon={Sparkles}
                      to={localize("/book")}
                    />
                    <QuickActionCard
                      title={t("surfaces.dashboard.quickActions.bookings.title")}
                      description={t("surfaces.dashboard.quickActions.bookings.description")}
                      icon={ListChecks}
                      to={localize("/customer/bookings")}
                    />
                    <QuickActionCard
                      title="Beskeder"
                      description={t("surfaces.dashboard.quickActions.messages.description")}
                      icon={MessageSquare}
                      to={localize("/customer/notifications")}
                      badge={notifications.unread > 0 ? `${notifications.unread}` : undefined}
                    />
                    <QuickActionCard
                      title="Favoritter"
                      description={t("surfaces.dashboard.quickActions.favorites.description")}
                      icon={Heart}
                      to={localize("/find-cleaner")}
                    />
                    <QuickActionCard
                      title="Fakturaer"
                      description={t("surfaces.dashboard.quickActions.invoices.description")}
                      icon={FileText}
                      to={localize("/customer/invoices")}
                    />
                    <QuickActionCard
                      title="Support"
                      description={t("surfaces.dashboard.quickActions.support.description")}
                      icon={LifeBuoy}
                      to={localize("/faq")}
                    />
                  </div>
                </SectionCard>
              </AppErrorBoundary>

              <AppErrorBoundary>
                <SectionCard
                  title="Notifikationer"
                  action={
                    <Link
                      to={localize("/customer/notifications")}
                      className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline"
                    >
                      Åbn inbox
                    </Link>
                  }
                  loading={notifications.loading}
                  empty={!notifications.loading && notifications.items.length === 0}
                  emptyState={
                    <EmptyState
                      icon={Bell}
                      title={t("surfaces.dashboard.notifications.emptyTitle")}
                      description={t("surfaces.dashboard.notifications.emptyDescription")}
                    />
                  }
                >
                  <ul className="space-y-2">
                    {notifications.items.slice(0, 4).map((n) => (
                      <li
                        key={n.id}
                        className="rounded-xl border border-border bg-background/50 p-3"
                      >
                        <p className="text-sm font-medium text-foreground">{n.title}</p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                      </li>
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

/* -------- helpers -------- */

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function memberSince(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("da-DK", { month: "short", year: "numeric" });
}

const STATUS_META: Record<
  CustomerBooking["status"],
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  pending: { label: "Afventer provider", variant: "secondary" },
  accepted: { label: "Accepteret", variant: "default" },
  completed: { label: "Udført", variant: "outline" },
  declined: { label: "Afvist", variant: "destructive" },
  cancelled: { label: "Annulleret", variant: "outline" },
};

function BookingRow({ booking, highlight }: { booking: CustomerBooking; highlight?: boolean }) {
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
              {booking.provider_name ?? "Cleaner"}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {booking.service ?? "Rengøring"}
              {booking.hours ? ` · ${booking.hours} t` : ""}
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
            <div className="flex items-center gap-1.5 sm:col-span-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{booking.address}</span>
            </div>
          )}
        </dl>
      </Link>
    </li>
  );
}

/** Router uses this to check if legacy mode is requested. */
export function useCustomerDashboardLegacy() {
  const [params] = useSearchParams();
  return params.get("legacy") === "1";
}
