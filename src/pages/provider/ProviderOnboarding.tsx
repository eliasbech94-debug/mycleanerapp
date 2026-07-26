import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Camera, CheckCircle2, Circle, FileCheck2, ShieldCheck, Wallet, User, Sparkles, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ProviderApplicantGuard } from "@/components/ProviderApplicantGuard";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { StripeConnectStatusWidget } from "@/components/provider/StripeConnectStatusWidget";
import { IdentityVerificationCard } from "@/components/identity/IdentityVerificationCard";
import BackButton from "@/components/BackButton";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

const STEPS = [
  { key: "account", title: "Konto", Icon: User },
  { key: "basic", title: "Grundprofil", Icon: User },
  { key: "service", title: "Serviceprofil", Icon: Sparkles },
  { key: "insurance", title: "Forsikring", Icon: FileCheck2 },
  { key: "identity", title: "Verifikation", Icon: ShieldCheck },
  { key: "stripe", title: "Udbetaling", Icon: Wallet },
  { key: "review", title: "Gennemse & Indsend", Icon: Send },
] as const;

type ProviderProfile = {
  user_id: string;
  status: string;
  completion_pct: number;
  display_name: string | null;
  date_of_birth: string | null;
  photo_path: string | null;
  base_address_formatted: string | null;
  base_address_place_id: string | null;
  base_country_code: string | null;
  base_lat: number | null;
  base_lng: number | null;
  bio: string | null;
  headline: string | null;
  service_categories: string[];
  languages: string[];
  years_experience: number | null;
  hourly_rate: number | null;
  service_area_radius_km: number | null;
  insurance_policy_number: string | null;
  insurance_expires_on: string | null;
  insurance_doc_path: string | null;
  identity_status: string;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_details_submitted: boolean;
  terms_accepted_at: string | null;
};

const CATEGORIES = [
  { id: "cleaning", label: "Rengøring" },
  { id: "handyman", label: "Handyman" },
  { id: "garden", label: "Have" },
  { id: "moving", label: "Flytning" },
];
const LANGUAGES = [
  { id: "da", label: "Dansk" },
  { id: "en", label: "Engelsk" },
  { id: "sv", label: "Svensk" },
  { id: "de", label: "Tysk" },
  { id: "es", label: "Spansk" },
  { id: "pl", label: "Polsk" },
];

export default function ProviderOnboarding() {
  return (
    <ProviderApplicantGuard>
      <OnboardingInner />
    </ProviderApplicantGuard>
  );
}

function OnboardingInner() {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [pp, setPp] = useState<ProviderProfile | null>(null);
  const [contactPhone, setContactPhone] = useState<string>("");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("provider_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) setPp(data as any);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setContactPhone(authProfile?.phone || "");
  }, [authProfile?.phone]);

  // Redirect active providers away
  useEffect(() => {
    if (pp && pp.status === "active") navigate("/provider-dashboard", { replace: true });
  }, [pp?.status, navigate]);

  // Server-authoritative resume: pick first incomplete step on initial load
  useEffect(() => {
    if (!pp || initialized) return;
    const completion = computeStepCompletion(pp, authProfile, user);
    const first = completion.findIndex((c) => !c);
    setStep(first === -1 ? STEPS.length - 1 : first);
    setInitialized(true);
  }, [pp, authProfile, user, initialized]);

  // Realtime + polling to reflect webhook updates
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`provider-onboarding-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "provider_profiles", filter: `user_id=eq.${user.id}` },
        (payload) => setPp((prev) => ({ ...(prev as any), ...(payload.new as any) })),
      )
      .subscribe();
    const t = window.setInterval(load, 15000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [user, load]);

  const patch = useCallback(
    (updates: Partial<ProviderProfile>) => {
      if (!pp || !user) return;
      setPp({ ...pp, ...updates } as any);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        setSaving(true);
        const { error } = await supabase
          .from("provider_profiles")
          .update(updates as any)
          .eq("user_id", user.id);
        setSaving(false);
        if (error) toast.error(`Kunne ikke gemme: ${error.message}`);
      }, 700) as unknown as number;
    },
    [pp, user],
  );

  const patchContact = useCallback(
    async (updates: { full_name?: string; phone?: string }) => {
      if (!user) return;
      const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
      if (error) toast.error(`Kunne ikke gemme kontakt: ${error.message}`);
      else await refreshProfile();
    },
    [user, refreshProfile],
  );

  const completion = useMemo(
    () => (pp ? computeStepCompletion(pp, authProfile, user) : [false, false, false, false, false, false]),
    [pp, authProfile, user],
  );
  const overallPct = pp?.completion_pct ?? Math.round((completion.filter(Boolean).length / STEPS.length) * 100);

  async function handleSubmit() {
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("provider-submit-application");
    setSubmitting(false);
    if (error || (data as any)?.error) {
      const code = (data as any)?.error || error?.message || "submit_failed";
      const msg = (data as any)?.message || error?.message || "Kunne ikke indsende ansøgning";
      toast.error(`${code}: ${msg}`);
      return;
    }
    toast.success("Ansøgning indsendt — vi vender tilbage inden for 24-48 timer.");
    await load();
  }

  if (!pp || !user) {
    return (
      <main className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin opacity-60" />
      </main>
    );
  }

  const canSubmit = completion.slice(0, 6).every(Boolean);
  const currentComplete = completion[step];

  return (
    <main className="font-editorial" style={{ background: C.cream, color: C.ink }}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-4"><BackButton /></div>

        <header className="mb-6">
          <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: C.orange }}>
            Bliv Cleaner · Trin {step + 1} af {STEPS.length}
          </div>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">Onboarding</h1>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full transition-all"
              style={{ width: `${overallPct}%`, background: C.teal }}
              data-testid="onboarding-progress"
            />
          </div>
          <div className="mt-1 text-xs opacity-70">
            {overallPct}% færdig · Status: {pp.status.replace(/_/g, " ")}
            {saving && <span className="ml-2 opacity-60">Gemmer…</span>}
          </div>
        </header>

        {/* Step nav */}
        <nav className="-mx-4 mb-6 flex snap-x gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-7 sm:overflow-visible sm:px-0">
          {STEPS.map((s, i) => {
            const done = completion[i];
            const active = i === step;
            return (
              <button
                key={s.key}
                onClick={() => setStep(i)}
                className="flex min-w-[92px] snap-start flex-col items-center gap-1 rounded-xl border-2 p-2 text-[10px] font-bold uppercase tracking-wider transition sm:min-w-0"
                style={{
                  background: active ? C.ink : "transparent",
                  color: active ? C.cream : C.ink,
                  opacity: !active && !done ? 0.55 : 1,
                  borderColor: active ? C.ink : `${C.ink}22`,
                }}
                aria-current={active ? "step" : undefined}
                aria-label={`Trin ${i + 1}: ${s.title}`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                <span className="max-w-full truncate">{i + 1}. {s.title}</span>
              </button>
            );
          })}
        </nav>

        <section className="rounded-2xl border-2 bg-white p-6" style={{ borderColor: `${C.ink}22` }}>
          {step === 0 && <StepAccount user={user} authProfile={authProfile} />}
          {step === 1 && (
            <StepBasic
              pp={pp}
              authProfile={authProfile}
              userId={user.id}
              contactPhone={contactPhone}
              setContactPhone={setContactPhone}
              patch={patch}
              patchContact={patchContact}
            />
          )}
          {step === 2 && <StepService pp={pp} patch={patch} />}
          {step === 3 && <StepInsurance pp={pp} patch={patch} />}
          {step === 4 && <StepIdentity pp={pp} authUser={user} />}
          {step === 5 && <StepStripe pp={pp} patch={patch} />}
          {step === 6 && (
            <StepReview
              pp={pp}
              canSubmit={canSubmit}
              submitting={submitting}
              completion={completion}
              onSubmit={handleSubmit}
            />
          )}
        </section>

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] disabled:opacity-40"
            style={{ borderColor: C.ink, color: C.ink }}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Tilbage
          </button>
          {step < STEPS.length - 1 && (
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-[11px] font-bold uppercase tracking-[0.18em] shadow-[4px_4px_0_rgba(10,61,58,0.18)]"
              style={{ background: currentComplete ? C.teal : C.orange, color: C.cream }}
            >
              Næste <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

/* ─────────── Steps ─────────── */

function StepAccount({ user, authProfile }: { user: any; authProfile: any }) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl">Velkommen</h2>
      <p className="text-sm opacity-80">
        Tak fordi du vil være cleaner hos MyCleaner. Det tager typisk 15–30 minutter, og alt gemmes løbende. Vi kontrollerer providers grundigt, fordi du skal arbejde i kundernes hjem:
      </p>
      <ol className="ml-5 list-decimal space-y-1 text-sm">
        <li>Grundprofil — navn, alder, adresse og profilfoto</li>
        <li>Serviceprofil — rengøringstyper, erfaring, sprog og område</li>
        <li>Identitets- og kontaktverifikation</li>
        <li>Stripe Connect — sikker modtagelse af udbetalinger</li>
        <li>Provider-vilkår og ret til at arbejde</li>
        <li>Gennemse og indsend til manuel godkendelse</li>
      </ol>
      <div className="rounded-xl border-2 p-4 text-xs leading-relaxed" style={{ borderColor: C.ink }}>
        <strong>Forsikring:</strong> Du skal have gyldig ansvarsforsikring, før profilen kan aktiveres. Policen og dokumentation tilføjes på din providerprofil og kontrolleres af MyCleaner.
      </div>
      <div className="rounded-xl p-4 text-sm" style={{ background: C.cream }}>
        <div><strong>Logget ind som:</strong> {user.email}</div>
        <div className="text-xs opacity-70 mt-1">
          Email bekræftet: {user.email_confirmed_at || user.confirmed_at ? "Ja" : "Nej (tjek indbakke)"}
        </div>
        {authProfile?.full_name && <div className="mt-1"><strong>Navn:</strong> {authProfile.full_name}</div>}
      </div>
    </div>
  );
}

function StepBasic({
  pp, authProfile, userId, contactPhone, setContactPhone, patch, patchContact,
}: {
  pp: ProviderProfile;
  authProfile: any;
  userId: string;
  contactPhone: string;
  setContactPhone: (v: string) => void;
  patch: (u: Partial<ProviderProfile>) => void;
  patchContact: (u: { full_name?: string; phone?: string }) => void;
}) {
  const [name, setName] = useState(authProfile?.full_name || "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  useEffect(() => setName(authProfile?.full_name || ""), [authProfile?.full_name]);

  async function uploadPhoto(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Vælg et JPG-, PNG- eller WebP-billede");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Billedet må højst fylde 5 MB");
      return;
    }

    setUploadingPhoto(true);
    try {
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const objectPath = `${userId}/profile.${extension}`;
      const { error } = await supabase.storage
        .from("provider-photos")
        .upload(objectPath, file, { cacheControl: "3600", contentType: file.type, upsert: true });
      if (error) throw error;

      const { data } = supabase.storage.from("provider-photos").getPublicUrl(objectPath);
      patch({ photo_path: `${data.publicUrl}?v=${Date.now()}` });
      toast.success("Profilfoto uploadet");
    } catch (error: any) {
      toast.error(error?.message || "Fotoet kunne ikke uploades");
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl">Grundprofil</h2>

      <Field label="Fulde navn">
        <input
          className="w-full rounded-lg border px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name && name !== authProfile?.full_name && patchContact({ full_name: name })}
        />
      </Field>

      <Field label="Visningsnavn (offentligt)">
        <input
          className="w-full rounded-lg border px-3 py-2"
          value={pp.display_name || ""}
          onChange={(e) => patch({ display_name: e.target.value })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fødselsdato">
          <input
            type="date"
            className="w-full rounded-lg border px-3 py-2"
            value={pp.date_of_birth || ""}
            onChange={(e) => patch({ date_of_birth: e.target.value })}
          />
        </Field>
        <Field label="Telefon">
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            onBlur={() => contactPhone !== authProfile?.phone && patchContact({ phone: contactPhone })}
            placeholder="+45…"
          />
        </Field>
      </div>

      <Field label="Adresse">
        <AddressAutocomplete
          value={pp.base_address_formatted || ""}
          onChange={(v) => patch({ base_address_formatted: v })}
          countries={[(pp.base_country_code || authProfile?.country_code || "dk").toLowerCase()]}
          onSelect={(p) =>
            patch({
              base_address_formatted: p.address,
              base_address_place_id: p.placeId,
              base_lat: p.lat ?? null,
              base_lng: p.lng ?? null,
              base_country_code: (pp.base_country_code || authProfile?.country_code || "DK").toUpperCase(),
              base_validation_source: "onboarding" as any,
            } as any)
          }
        />
      </Field>

      <Field label="Profilfoto">
        <div className="flex flex-col gap-4 rounded-2xl border-2 p-4 sm:flex-row sm:items-center" style={{ borderColor: `${C.ink}33`, background: C.cream }}>
          <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border-2 bg-white" style={{ borderColor: C.ink }}>
            {pp.photo_path ? (
              <img src={pp.photo_path} alt="Forhåndsvisning af profilfoto" className="h-full w-full object-cover" />
            ) : (
              <Camera className="h-8 w-8 opacity-50" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold">Vælg et tydeligt billede af dit ansigt</p>
            <p className="mt-1 text-xs leading-relaxed opacity-65">
              Brug et vellignende foto med rolig baggrund. Det skaber tryghed, når kunder sammenligner cleaners.
            </p>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border-2 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em]" style={{ borderColor: C.ink }}>
              {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {uploadingPhoto ? "Uploader…" : pp.photo_path ? "Skift foto" : "Upload foto"}
              <input
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingPhoto}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <p className="mt-2 text-[10px] opacity-55">JPG, PNG eller WebP · maks. 5 MB</p>
          </div>
        </div>
      </Field>
    </div>
  );
}

function StepService({ pp, patch }: { pp: ProviderProfile; patch: (u: Partial<ProviderProfile>) => void }) {
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl">Serviceprofil</h2>

      <Field label="Kategorier">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const on = pp.service_categories.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => patch({ service_categories: toggle(pp.service_categories, c.id) })}
                className="rounded-full border-2 px-3 py-1 text-xs font-bold uppercase tracking-wider transition"
                style={{
                  borderColor: C.ink,
                  background: on ? C.ink : "transparent",
                  color: on ? C.cream : C.ink,
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Overskrift">
        <input
          className="w-full rounded-lg border px-3 py-2"
          value={pp.headline || ""}
          onChange={(e) => patch({ headline: e.target.value })}
          placeholder="F.eks. Erfaren rengøringsassistent, København"
        />
      </Field>

      <Field label="Beskrivelse">
        <textarea
          className="w-full rounded-lg border px-3 py-2 min-h-[120px]"
          value={pp.bio || ""}
          onChange={(e) => patch({ bio: e.target.value })}
          placeholder="Fortæl om din erfaring, dine metoder og hvorfor kunder skal vælge dig."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Års erfaring">
          <input
            type="number"
            min={0}
            className="w-full rounded-lg border px-3 py-2"
            value={pp.years_experience ?? ""}
            onChange={(e) => patch({ years_experience: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
        <Field label="Timepris (DKK)">
          <input
            type="number"
            min={0}
            className="w-full rounded-lg border px-3 py-2"
            value={pp.hourly_rate ?? ""}
            onChange={(e) => patch({ hourly_rate: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
        <Field label="Radius (km)">
          <input
            type="number"
            min={1}
            max={200}
            className="w-full rounded-lg border px-3 py-2"
            value={pp.service_area_radius_km ?? ""}
            onChange={(e) =>
              patch({ service_area_radius_km: e.target.value ? Number(e.target.value) : null })
            }
          />
        </Field>
      </div>

      <Field label="Sprog">
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => {
            const on = pp.languages.includes(l.id);
            return (
              <button
                key={l.id}
                onClick={() => patch({ languages: toggle(pp.languages, l.id) })}
                className="rounded-full border-2 px-3 py-1 text-xs font-bold uppercase tracking-wider"
                style={{
                  borderColor: C.ink,
                  background: on ? C.ink : "transparent",
                  color: on ? C.cream : C.ink,
                }}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </Field>
    </div>
  );
}

function StepInsurance({ pp, patch }: { pp: ProviderProfile; patch: (u: Partial<ProviderProfile>) => void }) {
  const [uploading, setUploading] = useState(false);
  const insuranceValid = !!(
    pp.insurance_policy_number?.trim() &&
    pp.insurance_doc_path?.trim() &&
    pp.insurance_expires_on &&
    pp.insurance_expires_on >= new Date().toISOString().slice(0, 10)
  );

  async function uploadInsurance(file: File) {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Vælg PDF, JPG, PNG eller WebP");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Dokumentet må højst fylde 10 MB");
      return;
    }

    setUploading(true);
    try {
      const { data, error } = await supabase.functions.invoke("provider-document-upload", {
        body: { kind: "insurance", content_type: file.type },
      });
      if (error || !data?.signed_url || !data?.path) {
        throw new Error(error?.message || "Kunne ikke forberede upload");
      }
      const response = await fetch(data.signed_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error(`Upload fejlede (${response.status})`);
      patch({ insurance_doc_path: data.path });
      toast.success("Forsikringsdokument uploadet");
    } catch (error: any) {
      toast.error(error?.message || "Dokumentet kunne ikke uploades");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl">Ansvarsforsikring</h2>
        <p className="mt-2 text-sm leading-relaxed opacity-75">
          En gyldig ansvarsforsikring er obligatorisk, når du arbejder i kundernes hjem. Dokumentet opbevares privat og kontrolleres af MyCleaner.
        </p>
      </div>

      <Field label="Policenummer">
        <input
          className="w-full rounded-lg border px-3 py-2"
          value={pp.insurance_policy_number || ""}
          onChange={(event) => patch({ insurance_policy_number: event.target.value })}
          placeholder="Dit policenummer"
        />
      </Field>

      <Field label="Forsikringen gælder til">
        <input
          type="date"
          min={new Date().toISOString().slice(0, 10)}
          className="w-full rounded-lg border px-3 py-2"
          value={pp.insurance_expires_on || ""}
          onChange={(event) => patch({ insurance_expires_on: event.target.value || null })}
        />
      </Field>

      <Field label="Dokumentation">
        <div className="rounded-2xl border-2 p-4" style={{ borderColor: insuranceValid ? C.teal : `${C.ink}33`, background: C.cream }}>
          <div className="flex items-start gap-3">
            {pp.insurance_doc_path ? <CheckCircle2 className="mt-0.5 h-5 w-5" style={{ color: C.teal }} /> : <FileCheck2 className="mt-0.5 h-5 w-5 opacity-55" />}
            <div className="flex-1">
              <p className="text-sm font-bold">{pp.insurance_doc_path ? "Dokument uploadet" : "Upload police eller forsikringsbevis"}</p>
              <p className="mt-1 text-xs opacity-65">PDF, JPG, PNG eller WebP · maks. 10 MB</p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border-2 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em]" style={{ borderColor: C.ink }}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                {uploading ? "Uploader…" : pp.insurance_doc_path ? "Erstat dokument" : "Upload dokument"}
                <input
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadInsurance(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </Field>

      {!insuranceValid && (
        <p className="rounded-xl border-2 p-3 text-xs font-semibold" style={{ borderColor: C.orange }}>
          Policenummer, gyldig udløbsdato og dokumentation skal være udfyldt, før ansøgningen kan indsendes.
        </p>
      )}
    </div>
  );
}

function StepIdentity({ pp, authUser }: { pp: ProviderProfile; authUser: any }) {
  const emailOk = !!(authUser.email_confirmed_at || authUser.confirmed_at);
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl">Identitet & Verifikation</h2>
      <p className="text-sm leading-relaxed opacity-80">
        Din identitet kontrolleres, fordi du skal arbejde i private hjem. Kontrollen gælder providers — almindelige kunder gennemgår ikke denne proces. Identitetsdokumenter håndteres sikkert af vores verifikationspartner og vises ikke offentligt.
      </p>

      <div className="grid gap-3">
        <StatusRow ok={emailOk} label="Email bekræftet" hint={emailOk ? authUser.email : "Åbn linket i din indbakke"} />
        <StatusRow
          ok={pp.identity_status === "verified"}
          label="Identitet verificeret"
          hint={`Status: ${pp.identity_status}`}
        />
      </div>

      <div className="pt-2"><IdentityVerificationCard /></div>

      <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: C.cream }}>
        Hvis dit telefonnummer endnu ikke er bekræftet, kan du gøre det under <a className="font-bold underline" href="/profil?tab=info">profil og kontaktoplysninger</a>. Du kan derefter vende tilbage hertil uden at miste noget.
      </div>
    </div>
  );
}

function StepStripe({ pp, patch }: { pp: ProviderProfile; patch: (u: Partial<ProviderProfile>) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl">Udbetaling & Skat</h2>
      <p className="text-sm leading-relaxed opacity-80">
        Opret din personlige Stripe Connect-konto, så MyCleaner kan sende dine udbetalinger sikkert. MyCleaner ser ikke dine fulde bankoplysninger, og en godkendt Stripe-konto aktiverer ikke automatisk din profil.
      </p>
      <StripeConnectStatusWidget />
      <div className="mt-4 rounded-xl border-2 p-4" style={{ borderColor: `${C.ink}22` }}>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={!!pp.terms_accepted_at}
            onChange={(e) =>
              patch({ terms_accepted_at: e.target.checked ? new Date().toISOString() : null })
            }
          />
          <span>
            Jeg accepterer <a href="/regler" className="underline">provider-vilkårene</a> og bekræfter,
            at jeg er berettiget til at arbejde i det valgte land.
          </span>
        </label>
      </div>
    </div>
  );
}

function StepReview({
  pp, canSubmit, submitting, completion, onSubmit,
}: {
  pp: ProviderProfile;
  canSubmit: boolean;
  submitting: boolean;
  completion: boolean[];
  onSubmit: () => void;
}) {
  const submitted = pp.status !== "draft" && pp.status !== "pending_identity" && pp.status !== "pending_stripe";
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl">Gennemse & Indsend</h2>
      <p className="text-sm leading-relaxed opacity-75">
        Når alle trin er grønne, kan du indsende profilen. MyCleaner kontrollerer derefter oplysninger, forsikring og dokumentation, før profilen bliver synlig for kunder.
      </p>

      <ul className="space-y-2 text-sm">
        {STEPS.slice(0, 6).map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            {completion[i] ? (
              <CheckCircle2 className="h-4 w-4" style={{ color: C.teal }} />
            ) : (
              <Circle className="h-4 w-4" style={{ color: "#8a2e1c" }} />
            )}
            <span>{s.title}</span>
            {!completion[i] && <span className="text-xs opacity-60">— mangler</span>}
          </li>
        ))}
      </ul>

      {submitted ? (
        <div className="rounded-xl p-4 text-sm" style={{ background: C.mint, color: C.ink }}>
          <strong>Indsendt ✔</strong> — Status: {pp.status.replace(/_/g, " ")}.
          Vi vender normalt tilbage inden for 24–48 timer.
        </div>
      ) : (
        <button
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          data-testid="submit-application"
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] shadow-[4px_4px_0_rgba(10,61,58,0.2)] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: C.orange, color: C.ink }}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Indsend til godkendelse
        </button>
      )}
      {!canSubmit && !submitted && (
        <p className="text-xs opacity-70">Færdiggør alle 6 første trin for at kunne indsende.</p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</span>
      {children}
    </label>
  );
}

function StatusRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3" style={{ borderColor: `${C.ink}22` }}>
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5" style={{ color: C.teal }} />
      ) : (
        <Circle className="mt-0.5 h-5 w-5" style={{ color: "#8a2e1c" }} />
      )}
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs opacity-70">{hint}</div>}
      </div>
    </div>
  );
}

/* ─────────── Server-mirrored completion ─────────── */

export function computeStepCompletion(
  pp: ProviderProfile,
  authProfile: any,
  user: any,
): boolean[] {
  const emailOk = !!(user?.email_confirmed_at || user?.confirmed_at);
  const account = !!user;
  const basic = !!(
    (authProfile?.full_name || pp.display_name) &&
    pp.date_of_birth &&
    authProfile?.phone &&
    pp.base_address_place_id &&
    pp.photo_path
  );
  const service = !!(
    pp.service_categories.length > 0 &&
    (pp.bio || "").trim().length >= 20 &&
    pp.languages.length > 0 &&
    pp.hourly_rate &&
    pp.service_area_radius_km
  );
  const insurance = !!(
    pp.insurance_policy_number?.trim() &&
    pp.insurance_doc_path?.trim() &&
    pp.insurance_expires_on &&
    pp.insurance_expires_on >= new Date().toISOString().slice(0, 10)
  );
  const identity = pp.identity_status === "verified" && emailOk;
  const stripe = pp.stripe_charges_enabled && pp.stripe_payouts_enabled && !!pp.terms_accepted_at;
  const review = pp.status !== "draft" && pp.status !== "pending_identity" && pp.status !== "pending_stripe";
  return [account, basic, service, insurance, identity, stripe, review];
}
