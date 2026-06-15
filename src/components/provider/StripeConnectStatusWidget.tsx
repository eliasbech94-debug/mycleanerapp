import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  X,
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

export function StripeConnectStatusWidget() {
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"connect" | "finish">("connect");

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-status");
      if (error) throw error;
      setStatus(data as StripeStatus);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Meta icon={<Globe className="h-4 w-4" />} label="Land" value={status?.country?.toUpperCase() ?? "—"} />
              <Meta
                icon={<Coins className="h-4 w-4" />}
                label="Standard valuta"
                value={status?.default_currency?.toUpperCase() ?? "—"}
              />
            </div>

            {pendingReqs.length > 0 && (
              <div className="mt-4 rounded-lg border p-3" style={{ borderColor: `${C.orange}55`, background: `${C.orange}0d` }}>
                <p className="text-sm font-semibold" style={{ color: C.orange }}>
                  Stripe mangler at få:
                </p>
                <ul className="mt-1.5 list-disc pl-5 text-sm">
                  {pendingReqs.map((r) => (
                    <li key={r}>{humanReq(r)}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => openOnboardingModal("finish")}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-white"
                  style={{ background: C.orange }}
                >
                  Færdiggør onboarding <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {status?.mode && (
              <p className="mt-3 text-xs opacity-60">
                Konto: <span className="font-mono">{status.account_id}</span> · Mode: {status.mode}
              </p>
            )}
          </>
        ) : (
          <div className="mt-4">
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
                  <FileText className="h-5 w-5" style={{ color: C.orange }} />
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
            >
              <X className="h-3.5 w-3.5" /> Luk
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
