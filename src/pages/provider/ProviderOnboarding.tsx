import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, Camera, CheckCircle2, Circle, FileCheck2, ShieldCheck, Wallet, User, Sparkles, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ProviderApplicantGuard } from "@/components/ProviderApplicantGuard";
import { InternationalPhoneInput } from "@/components/provider/InternationalPhoneInput";
import { PostalCodeCityField } from "@/components/provider/PostalCodeCityField";
import { ProviderServicePricing } from "@/components/provider/ProviderServicePricing";
import { StripeConnectStatusWidget } from "@/components/provider/StripeConnectStatusWidget";
import { IdentityVerificationCard } from "@/components/identity/IdentityVerificationCard";
import BackButton from "@/components/BackButton";
import { ProviderQuizCard } from "@/components/provider/ProviderQuizCard";
import { ProviderApprovalChecklist } from "@/components/provider/ProviderApprovalChecklist";
import { useCountryPath } from "@/lib/countryPath";

import { acceptLegalDocument, fetchLegalDocument } from "@/lib/legal/api";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

/** Records a versioned, hash-stamped acceptance of the provider terms. */
async function recordProviderTermsAcceptance() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const doc = await fetchLegalDocument("provider-terms", "DK", "da");
    if (!doc) return;
    await acceptLegalDocument(auth.user.id, doc, "provider_onboarding");
  } catch {
    // Acceptance audit is best-effort here; the checkbox timestamp is the gate.
  }
}

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
  base_postal_code: string | null;
  base_city: string | null;
  base_validation_source: string | null;
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
  const [hasActiveServicePrice, setHasActiveServicePrice] = useState(false);
  const [smsVerifiedAt, setSmsVerifiedAt] = useState<string | null>(null);
  const [submitErrorCode, setSubmitErrorCode] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  const refreshServicePrices = useCallback(async () => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from("provider_service_prices")
      .select("service_code", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("active", true);
    setHasActiveServicePrice((count ?? 0) > 0);
  }, [user]);

  const refreshSmsStatus = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("sms_verified_at")
      .eq("id", user.id)
      .maybeSingle();
    setSmsVerifiedAt((data as any)?.sms_verified_at ?? null);
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("provider_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) setPp(data as any);
    await Promise.all([refreshServicePrices(), refreshSmsStatus()]);
  }, [user, refreshServicePrices, refreshSmsStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setContactPhone(authProfile?.phone || "");
  }, [authProfile?.phone]);

  // Redirect active providers away
  useEffect(() => {
    if (pp && pp.status === "active") navigate(localizeRef.current("/provider-dashboard"), { replace: true });
  }, [pp?.status, navigate]);

  // Server-authoritative resume: pick first incomplete step on initial load
  useEffect(() => {
    if (!pp || initialized) return;
    const completion = computeStepCompletion(pp, authProfile, user, { hasActiveServicePrice, smsVerifiedAt });
    const first = completion.findIndex((c) => !c);
    setStep(first === -1 ? STEPS.length - 1 : first);
    setInitialized(true);
  }, [pp, authProfile, user, initialized, hasActiveServicePrice, smsVerifiedAt]);

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

  const completionByKey = useMemo(
    () =>
      pp
        ? computeStepCompletionByKey(pp, authProfile, user, { hasActiveServicePrice, smsVerifiedAt })
        : (Object.fromEntries(ONBOARDING_STEP_KEYS.map((k) => [k, false])) as Record<OnboardingStepKey, boolean>),
    [pp, authProfile, user, hasActiveServicePrice, smsVerifiedAt],
  );
  const completion = useMemo(() => ONBOARDING_STEP_KEYS.map((k) => completionByKey[k]), [completionByKey]);
  const overallPct = pp?.completion_pct ?? Math.round((completion.filter(Boolean).length / STEPS.length) * 100);
  const missingSteps = useMemo(
    () =>
      ONBOARDING_STEP_KEYS.slice(0, 6).filter((k) => !completionByKey[k]) as OnboardingStepKey[],
    [completionByKey],
  );

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitErrorCode(null);
    const { data, error } = await supabase.functions.invoke("provider-submit-application");
    setSubmitting(false);
    const errCode = (data as any)?.error || (error?.message ?? "").split(":")[0]?.trim() || null;
    if (errCode || (data as any)?.error) {
      const code = errCode || "submit_failed";
      const message = SUBMIT_ERROR_MESSAGES[code] || (data as any)?.message || error?.message || "Kunne ikke indsende ansøgning";
      setSubmitErrorCode(code);
      toast.error(message);
      await load(); // sync latest server truth so the missing-list stays honest
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
          {step === 2 && <StepService pp={pp} patch={patch} hasActiveServicePrice={hasActiveServicePrice} onServicePricesChange={refreshServicePrices} />}
          {step === 3 && <StepInsurance pp={pp} patch={patch} />}
          {step === 4 && <StepIdentity pp={pp} authUser={user} smsVerifiedAt={smsVerifiedAt} />}
          {step === 5 && <StepStripe pp={pp} patch={patch} />}
          {step === 6 && (
            <div className="space-y-6">
              <ProviderQuizCard />
              <ProviderApprovalChecklist />
              <StepReview
                pp={pp}
                canSubmit={canSubmit}
                submitting={submitting}
                completion={completion}
                missingSteps={missingSteps}
                submitErrorCode={submitErrorCode}
                onSubmit={handleSubmit}
              />
            </div>
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
      const photoUrl = `${data.publicUrl}?v=${Date.now()}`;
      // Persist immediately (bypassing the debounce) so the moderation
      // function can verify the path belongs to this provider.
      const { error: saveError } = await supabase
        .from("provider_profiles")
        .update({ photo_path: photoUrl } as any)
        .eq("user_id", userId);
      if (saveError) throw saveError;
      patch({ photo_path: photoUrl });
      toast.success("Profilfoto uploadet — vi tjekker det nu");

      // Asynchronous quality/content moderation. Identity and liveness are
      // handled exclusively by the ID verification step.
      void supabase.functions
        .invoke("provider-photo-moderate", { body: { photo_path: photoUrl } })
        .then(({ data: mod }) => {
          if (mod?.status === "approved") toast.success("Dit profilbillede er godkendt");
          else if (mod?.status === "rejected") {
            toast.error(mod?.message || "Billedet blev afvist. Prøv med et andet foto.");
          } else {
            toast.info("Dit profilbillede gennemgås manuelt.");
          }
        })
        .catch(() => {
          toast.info("Dit profilbillede gennemgås manuelt.");
        });

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
          <InternationalPhoneInput
            countryCode={(pp.base_country_code || authProfile?.country_code || "DK").toUpperCase()}
            value={contactPhone}
            onChange={setContactPhone}
            onBlur={() => contactPhone !== authProfile?.phone && patchContact({ phone: contactPhone })}
          />
        </Field>
      </div>

      <Field label="Dit arbejdsområde">
        <PostalCodeCityField
          countryCode={(pp.base_country_code || authProfile?.country_code || "DK").toUpperCase()}
          postalCode={pp.base_postal_code || ""}
          city={pp.base_city || ""}
          onResolved={(place) =>
            patch({
              base_address_formatted: `${place.postal_code} ${place.city}`,
              base_address_place_id: place.place_id,
              base_country_code: place.country_code,
              base_lat: place.lat ?? null,
              base_lng: place.lng ?? null,
              base_postal_code: place.postal_code,
              base_city: place.city,
              base_validation_source: "postal_lookup",
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

function StepService({
  pp,
  patch,
  hasActiveServicePrice,
  onServicePricesChange,
}: {
  pp: ProviderProfile;
  patch: (u: Partial<ProviderProfile>) => void;
  hasActiveServicePrice: boolean;
  onServicePricesChange: () => void;
}) {
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

      <ProviderServicePricing
        countryCode={(pp.base_country_code || "DK").toUpperCase()}
        onChange={onServicePricesChange}
      />
      {!hasActiveServicePrice && (
        <p className="rounded-xl border-2 p-3 text-xs font-semibold" style={{ borderColor: C.orange }}>
          Aktivér og gem mindst én servicepris, før onboardingen tæller som færdig.
        </p>
      )}

      <Field label="Overskrift">
        <input
          className="w-full rounded-lg border px-3 py-2"
          value={pp.headline || ""}
          onChange={(e) => patch({ headline: e.target.value })}
          placeholder="F.eks. Erfaren rengøringsassistent, København"
        />
      </Field>

      <Field label="Beskrivelse (mindst 40 tegn)">
        <textarea
          className="w-full rounded-lg border px-3 py-2 min-h-[120px]"
          value={pp.bio || ""}
          onChange={(e) => patch({ bio: e.target.value })}
          placeholder="Fortæl om din erfaring, dine metoder og hvorfor kunder skal vælge dig."
        />
        <span className="mt-1 block text-[11px] opacity-60">
          {(pp.bio || "").trim().length}/40 tegn
        </span>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Års erfaring">
          <input
            type="number"
            min={0}
            className="w-full rounded-lg border px-3 py-2"
            value={pp.years_experience ?? ""}
            onChange={(e) => patch({ years_experience: e.target.value ? Number(e.target.value) : null })}
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

function StepIdentity({
  pp,
  authUser,
  smsVerifiedAt,
}: {
  pp: ProviderProfile;
  authUser: any;
  smsVerifiedAt: string | null;
}) {
  const emailOk = !!(authUser.email_confirmed_at || authUser.confirmed_at);
  const identityOk = pp.identity_status === "approved";
  const smsOk = !!smsVerifiedAt;
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl">Identitet & Verifikation</h2>
      <p className="text-sm leading-relaxed opacity-80">
        Din identitet kontrolleres, fordi du skal arbejde i private hjem. Kontrollen gælder providers — almindelige kunder gennemgår ikke denne proces. Identitetsdokumenter håndteres sikkert af vores verifikationspartner og vises ikke offentligt.
      </p>

      <div className="grid gap-3">
        <StatusRow ok={emailOk} label="Email bekræftet" hint={emailOk ? authUser.email : "Åbn linket i din indbakke"} />
        <StatusRow
          ok={smsOk}
          label="Telefon SMS-verificeret"
          hint={smsOk ? "Bekræftet" : "Verificér dit nummer under Profil → SMS"}
        />
        <StatusRow
          ok={identityOk}
          label="Identitet godkendt"
          hint={`Status: ${pp.identity_status}${identityOk ? "" : " — kun 'approved' tæller"}`}
        />
      </div>

      <div className="pt-2"><IdentityVerificationCard /></div>

      <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: C.cream }}>
        Hvis dit telefonnummer endnu ikke er SMS-verificeret, kan du gøre det under <a className="font-bold underline" href="/profil?tab=sms">profil og SMS-verifikation</a>. Du kan derefter vende tilbage hertil uden at miste noget.
      </div>
    </div>
  );
}


function StepStripe({ pp, patch }: { pp: ProviderProfile; patch: (u: Partial<ProviderProfile>) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl">Udbetaling og skat</h2>
      <p className="text-sm leading-relaxed opacity-80">
        Du arbejder som selvstændig provider på MyCleaner-platformen. Opret din egen Stripe Connect-konto, så din indtjening kan udbetales sikkert. MyCleaner ser ikke dine fulde bankoplysninger, og en godkendt Stripe-konto aktiverer ikke automatisk din profil. Det præcise tidspunkt, hvor en udbetaling bliver synlig på kontoen, afhænger af betalingsudbyderen og din bank.
      </p>
      <StripeConnectStatusWidget />
      <div className="grid gap-2">
        <StatusRow ok={!!pp.stripe_charges_enabled} label="Betalinger aktiveret" />
        <StatusRow ok={!!pp.stripe_payouts_enabled} label="Udbetaling aktiveret" />
        <StatusRow ok={!!pp.stripe_details_submitted} label="Oplysninger indsendt til Stripe" />
      </div>
      <div className="mt-4 rounded-xl border-2 p-4" style={{ borderColor: `${C.ink}22` }}>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={!!pp.terms_accepted_at}
            onChange={(e) => {
              patch({ terms_accepted_at: e.target.checked ? new Date().toISOString() : null });
              if (e.target.checked) void recordProviderTermsAcceptance();
            }}
          />
          <span>
            Jeg accepterer{" "}
            <a href="/legal/provider-terms" target="_blank" rel="noopener noreferrer" className="underline">
              providervilkårene
            </a>{" "}
            og bekræfter, at jeg er berettiget til at arbejde i det valgte land.
          </span>
        </label>
      </div>
    </div>
  );
}


function StepReview({
  pp, canSubmit, submitting, completion, missingSteps, submitErrorCode, onSubmit,
}: {
  pp: ProviderProfile;
  canSubmit: boolean;
  submitting: boolean;
  completion: boolean[];
  missingSteps: OnboardingStepKey[];
  submitErrorCode: string | null;
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

      {missingSteps.length > 0 && !submitted && (
        <div
          data-testid="missing-requirements"
          className="rounded-xl border-2 p-4 text-sm"
          style={{ borderColor: C.orange, background: "#fff7f0" }}
        >
          <div className="font-bold uppercase tracking-wider text-[11px]" style={{ color: C.orange }}>
            Manglende krav
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {missingSteps.map((k) => (
              <li key={k}>{ONBOARDING_STEP_LABELS[k]}</li>
            ))}
          </ul>
          {submitErrorCode && (
            <p className="mt-3 text-xs opacity-80">
              Backend afviste indsendelsen: {SUBMIT_ERROR_MESSAGES[submitErrorCode] ?? submitErrorCode}
            </p>
          )}
        </div>
      )}

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

export type OnboardingStepKey =
  | "account"
  | "basic"
  | "service"
  | "insurance"
  | "identity"
  | "stripe"
  | "review";

export const ONBOARDING_STEP_KEYS: readonly OnboardingStepKey[] = [
  "account",
  "basic",
  "service",
  "insurance",
  "identity",
  "stripe",
  "review",
] as const;

/** Human-readable missing-requirement summaries shown to the applicant. */
export const ONBOARDING_STEP_LABELS: Record<OnboardingStepKey, string> = {
  account: "Log ind eller opret konto",
  basic: "Udfyld grundprofil (navn, alder ≥ 18, valid postnr./by, profilfoto)",
  service:
    "Udfyld serviceprofil (kategori, overskrift, bio ≥ 40 tegn, sprog, arbejdsradius, mindst én gemt servicepris)",
  insurance: "Upload forsikringspolice med gyldig udløbsdato",
  identity: "Bekræft email, SMS-verificér telefon og godkendt identitet",
  stripe: "Fuldfør Stripe Connect (betalinger, udbetaling og oplysninger) og accepter provider-vilkårene",
  review: "Indsend din providerprofil til godkendelse",
};

/** Backend error codes from submit_provider_application() → Danish messages. */
export const SUBMIT_ERROR_MESSAGES: Record<string, string> = {
  requirements_incomplete: "Nogle krav mangler stadig — se listen over manglende trin.",
  phone_not_verified: "Dit telefonnummer er ikke SMS-verificeret.",
  identity_not_approved: "Din identitet er ikke godkendt endnu.",
  stripe_not_ready: "Din Stripe Connect-konto er ikke klar endnu (betalinger, udbetaling og oplysninger).",
  provider_dob_missing: "Din fødselsdato mangler.",
  provider_underage: "Selvstændige providere skal være mindst 18 år.",
  invalid_status_transition: "Ansøgningen kan ikke indsendes i den nuværende status.",
  provider_profile_missing: "Providerprofilen findes ikke — kontakt support.",
  unauthorized: "Du skal være logget ind for at indsende.",
  submit_failed: "Ansøgningen kunne ikke indsendes. Prøv igen.",
};

// Statuses that mean the applicant has successfully submitted and is
// awaiting/passed review. `rejected` and `suspended` MUST NOT count as
// review-complete: they are terminal negative states.
const REVIEW_COMPLETE_STATUSES = new Set(["pending_review", "active"]);

/** Age in whole years on `today` (UTC-safe). */
function yearsOld(dob: string, today: Date = new Date()): number | null {
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let age = today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

export function computeStepCompletionByKey(
  pp: ProviderProfile,
  authProfile: any,
  user: any,
  opts: { hasActiveServicePrice?: boolean; smsVerifiedAt?: string | null } = {},
): Record<OnboardingStepKey, boolean> {
  const emailOk = !!(user?.email_confirmed_at || user?.confirmed_at);
  const account = !!user;

  const dobAge = pp.date_of_birth ? yearsOld(pp.date_of_birth) : null;
  const basic = !!(
    (authProfile?.full_name || "").trim() &&
    (pp.display_name || "").trim() &&
    pp.date_of_birth &&
    dobAge !== null &&
    dobAge >= 18 &&
    authProfile?.phone &&
    pp.base_address_place_id &&
    pp.base_postal_code &&
    pp.base_country_code &&
    pp.photo_path
  );

  const service = !!(
    pp.service_categories.length > 0 &&
    (pp.headline || "").trim().length > 0 &&
    (pp.bio || "").trim().length >= 40 &&
    pp.languages.length > 0 &&
    pp.service_area_radius_km &&
    pp.service_area_radius_km > 0 &&
    opts.hasActiveServicePrice === true
  );

  const insurance = !!(
    pp.insurance_policy_number?.trim() &&
    pp.insurance_doc_path?.trim() &&
    pp.insurance_expires_on &&
    pp.insurance_expires_on >= new Date().toISOString().slice(0, 10)
  );

  const smsVerified =
    opts.smsVerifiedAt !== undefined
      ? !!opts.smsVerifiedAt
      : !!authProfile?.sms_verified_at;
  const identity = pp.identity_status === "approved" && emailOk && smsVerified;

  const stripe =
    !!pp.stripe_charges_enabled &&
    !!pp.stripe_payouts_enabled &&
    !!pp.stripe_details_submitted &&
    !!pp.terms_accepted_at;

  // Fail closed: only recognised submitted/approved statuses count.
  const review = REVIEW_COMPLETE_STATUSES.has(pp.status);
  return { account, basic, service, insurance, identity, stripe, review };
}

export function computeStepCompletion(
  pp: ProviderProfile,
  authProfile: any,
  user: any,
  opts?: { hasActiveServicePrice?: boolean; smsVerifiedAt?: string | null },
): boolean[] {
  const byKey = computeStepCompletionByKey(pp, authProfile, user, opts);
  return ONBOARDING_STEP_KEYS.map((k) => byKey[k]);
}


