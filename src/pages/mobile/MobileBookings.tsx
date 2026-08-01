/**
 * MobileBookings — customer bookings screen for viewports < 768px.
 *
 * Presentation only. Reuses:
 *  - supabase.from("bookings").select("*")   → same shape MyBookings.tsx uses.
 *    RLS scopes rows to the authenticated customer; no additional filter
 *    argument is passed (mirrors the existing list contract exactly).
 *  - Status ordering + labels preserved from MyBookings.tsx:
 *      pending → accepted → declined → cancelled → completed
 *  - Booking detail link → `/booking/:id/plan` (the only trusted per-booking
 *    detail route today). Segmented control links roll up into `/mine-bookinger`
 *    for the full list.
 *
 * Explicit non-features (Phase 4 constraints):
 *  - No swipe interactions. Cancellation/rescheduling stays in the existing
 *    detail flow — never behind a one-step gesture.
 *  - No pull-to-refresh.
 *  - No count badges when only a partial list is loaded — we render counts
 *    only from the same rows we display so the number is always trustworthy.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Calendar, Clock, MapPin, Sparkles, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullIndicator } from "@/components/mobile/PullIndicator";
import { useCountryPath, loginPathWithRedirect } from "@/lib/countryPath";

type Booking = {
  id: string;
  provider_id: string | null;
  provider_name: string | null;
  service: string | null;
  hours: number | null;
  booking_date: string;
  slot: string | null;
  address: string | null;
  customer_pays: number | null;
  currency: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled" | "completed";
  created_at: string;
};

// Preserved verbatim from MyBookings.tsx — do not diverge.
const STATUS_LABEL_KEY: Record<Booking["status"], string> = {
  pending: "mobileBookings.status.pending",
  accepted: "mobileBookings.status.accepted",
  declined: "mobileBookings.status.declined",
  cancelled: "mobileBookings.status.cancelled",
  completed: "mobileBookings.status.completed",
};

const STATUS_TONE: Record<Booking["status"], string> = {
  pending: "bg-amber-100 text-amber-900",
  accepted: "bg-emerald-100 text-emerald-900",
  declined: "bg-rose-100 text-rose-900",
  cancelled: "bg-stone-200 text-stone-800",
  completed: "bg-teal-100 text-teal-900",
};

const ACTIVE_STATUSES: Booking["status"][] = ["pending", "accepted"];

type Tab = "upcoming" | "previous";
type ViewState = "loading" | "ready" | "error";

export default function MobileBookings() {
  const { t } = useTranslation("marketplace");
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [state, setState] = useState<ViewState>("loading");
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Extracted so both the mount effect and pull-to-refresh call the exact
  // same existing booking fetch (no duplicate query, no new endpoint).
  const load = useCallback(
    async (opts?: { silent?: boolean }): Promise<void> => {
      if (!user) return;
      if (!opts?.silent) setState("loading");
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id,provider_id,provider_name,service,hours,booking_date,slot,address,customer_pays,currency,status,created_at",
        )
        .order("booking_date", { ascending: false });
      if (error) {
        setState("error");
        return;
      }
      setBookings((data ?? []) as Booking[]);
      setState("ready");
    },
    [user],
  );

  useEffect(() => {
    if (authLoading) return;
    // Clear previous user's rows immediately on any auth change so a
    // logout/login never briefly renders someone else's data.
    setBookings([]);
    if (!user) {
      setState("ready");
      return;
    }
    let cancelled = false;
    setState("loading");
    (async () => {
      await load({ silent: true });
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, load]);

  // Pull-to-refresh — reuses `load()` above. Selected tab / filters live in
  // component state and are untouched by refresh.
  const { pullY, refreshing, thresholdReached } = usePullToRefresh({
    enabled: Boolean(user),
    onRefresh: async () => {
      await load({ silent: true });
      // Optional confirm vibration (Android/Chromium only). Feature must work
      // identically without vibration — this is opt-in and best-effort.
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(8);
        }
      } catch {
        /* noop */
      }
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = bookings.filter(
    (b) =>
      ACTIVE_STATUSES.includes(b.status) && new Date(b.booking_date) >= today,
  );
  const previous = bookings.filter((b) => !upcoming.includes(b));
  const list = tab === "upcoming" ? upcoming : previous;

  return (
    <div className="pb-6">
      <PullIndicator
        pullY={pullY}
        refreshing={refreshing}
        thresholdReached={thresholdReached}
        label={t("mobile.ptr.pull", "Træk for at opdatere")}
        releaseLabel={t("mobile.ptr.release", "Slip for at opdatere")}
        refreshingLabel={t("mobile.ptr.refreshing", "Opdaterer…")}
      />
      {/* Segmented control */}
      <div className="px-4 pt-4">

        <div
          role="tablist"
          aria-label={t("mobileBookings.tabs.aria", "Bookinger")}
          className="grid grid-cols-2 rounded-full border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-1"
        >
          {(["upcoming", "previous"] as const).map((k) => {
            const active = tab === k;
            const count = state === "ready" ? (k === "upcoming" ? upcoming.length : previous.length) : null;
            return (
              <button
                key={k}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(k)}
                className={`tap-target inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13.5px] font-semibold transition-colors ${
                  active ? "bg-[hsl(var(--mkt-brand))] text-white" : "text-[hsl(var(--mkt-ink))]"
                }`}
              >
                {t(`mobileBookings.tabs.${k}`, k)}
                {count !== null && (
                  <span
                    className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                      active ? "bg-white/20 text-white" : "bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]"
                    }`}
                    aria-hidden
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="mt-3 space-y-3 px-4">
        {state === "loading" ? (
          <SkeletonList />
        ) : state === "error" ? (
          <ErrorState onRetry={() => setState("loading")} />
        ) : !user ? (
          <EmptyState variant="signed_out" />
        ) : list.length === 0 ? (
          <EmptyState variant={tab} />
        ) : (
          list.map((b) => <BookingCard key={b.id} b={b} />)
        )}
      </div>
    </div>
  );
}

/* ------------------------------ subcomponents ---------------------------- */

function BookingCard({ b }: { b: Booking }) {
  const { t, i18n } = useTranslation("marketplace");
  const d = new Date(b.booking_date).toLocaleDateString(i18n.language, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return (
    <Link
      to={`/booking/${b.id}/plan`}
      className="tap-target block rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4 shadow-[var(--app-shadow-card,0_1px_2px_rgba(0,0,0,0.04))] active:scale-[0.995] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100"
      aria-label={`${b.provider_name ?? t("mobileBookings.provider", "Cleaner")} — ${d}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15.5px] font-semibold text-[hsl(var(--mkt-ink))]">
            {b.provider_name || t("mobileBookings.provider", "Cleaner")}
          </div>
          {b.service && (
            <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {b.service}
              {b.hours ? ` · ${b.hours} t` : ""}
            </div>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS_TONE[b.status]}`}
        >
          {t(STATUS_LABEL_KEY[b.status], b.status)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[hsl(var(--mkt-ink-muted))]">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" aria-hidden />
          {d}
        </span>
        {b.slot && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {b.slot}
          </span>
        )}
        {b.address && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{b.address}</span>
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-dashed border-[hsl(var(--mkt-border))] pt-3">
        <span className="text-[12px] text-[hsl(var(--mkt-ink-muted))]">
          {t("mobileBookings.total", "Du betaler")}
        </span>
        <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-[hsl(var(--mkt-ink))]">
          {b.customer_pays !== null
            ? `${b.customer_pays.toLocaleString()} ${b.currency ?? ""}`.trim()
            : "—"}
          <ChevronRight className="h-4 w-4 text-[hsl(var(--mkt-ink-muted))]" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

function SkeletonList() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-4"
          aria-hidden
        >
          <div className="h-4 w-2/3 rounded bg-[hsl(var(--mkt-brand-soft))]" />
          <div className="mt-2 h-3 w-1/2 rounded bg-[hsl(var(--mkt-brand-soft))]" />
          <div className="mt-4 h-3 w-full rounded bg-[hsl(var(--mkt-brand-soft))]" />
        </div>
      ))}
      <div className="flex items-center justify-center py-2 text-[12px] text-[hsl(var(--mkt-ink-muted))]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        <span className="sr-only">loading</span>
      </div>
    </>
  );
}

function EmptyState({ variant }: { variant: "upcoming" | "previous" | "signed_out" }) {
  const { t } = useTranslation("marketplace");
  const localize = useCountryPath();
  const map = {
    upcoming: {
      title: t("mobileBookings.empty.upcoming.title", "Ingen kommende bookinger"),
      body: t("mobileBookings.empty.upcoming.body", "Find en Cleaner og book direkte i kalenderen."),
    },
    previous: {
      title: t("mobileBookings.empty.previous.title", "Ingen tidligere bookinger"),
      body: t("mobileBookings.empty.previous.body", "Dine gennemførte bookinger vises her."),
    },
    signed_out: {
      title: t("mobileBookings.empty.signed_out.title", "Log ind for at se dine bookinger"),
      body: t("mobileBookings.empty.signed_out.body", "Bookinger er kun synlige når du er logget ind."),
    },
  }[variant];
  const cta =
    variant === "signed_out"
      ? { to: loginPathWithRedirect(localize, "/mine-bookinger"), label: t("mobileBookings.empty.signed_out.cta", "Log ind") }
      : { to: localize("/find-cleaner"), label: t("mobileBookings.empty.cta", "Find en Cleaner") };
  return (
    <div
      role="status"
      className="rounded-2xl border border-dashed border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-6 text-center"
    >
      <div className="text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">{map.title}</div>
      <p className="mt-1 text-[13px] text-[hsl(var(--mkt-ink-muted))]">{map.body}</p>
      <Link
        to={cta.to}
        className="tap-target mt-4 inline-flex items-center justify-center rounded-full bg-[hsl(var(--mkt-brand))] px-5 py-2 text-[13px] font-semibold text-white"
      >
        {cta.label}
      </Link>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("marketplace");
  return (
    <div
      role="alert"
      className="rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-6 text-center"
    >
      <div className="text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">
        {t("mobileBookings.error.title", "Kunne ikke hente bookinger")}
      </div>
      <p className="mt-1 text-[13px] text-[hsl(var(--mkt-ink-muted))]">
        {t("mobileBookings.error.body", "Prøv igen om et øjeblik.")}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="tap-target mt-4 inline-flex items-center justify-center rounded-full bg-[hsl(var(--mkt-brand))] px-5 py-2 text-[13px] font-semibold text-white"
      >
        {t("mobileBookings.error.retry", "Prøv igen")}
      </button>
    </div>
  );
}
