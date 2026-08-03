import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Inbox,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { MissionControlLayout, useMissionControlData } from "@/components/mission-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatMoney, formatNumber } from "@/i18n/money";
import { useCountryPath } from "@/lib/countryPath";
import { cn } from "@/lib/utils";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("da-DK", { day: "2-digit", month: "short" });

const relative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "lige nu";
  if (min < 60) return `${min} min siden`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} t siden`;
  return `${Math.round(h / 24)} d siden`;
};

interface MetricProps {
  label: string;
  value: string;
  hint?: string;
  to?: string;
  tone?: "default" | "warning" | "danger" | "success";
  icon?: React.ReactNode;
}

const Metric = ({ label, value, hint, to, tone = "default", icon }: MetricProps) => {
  const localize = useCountryPath();
  const body = (
    <div
      className={cn(
        "group flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-colors",
        to && "hover:border-[hsl(var(--mission-nav-accent))]/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p
        className={cn(
          "mt-3 text-2xl font-semibold tracking-tight tabular-nums",
          tone === "warning" && "text-[hsl(var(--warning))]",
          tone === "danger" && "text-[hsl(var(--destructive))]",
          tone === "success" && "text-[hsl(var(--success))]",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return to ? (
    <Link to={localize(to)} className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
};

const Panel = ({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

export default function MissionControl() {
  const { data, isLoading, isError, refetch, isFetching } = useMissionControlData();
  const localize = useCountryPath();

  const currency = data?.currency ?? null;
  const money = (minor: number) => (currency ? formatMoney(minor, currency) : formatNumber(minor / 100));

  const chartData = (data?.series.daily ?? []).map((d) => ({
    date: shortDate(d.date),
    omsætning: d.gross_minor / 100,
    gebyr: d.fee_minor / 100,
    bookinger: d.bookings,
  }));
  const hasRevenue = chartData.some((d) => d.omsætning > 0);
  const hasBookings = chartData.some((d) => d.bookinger > 0);
  const countries = data?.series.countries ?? [];
  const growth = (data?.series.customer_growth ?? []).map((d, i) => ({
    date: shortDate(d.date),
    kunder: d.cumulative,
    providere: data?.series.provider_growth[i]?.cumulative ?? 0,
  }));
  const hasGrowth = growth.some((g) => g.kunder > 0 || g.providere > 0);
  const activity = data?.activity ?? [];

  return (
    <MissionControlLayout>
      <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Mission Control</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data
                ? `Live platformdata · opdateret ${relative(data.generated_at)}`
                : "Live platformdata"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="min-h-11"
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} aria-hidden />
            Opdatér
          </Button>
        </div>

        {isError && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-foreground"
          >
            Kunne ikke hente platformdata. Prøv at opdatere.
          </div>
        )}

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* Revenue */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Omsætning i dag"
                value={money(data.revenue.today.gross_minor)}
                hint={`${formatNumber(data.revenue.today.count)} bookinger · gebyr ${money(data.revenue.today.fee_minor)}`}
                icon={<Banknote className="h-4 w-4" aria-hidden />}
              />
              <Metric
                label="Omsætning 7 dage"
                value={money(data.revenue.week.gross_minor)}
                hint={`Gebyr ${money(data.revenue.week.fee_minor)}`}
              />
              <Metric
                label="Omsætning denne måned"
                value={money(data.revenue.month.gross_minor)}
                hint={`Gebyr ${money(data.revenue.month.fee_minor)}`}
                to="/admin/finance"
              />
              <Metric
                label="Bookinger i dag"
                value={formatNumber(data.bookings.today)}
                hint={`${formatNumber(data.bookings.active)} aktive`}
                to="/support/bookings"
                icon={<CalendarClock className="h-4 w-4" aria-hidden />}
              />
            </div>

            {/* Operations */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Afventer accept"
                value={formatNumber(data.bookings.pending)}
                tone={data.bookings.pending > 0 ? "warning" : "default"}
                to="/support/bookings"
              />
              <Metric
                label="Gennemført 30 dage"
                value={formatNumber(data.bookings.completed_30d)}
                hint={
                  data.bookings.completion_rate != null
                    ? `${Math.round(data.bookings.completion_rate * 100)} % af oprettede`
                    : undefined
                }
                icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
              />
              <Metric
                label="Annulleret 30 dage"
                value={formatNumber(data.bookings.cancelled_30d)}
                hint={
                  data.bookings.cancellation_rate != null
                    ? `${Math.round(data.bookings.cancellation_rate * 100)} % annulleringsrate`
                    : undefined
                }
                tone={data.bookings.cancelled_30d > 0 ? "warning" : "default"}
              />
              <Metric
                label="Refunderingsanmodninger"
                value={formatNumber(data.support.open_refund_requests)}
                tone={data.support.open_refund_requests > 0 ? "warning" : "default"}
                to="/support/cases"
              />
            </div>

            {/* People & support */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Kunder"
                value={formatNumber(data.people.customers)}
                hint={`${formatNumber(data.people.new_signups_7d)} nye på 7 dage`}
                icon={<Users className="h-4 w-4" aria-hidden />}
              />
              <Metric
                label="Aktive providere"
                value={formatNumber(data.people.providers_active)}
                to="/admin/providers"
              />
              <Metric
                label="Afventer verifikation"
                value={formatNumber(data.people.pending_review + data.people.pending_identity)}
                hint={`${formatNumber(data.people.pending_review)} til gennemgang · ${formatNumber(data.people.pending_identity)} identitet`}
                tone={data.people.pending_review > 0 ? "warning" : "default"}
                to="/admin/providers"
                icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
              />
              <Metric
                label="Åbne samtaler"
                value={formatNumber(data.support.open_conversations)}
                to="/support/inbox"
                icon={<Inbox className="h-4 w-4" aria-hidden />}
              />
            </div>

            {/* Platform health */}
            <Panel
              title="Platformstatus"
              description="Seneste 24 timer"
              action={
                <Button asChild variant="ghost" size="sm" className="min-h-11">
                  <Link to={localize("/admin/ops")}>
                    Ops-konsol <ArrowUpRight className="ml-1 h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              }
            >
              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <HealthStat
                  label="Webhooks fejlet"
                  value={data.health.webhooks_failed_24h}
                  total={data.health.webhooks_24h}
                />
                <HealthStat
                  label="E-mails fejlet"
                  value={data.health.emails_failed_24h}
                  total={data.health.emails_24h}
                />
                <HealthStat label="SMS fejlet" value={data.health.sms_failed_24h} />
                <HealthStat label="Notifikationskø" value={data.health.notification_backlog} />
                <HealthStat label="Fejlhændelser" value={data.health.errors_24h} />
                <HealthStat label="Åbne systemadvarsler" value={data.health.open_alerts} />
              </dl>

              {data.alerts.length > 0 && (
                <ul className="mt-5 space-y-2">
                  {data.alerts.slice(0, 5).map((a) => (
                    <li
                      key={a.id}
                      className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3"
                    >
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{a.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.severity} · {a.source} · {relative(a.last_seen_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Charts */}
            <div className="grid gap-4 xl:grid-cols-2">
              {hasRevenue && (
                <Panel title="Omsætning" description="30 dage">
                  <ChartFrame>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="mcRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--mission-nav-accent))" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="hsl(var(--mission-nav-accent))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={56} />
                      <ReTooltip contentStyle={{ borderRadius: 12, borderColor: "hsl(var(--border))" }} />
                      <Area
                        type="monotone"
                        dataKey="omsætning"
                        stroke="hsl(var(--mission-nav-accent))"
                        strokeWidth={2}
                        fill="url(#mcRevenue)"
                      />
                    </AreaChart>
                  </ChartFrame>
                </Panel>
              )}

              {hasBookings && (
                <Panel title="Bookinger" description="30 dage">
                  <ChartFrame>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} allowDecimals={false} />
                      <ReTooltip contentStyle={{ borderRadius: 12, borderColor: "hsl(var(--border))" }} />
                      <Bar dataKey="bookinger" fill="hsl(var(--mission-nav-active))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartFrame>
                </Panel>
              )}

              {hasGrowth && (
                <Panel title="Vækst" description="Kumulativt, 30 dage">
                  <ChartFrame>
                    <LineChart data={growth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} allowDecimals={false} />
                      <ReTooltip contentStyle={{ borderRadius: 12, borderColor: "hsl(var(--border))" }} />
                      <Line type="monotone" dataKey="kunder" stroke="hsl(var(--mission-nav-accent))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="providere" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartFrame>
                </Panel>
              )}

              {countries.length > 0 && (
                <Panel title="Lande" description="Bookinger, 30 dage">
                  <ul className="space-y-3">
                    {countries.map((c) => {
                      const max = countries[0].bookings || 1;
                      return (
                        <li key={c.country_code} className="flex items-center gap-3">
                          <span className="w-10 shrink-0 text-sm font-medium text-foreground">
                            {c.country_code}
                          </span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-[hsl(var(--mission-nav-accent))]"
                              style={{ width: `${Math.max(4, (c.bookings / max) * 100)}%` }}
                            />
                          </span>
                          <span className="w-12 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                            {formatNumber(c.bookings)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
              )}
            </div>

            {activity.length > 0 && (
              <Panel title="Live aktivitet" description="Seneste booking-hændelser">
                <ul className="divide-y divide-border">
                  {activity.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {e.to_state}
                      </span>
                      <Link
                        to={localize(`/support/bookings?booking=${e.booking_id}`)}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline-offset-2 hover:underline sm:min-h-0"
                      >
                        Booking {e.booking_id.slice(0, 8)}
                      </Link>

                      <span className="text-xs text-muted-foreground">
                        {e.from_state ? `${e.from_state} → ${e.to_state}` : e.to_state} · {e.actor_role}
                      </span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {relative(e.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </>
        )}
      </div>
    </MissionControlLayout>
  );
}

const ChartFrame = ({ children }: { children: React.ReactElement }) => (
  <div className="h-56 w-full">
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  </div>
);

const HealthStat = ({ label, value, total }: { label: string; value: number; total?: number }) => (
  <div className="rounded-xl border border-border bg-muted/30 p-4">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd
      className={cn(
        "mt-1 text-lg font-semibold tabular-nums",
        value > 0 ? "text-[hsl(var(--warning))]" : "text-foreground",
      )}
    >
      {formatNumber(value)}
      {total != null && <span className="ml-1 text-xs font-normal text-muted-foreground">/ {formatNumber(total)}</span>}
    </dd>
  </div>
);
