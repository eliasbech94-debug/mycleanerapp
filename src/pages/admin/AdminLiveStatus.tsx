/**
 * Admin → Live Status analytics.
 *
 * Distinguishes clearly between:
 *  • Live Status — derived from calendar, working hours and booking lifecycle.
 *  • Online presence — derived from the provider app heartbeat only.
 * Presence is never presented as proof of booking availability.
 */
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RefreshCw, Info } from "lucide-react";
import { MissionControlLayout } from "@/components/mission-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_META, type ProviderStatusKey } from "@/lib/providerStatus";
import {
  useLiveStatusAnalytics,
  type LiveStatusFilters,
  type LiveStatusRangeKey,
} from "@/hooks/useLiveStatusAnalytics";
import { cn } from "@/lib/utils";

const RANGES: { key: LiveStatusRangeKey; label: string }[] = [
  { key: "today", label: "I dag" },
  { key: "7d", label: "7 dage" },
  { key: "30d", label: "30 dage" },
  { key: "custom", label: "Brugerdefineret" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Alle statusser" },
  ...(Object.keys(STATUS_META) as ProviderStatusKey[]).map((k) => ({
    value: k,
    label: STATUS_META[k].label,
  })),
];

const Stat = ({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) => (
  <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
    <p className="truncate text-xs text-muted-foreground">{label}</p>
    <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</p>
    {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

const num = (v: number | null | undefined, suffix = "") =>
  v === null || v === undefined ? "—" : `${v}${suffix}`;

export default function AdminLiveStatus() {
  const [range, setRange] = useState<LiveStatusRangeKey>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [providerUserId, setProviderUserId] = useState("");
  const [status, setStatus] = useState("");

  const filters = useMemo<LiveStatusFilters>(
    () => ({ range, from, to, country, city, providerUserId, status }),
    [range, from, to, country, city, providerUserId, status],
  );
  const { data, loading, error, refresh } = useLiveStatusAnalytics(filters);

  const current = data?.current;

  return (
    <MissionControlLayout
      title="Live status"
      actions={
        <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Opdatér
        </Button>
      }
    >
      <div className="min-w-0 space-y-6">
        <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Live status</strong> kommer fra kalender, arbejdstider og bookingens livscyklus.{" "}
            <strong>Online</strong> viser kun, om providerens app har været åben for nylig — det er
            ikke dokumentation for, at provideren kan tage en booking.
          </span>
        </p>

        {/* Filters */}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Vælg periode">
            {RANGES.map((r) => (
              <Button
                key={r.key}
                size="sm"
                variant={range === r.key ? "default" : "outline"}
                className="min-h-[44px]"
                aria-pressed={range === r.key}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          {range === "custom" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Fra
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 min-h-[44px]" />
              </label>
              <label className="text-xs text-muted-foreground">
                Til
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 min-h-[44px]" />
              </label>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Land
              <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="DK" className="mt-1 min-h-[44px]" />
            </label>
            <label className="text-xs text-muted-foreground">
              By
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Alle byer" className="mt-1 min-h-[44px]" />
            </label>
            <label className="text-xs text-muted-foreground">
              Provider (bruger-ID)
              <Input value={providerUserId} onChange={(e) => setProviderUserId(e.target.value.trim())} placeholder="uuid" className="mt-1 min-h-[44px]" />
            </label>
            <label className="text-xs text-muted-foreground">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {loading && !data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            <section aria-labelledby="live-now" className="space-y-3">
              <h2 id="live-now" className="text-sm font-semibold">
                Live status nu
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Stat label="Tilgængelige" value={num(current?.available)} />
                <Stat label="Optaget" value={num(current?.busy)} />
                <Stat label="På vej" value={num(current?.travelling)} />
                <Stat label="Uden for arbejdstid" value={num(current?.off_hours)} />
                <Stat label="Utilgængelige" value={num(current?.unavailable)} />
                <Stat label="Online nu (app)" value={num(current?.online_now)} hint="Kun app-tilstedeværelse" />
              </div>
            </section>

            <section aria-labelledby="kpis" className="space-y-3">
              <h2 id="kpis" className="text-sm font-semibold">
                Nøgletal for perioden
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Median statusvarighed" value={num(data?.median_status_duration_minutes, " min")} />
                <Stat label="Gns. ledig tid pr. provider" value={num(data?.avg_available_minutes_per_provider, " min")} />
                <Stat label="Bookinger accepteret som ledig" value={num(data?.pct_accepted_while_available, " %")} />
                <Stat label="Gns. svartid mens online" value={num(data?.avg_response_minutes_while_online, " min")} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {num(data?.transitions)} registrerede statusskift i perioden.
              </p>
            </section>

            <section aria-labelledby="by-hour" className="space-y-3">
              <h2 id="by-hour" className="text-sm font-semibold">
                Statusfordeling pr. time
              </h2>
              <div className="min-w-0 rounded-2xl border border-border bg-card p-3">
                <div className="h-64 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.by_hour ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                      <ReTooltip />
                      <Bar dataKey="available" stackId="s" fill="hsl(var(--primary))" name="Tilgængelig" />
                      <Bar dataKey="busy" stackId="s" fill="hsl(var(--muted-foreground))" name="Optaget" />
                      <Bar dataKey="travelling" stackId="s" fill="hsl(var(--accent))" name="På vej" />
                      <Bar dataKey="off_hours" stackId="s" fill="hsl(var(--border))" name="Uden for arbejdstid" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section aria-labelledby="by-geo" className="grid gap-4 lg:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
                <h2 id="by-geo" className="mb-2 text-sm font-semibold">
                  Fordeling pr. land
                </h2>
                <ul className="space-y-1 text-sm">
                  {(data?.by_country ?? []).map((row) => (
                    <li key={String(row.country)} className="flex items-center justify-between gap-3">
                      <span className="truncate">{String(row.country)}</span>
                      <span className="tabular-nums text-muted-foreground">{String(row.events)}</span>
                    </li>
                  ))}
                  {!data?.by_country?.length && <li className="text-muted-foreground">Ingen data i perioden.</li>}
                </ul>
              </div>
              <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
                <h2 className="mb-2 text-sm font-semibold">Fordeling pr. by</h2>
                <ul className="space-y-1 text-sm">
                  {(data?.by_city ?? []).map((row) => (
                    <li key={String(row.city)} className="flex items-center justify-between gap-3">
                      <span className="truncate">{String(row.city)}</span>
                      <span className="tabular-nums text-muted-foreground">{String(row.events)}</span>
                    </li>
                  ))}
                  {!data?.by_city?.length && <li className="text-muted-foreground">Bydata er ikke tilgængelig endnu.</li>}
                </ul>
              </div>
            </section>

            <section aria-labelledby="events" className="space-y-3">
              <h2 id="events" className="text-sm font-semibold">
                Seneste statusskift
              </h2>
              <div className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="p-3">Tidspunkt</th>
                      <th scope="col" className="p-3">Provider</th>
                      <th scope="col" className="p-3">Skift</th>
                      <th scope="col" className="p-3">Kilde</th>
                      <th scope="col" className="p-3">Land</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recent_events ?? []).map((e) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="p-3 whitespace-nowrap">
                          {new Date(e.created_at).toLocaleString("da-DK")}
                        </td>
                        <td className="p-3 font-mono text-[11px]">{e.provider_user_id.slice(0, 8)}…</td>
                        <td className="p-3">
                          {e.previous_status ?? "—"} → <strong>{e.new_status}</strong>
                        </td>
                        <td className="p-3 text-muted-foreground">{e.source}</td>
                        <td className="p-3 text-muted-foreground">{e.country_code ?? "—"}</td>
                      </tr>
                    ))}
                    {!data?.recent_events?.length && (
                      <tr>
                        <td colSpan={5} className="p-4 text-muted-foreground">
                          Ingen statusskift registreret i perioden.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </MissionControlLayout>
  );
}
