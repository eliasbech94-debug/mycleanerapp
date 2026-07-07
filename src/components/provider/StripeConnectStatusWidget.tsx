import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Coins,
  ExternalLink,
  ShieldCheck,
  FileText,
  Banknote,
  ArrowRight,
  ArrowLeft,
  X,
  UserCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

interface StripeStatus {
  connected: boolean;
  account_id?: string;
  mode?: "live" | "test";
  details_submitted?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  requirements?: {
    currently_due: string[];
    past_due: string[];
    disabled_reason: string | null;
  };
  default_currency?: string | null;
  country?: string | null;
}

const HUMAN_REQUIREMENTS: Record<string, string> = {
  "business_profile.url": "Forretnings-URL",
  "business_profile.mcc": "Branchekode",
  "external_account": "Bankkonto",
  "individual.verification.document": "ID-verifikation",
  "tos_acceptance.date": "Accept af vilkår",
};

const humanReq = (k: string) => HUMAN_REQUIREMENTS[k] ?? k.replace(/[._]/g, " ");

function hasReq(reqs: string[], ...keys: string[]) {
  return reqs.some((r) => keys.some((k) => r.includes(k)));
}

function buildChecklist(status: StripeStatus | null) {
  if (!status || !status.connected) {
    return {
      steps: [
        { key: "profile", label: "Profil & verifikation", done: false },
        { key: "bank", label: "Bankkonto tilføjet", done: false },
        { key: "terms", label: "Vilkår accepteret", done: false },
      ],
      pct: 0,
    };
  }

  const pending = [
    ...(status.requirements?.currently_due ?? []),
    ...(status.requirements?.past_due ?? []),
  ];

  const profileDone = !!status.details_submitted && !hasReq(pending, "individual.verification", "business_profile", "individual.first_name", "individual.last_name", "individual.dob");
  const bankDone = !hasReq(pending, "external_account");
  const termsDone = !hasReq(pending, "tos_acceptance") && !!status.charges_enabled && !!status.payouts_enabled;

  const steps = [
    { key: "profile", label: "Profil & verifikation", done: profileDone },
    { key: "bank", label: "Bankkonto tilføjet", done: bankDone },
    { key: "terms", label: "Vilkår accepteret", done: termsDone },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return { steps, pct };
}

export function StripeConnectStatusWidget() {
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"connect" | "finish">("connect");
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const prevStatusRef = useRef<StripeStatus | null>(null);
  const firstLoadRef = useRef(true);

  const diffAndNotify = useCallback((prev: StripeStatus | null, next: StripeStatus) => {
    if (!prev) return;

    // Connection transition
    if (!prev.connected && next.connected) {
      toast.success("Stripe-konto forbundet", { description: "Din konto er nu koblet til platformen." });
    }

    // Ready transition (fully enabled)
    const prevReady = prev.connected && prev.charges_enabled && prev.payouts_enabled;
    const nextReady = next.connected && next.charges_enabled && next.payouts_enabled;
    if (!prevReady && nextReady) {
      toast.success("Du er klar til udbetalinger!", {
        description: "Stripe har godkendt din konto fuldt ud.",
        duration: 8000,
      });
    } else if (prevReady && !nextReady) {
      toast.warning("Stripe-konto er ikke længere fuldt aktiv", {
        description: "Tjek hvilke oplysninger der mangler.",
      });
    }

    // Step-level transitions
    const prevChk = buildChecklist(prev);
    const nextChk = buildChecklist(next);
    for (const ns of nextChk.steps) {
      const ps = prevChk.steps.find((s) => s.key === ns.key);
      if (!ps) continue;
      if (!ps.done && ns.done) {
        toast.success(`${ns.label} er færdig`, { description: "Trinet blev netop godkendt af Stripe." });
      } else if (ps.done && !ns.done) {
        toast.warning(`${ns.label} mangler igen`, { description: "Stripe har bedt om opdaterede oplysninger." });
      }
    }

    // Individual capability flips
    if (!prev.charges_enabled && next.charges_enabled) {
      toast.success("Du kan nu modtage betalinger");
    }
    if (!prev.payouts_enabled && next.payouts_enabled) {
      toast.success("Udbetalinger er aktiveret");
    }

    // Disabled reason appeared
    if (!prev.requirements?.disabled_reason && next.requirements?.disabled_reason) {
      toast.error("Stripe har begrænset din konto", {
        description: next.requirements.disabled_reason,
        duration: 10000,
      });
    } else if (prev.requirements?.disabled_reason && !next.requirements?.disabled_reason) {
      toast.success("Begrænsning på Stripe-konto fjernet");
    }

    // New requirement items
    const prevPending = new Set([
      ...(prev.requirements?.currently_due ?? []),
      ...(prev.requirements?.past_due ?? []),
    ]);
    const newlyPending = [
      ...(next.requirements?.currently_due ?? []),
      ...(next.requirements?.past_due ?? []),
    ].filter((r) => !prevPending.has(r));
    if (newlyPending.length > 0) {
      toast.info("Stripe beder om flere oplysninger", {
        description: newlyPending.map(humanReq).join(", "),
      });
    }
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-status");
      if (error) throw error;
      const next = data as StripeStatus;
      if (!firstLoadRef.current) {
        diffAndNotify(prevStatusRef.current, next);
      }
      prevStatusRef.current = next;
      firstLoadRef.current = false;
      setStatus(next);
      setLastSync(new Date());
    } catch (e) {
      if (!opts?.silent) setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [diffAndNotify]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh: poll every 30s, plus refresh on window focus / tab visible
  useEffect(() => {
    const interval = window.setInterval(() => { void load({ silent: true }); }, 30_000);
    const onFocus = () => { void load({ silent: true }); };
    const onVisible = () => { if (document.visibilityState === "visible") void load({ silent: true }); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const openOnboardingModal = (mode: "connect" | "finish") => {
    setModalMode(mode);
    setModalOpen(true);
  };

  const confirmOnboarding = async () => {
    setModalOpen(false);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-onboard");
      if (error) throw error;
      const url = (data as { url?: string })?.url;
      if (url) {
        setOnboardingUrl(url);
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const cardStyle = {
    background: "white",
    borderColor: `${C.ink}22`,
    color: C.ink,
  } as const;

  if (loading) {
    return (
      <section className="mt-6 rounded-2xl border-2 p-5" style={cardStyle}>
        <div className="flex items-center gap-2 text-sm opacity-70">
          <Loader2 className="h-4 w-4 animate-spin" /> Henter Stripe-status…
        </div>
      </section>
    );
  }

  const connected = !!status?.connected;
  const ready = connected && status?.charges_enabled && status?.payouts_enabled;
  const checklist = buildChecklist(status);
  const reqs = status?.requirements;
  const pendingReqs = [...new Set([...(reqs?.past_due ?? []), ...(reqs?.currently_due ?? [])])];

  return (
    <>
      <section
        className="mt-6 rounded-2xl border-2 p-5"
        style={cardStyle}
        aria-label="Stripe Connect status"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className="grid h-10 w-10 place-items-center rounded-full"
              style={{ background: ready ? C.mint : connected ? `${C.orange}22` : `${C.ink}11` }}
            >
              {ready ? (
                <CheckCircle2 className="h-5 w-5" style={{ color: C.teal }} />
              ) : (
                <AlertTriangle className="h-5 w-5" style={{ color: C.orange }} />
              )}
            </div>
            <div>
              <h2 className="font-display text-xl">Stripe udbetalinger</h2>
              <p className="text-sm opacity-70">
                {ready
                  ? "Du er klar til at modtage udbetalinger."
                  : connected
                    ? "Onboarding er ikke færdig endnu."
                    : "Du har ikke forbundet en Stripe-konto endnu."}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:opacity-50"
              style={{ borderColor: `${C.ink}33` }}
              aria-label="Opdater Stripe-status"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Opdater
            </button>
            {lastSync && (
              <span className="text-[10px] opacity-50" title={lastSync.toLocaleString()}>
                Auto · {lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </header>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {connected ? (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatusPill ok={!!status?.details_submitted} label="Profil indsendt" />
              <StatusPill ok={!!status?.charges_enabled} label="Kan modtage betaling" />
              <StatusPill ok={!!status?.payouts_enabled} label="Kan få udbetaling" />
              <StatusPill
                ok={!reqs?.disabled_reason}
                label={reqs?.disabled_reason ? "Konto begrænset" : "Konto aktiv"}
              />
            </dl>

            {!ready && (
              <div className="mt-4 rounded-xl border p-4" style={{ borderColor: `${C.orange}44`, background: `${C.orange}08` }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: C.orange }}>
                    Onboarding-fremskridt
                  </span>
                  <span className="text-sm font-bold" style={{ color: C.orange }}>
                    {checklist.pct}%
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ background: `${C.ink}15` }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${checklist.pct}%`,
                      background: checklist.pct === 100 ? C.teal : C.orange,
                    }}
                  />
                </div>
                <ul className="mt-3 space-y-2">
                  {checklist.steps.map((step) => (
                    <li
                      key={step.key}
                      className="flex items-center gap-2.5 text-sm"
                      style={{ opacity: step.done ? 0.7 : 1 }}
                    >
                      {step.done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: C.teal }} />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: C.orange }} />
                      )}
                      <span className={step.done ? "line-through" : "font-medium"}>
                        {step.label}
                      </span>
                      {step.done ? (
                        <span className="ml-auto text-xs" style={{ color: C.teal }}>Færdig</span>
                      ) : (
                        <span className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: C.orange }}>
                          Mangler
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {pendingReqs.length > 0 && (
                  <div className="mt-3 rounded-lg border p-2.5" style={{ borderColor: `${C.orange}33`, background: "white" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Mangler fra Stripe:</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {pendingReqs.map((r) => (
                        <span
                          key={r}
                          className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ background: `${C.orange}18`, color: C.orange }}
                        >
                          {humanReq(r)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => openOnboardingModal("finish")}
                  className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ background: C.orange }}
                >
                  Færdiggør onboarding <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Meta icon={<Globe className="h-4 w-4" />} label="Land" value={status?.country?.toUpperCase() ?? "—"} />
              <Meta
                icon={<Coins className="h-4 w-4" />}
                label="Standard valuta"
                value={status?.default_currency?.toUpperCase() ?? "—"}
              />
            </div>

            {status?.mode && (
              <p className="mt-3 text-xs opacity-60">
                Konto: <span className="font-mono">{status.account_id}</span> · Mode: {status.mode}
              </p>
            )}
          </>
        ) : (
          <div className="mt-4">
            {/* Not connected — show checklist preview */}
            <div className="mb-4 rounded-xl border p-4" style={{ borderColor: `${C.ink}15`, background: `${C.ink}05` }}>
              <p className="text-sm font-semibold" style={{ color: C.ink }}>
                Før du kan modtage betalinger:
              </p>
              <ul className="mt-2 space-y-2">
                {checklist.steps.map((step) => (
                  <li key={step.key} className="flex items-center gap-2.5 text-sm opacity-60">
                    <div className="grid h-5 w-5 place-items-center rounded-full border" style={{ borderColor: `${C.ink}33` }}>
                      <span className="text-[10px] font-bold">?</span>
                    </div>
                    {step.label}
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => openOnboardingModal("connect")}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white"
              style={{ background: C.teal }}
            >
              Forbind Stripe-konto <ExternalLink className="h-3.5 w-3.5" />
            </button>
            {onboardingUrl && (
              <p className="mt-2 text-xs opacity-70">
                Hvis et nyt vindue ikke åbnede,{" "}
                <a href={onboardingUrl} target="_blank" rel="noreferrer" className="underline">
                  klik her
                </a>.
              </p>
            )}
          </div>
        )}
      </section>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md" style={{ borderColor: `${C.ink}22` }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-xl">
              {modalMode === "connect" ? (
                <>
                  <ShieldCheck className="h-5 w-5" style={{ color: C.teal }} />
                  Forbind Stripe-konto
                </>
              ) : (
                <>
                  <UserCheck className="h-5 w-5" style={{ color: C.orange }} />
                  Færdiggør onboarding
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-sm opacity-80">
              {modalMode === "connect"
                ? "Før du kan modtage betalinger skal du oprette og forbinde en Stripe Connect-konto."
                : "Din Stripe-konto er oprettet, men mangler stadig nogle oplysninger før du kan modtage udbetalinger."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-3">
            {modalMode === "connect" ? (
              <>
                <Step icon={<ShieldCheck className="h-4 w-4" />} title="Sikker verifikation">
                  Du sendes til Stripe hvor du skal bekræfte din identitet med et gyldigt ID.
                </Step>
                <Step icon={<Banknote className="h-4 w-4" />} title="Tilføj bankkonto">
                  Angiv din IBAN / bankkonto så Stripe kan overføre dine udbetalinger.
                </Step>
                <Step icon={<FileText className="h-4 w-4" />} title="Acceptér vilkår">
                  Læs og godkend Stripe Connect-vilkårene for at aktivere betalinger.
                </Step>
              </>
            ) : (
              <>
                <Step icon={<AlertTriangle className="h-4 w-4" />} title="Mangler at fuldføre">
                  Stripe mangler stadig: {pendingReqs.length > 0 ? pendingReqs.map(humanReq).join(", ") : "nogle oplysninger"}.
                </Step>
                <Step icon={<Banknote className="h-4 w-4" />} title="Udbetalinger blokeret">
                  Indtil onboarding er færdig kan du modtage booking-betalinger, men får ikke udbetalt.
                </Step>
              </>
            )}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition hover:opacity-80"
              style={{ borderColor: `${C.ink}33`, color: C.ink }}
              aria-label="Tilbage"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Tilbage
            </button>
            <button
              type="button"
              onClick={confirmOnboarding}
              className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: modalMode === "connect" ? C.teal : C.orange }}
            >
              {modalMode === "connect" ? "Start onboarding" : "Forsæt onboarding"} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Step({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border p-3" style={{ borderColor: `${C.ink}15` }}>
      <div className="mt-0.5 shrink-0 opacity-70" style={{ color: C.teal }}>{icon}</div>
      <div>
        <p className="text-sm font-medium" style={{ color: C.ink }}>{title}</p>
        <p className="text-sm opacity-70">{children}</p>
      </div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
      style={{ background: ok ? C.mint : `${C.ink}0d`, color: C.ink }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: ok ? C.teal : `${C.ink}55` }}
        aria-hidden
      />
      {label}
    </div>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: `${C.ink}22` }}>
      <span className="opacity-60">{icon}</span>
      <div>
        <div className="text-[11px] uppercase tracking-wide opacity-60">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}
