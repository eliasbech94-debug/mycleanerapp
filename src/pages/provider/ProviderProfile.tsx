// Provider self-service profile — /provider/profile
// STEP 3C-iii: 16-tab shell. Frontend edits ONLY owner-safe fields.
// Protected fields (status, visibility, score, tier, trust, identity,
// stripe readiness, timestamps) are enforced by trigger
// `provider_profiles_block_privileged_update` — never included in updates here.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ExternalLink, Save, Pause, Play, ShieldAlert, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import BackButton from "@/components/BackButton";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { StripeConnectStatusWidget } from "@/components/provider/StripeConnectStatusWidget";
import { IdentityVerificationCard } from "@/components/identity/IdentityVerificationCard";
import { ProviderScorePreview } from "@/components/provider/ProviderScorePreview";
import { ProviderTaxProfileTab } from "@/components/profile/ProviderTaxProfileTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

/**
 * Whitelist of columns a provider is allowed to update from the client.
 * Anything outside this list is either read-only or blocked by the DB trigger.
 * Keeping the list here makes review + tests trivial.
 */
const OWNER_EDITABLE_COLUMNS = [
  "display_name", "headline", "bio", "public_bio", "photo_path",
  "languages", "years_experience", "hourly_rate", "service_categories",
  "service_area_radius_km", "base_address_place_id", "base_address_formatted",
  "base_country_code", "base_lat", "base_lng", "base_validation_source",
  "date_of_birth", "insurance_policy_number", "insurance_expires_on",
  "insurance_doc_path", "equipment_badges", "is_public",
] as const;
type OwnerCol = typeof OWNER_EDITABLE_COLUMNS[number];

const TABS = [
  ["personal", "Personlig"], ["business", "Virksomhed"], ["services", "Ydelser"],
  ["pricing", "Priser"], ["availability", "Tilgængelighed"], ["area", "Serviceområde"],
  ["languages", "Sprog"], ["equipment", "Udstyr"], ["insurance", "Forsikring"],
  ["documents", "Dokumenter"], ["identity", "Identitet"], ["stripe", "Stripe & Udbetaling"],
  ["tax", "Skat"], ["performance", "Ydeevne"], ["reviews", "Anmeldelser"], ["settings", "Indstillinger"],
] as const;

const CATEGORIES = [
  ["cleaning", "Rengøring"], ["handyman", "Handyman"], ["garden", "Have"], ["moving", "Flytning"],
] as const;
const LANGS = [
  ["da", "Dansk"], ["en", "Engelsk"], ["sv", "Svensk"], ["de", "Tysk"], ["es", "Spansk"], ["pl", "Polsk"],
] as const;

type PP = Record<string, any>;

export default function ProviderProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const activeTab = params.get("tab") || "personal";
  const [pp, setPp] = useState<PP | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Partial<Record<OwnerCol, any>>>({});
  const autosave = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("provider_profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (error) toast.error("Kunne ikke hente profil");
    setPp(data as PP | null);
    setLoading(false);
  }, [user]);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  // Warn on unsaved changes
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (Object.keys(dirty).length === 0) return;
      e.preventDefault(); e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const patch = useCallback((k: OwnerCol, v: any) => {
    setPp((p) => (p ? { ...p, [k]: v } : p));
    setDirty((d) => ({ ...d, [k]: v }));
  }, []);

  const save = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user || Object.keys(dirty).length === 0) return;
    // Guard: strip anything not in the whitelist (defence in depth).
    const payload: Record<string, any> = {};
    for (const k of Object.keys(dirty) as OwnerCol[]) {
      if ((OWNER_EDITABLE_COLUMNS as readonly string[]).includes(k)) payload[k] = (dirty as any)[k];
    }
    setSaving(true);
    const { error } = await (supabase.from("provider_profiles") as any)
      .update(payload).eq("user_id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message || "Kunne ikke gemme"); return; }
    setDirty({});
    if (!opts?.silent) toast.success("Gemt");
  }, [user, dirty]);

  // Autosave (debounced) for lightweight edits
  useEffect(() => {
    if (Object.keys(dirty).length === 0) return;
    if (autosave.current) window.clearTimeout(autosave.current);
    autosave.current = window.setTimeout(() => save({ silent: true }), 1500);
    return () => { if (autosave.current) window.clearTimeout(autosave.current); };
  }, [dirty, save]);

  const setTab = (t: string) => { params.set("tab", t); setParams(params, { replace: true }); };

  if (authLoading || loading) {
    return <div className="mx-auto max-w-5xl p-6 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>;
  }
  if (!user) { navigate("/login"); return null; }
  if (!pp) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center">
        <h1 className="text-2xl font-bold mb-2">Ingen provider-profil</h1>
        <p className="opacity-70 mb-4">Du skal starte en cleaner-ansøgning først.</p>
        <Button onClick={() => navigate("/bliv-cleaner")}>Bliv cleaner</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="font-display text-3xl">Min profil</h1>
            <div className="text-xs opacity-70 flex items-center gap-2 mt-1">
              <StatusBadge status={pp.status} />
              <span>·</span>
              <span>{pp.completion_pct ?? 0}% komplet</span>
              {pp.provider_slug && pp.is_public && (
                <>
                  <span>·</span>
                  <Link to={`/c/${pp.provider_slug}`} className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                    Se offentlig profil <ExternalLink className="h-3 w-3" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {Object.keys(dirty).length > 0 && <span className="text-xs opacity-60">Ugemte ændringer</span>}
          <Button onClick={() => save()} disabled={saving || Object.keys(dirty).length === 0} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Gem
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setTab} className="w-full">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <TabsList className="w-max sm:w-full flex-wrap h-auto px-4 sm:px-0">
            {TABS.map(([id, label]) => (
              <TabsTrigger key={id} value={id} className="text-xs whitespace-nowrap">{label}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="personal"><PersonalTab pp={pp} patch={patch} /></TabsContent>
        <TabsContent value="business"><BusinessTab pp={pp} patch={patch} /></TabsContent>
        <TabsContent value="services"><ServicesTab pp={pp} patch={patch} /></TabsContent>
        <TabsContent value="pricing"><PricingTab pp={pp} patch={patch} /></TabsContent>
        <TabsContent value="availability"><AvailabilityTab /></TabsContent>
        <TabsContent value="area"><AreaTab pp={pp} patch={patch} /></TabsContent>
        <TabsContent value="languages"><LanguagesTab pp={pp} patch={patch} /></TabsContent>
        <TabsContent value="equipment"><EquipmentTab pp={pp} patch={patch} /></TabsContent>
        <TabsContent value="insurance"><InsuranceTab pp={pp} patch={patch} /></TabsContent>
        <TabsContent value="documents"><DocumentsTab /></TabsContent>
        <TabsContent value="identity"><IdentityVerificationCard /></TabsContent>
        <TabsContent value="stripe"><StripeConnectStatusWidget /></TabsContent>
        <TabsContent value="tax"><ProviderTaxProfileTab /></TabsContent>
        <TabsContent value="performance"><PerformanceTab pp={pp} /></TabsContent>
        <TabsContent value="reviews"><ReviewsTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab pp={pp} patch={patch} onReload={load} /></TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "active" ? "bg-green-100 text-green-800"
    : status === "suspended" ? "bg-red-100 text-red-800"
    : status === "paused" ? "bg-yellow-100 text-yellow-800"
    : "bg-gray-100 text-gray-700";
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${color}`}>{status?.replace(/_/g, " ")}</span>;
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border bg-white p-5 sm:p-6">
      <h2 className="font-display text-xl">{title}</h2>
      {desc && <p className="mt-1 text-sm opacity-70">{desc}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

/* ----------------------------- Tab: Personal ----------------------------- */
function PersonalTab({ pp, patch }: { pp: PP; patch: (k: OwnerCol, v: any) => void }) {
  return (
    <Section title="Personlige oplysninger">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label>Visningsnavn</Label>
          <Input value={pp.display_name ?? ""} onChange={(e) => patch("display_name", e.target.value)} maxLength={80} /></div>
        <div><Label>Fødselsdato</Label>
          <Input type="date" value={pp.date_of_birth ?? ""} onChange={(e) => patch("date_of_birth", e.target.value || null)} /></div>
        <div className="sm:col-span-2"><Label>Overskrift (headline)</Label>
          <Input value={pp.headline ?? ""} onChange={(e) => patch("headline", e.target.value)} maxLength={120} /></div>
        <div className="sm:col-span-2"><Label>Intern bio</Label>
          <Textarea rows={3} value={pp.bio ?? ""} onChange={(e) => patch("bio", e.target.value)} maxLength={2000} /></div>
      </div>
    </Section>
  );
}

/* ----------------------------- Tab: Business ----------------------------- */
function BusinessTab({ pp, patch }: { pp: PP; patch: (k: OwnerCol, v: any) => void }) {
  return (
    <Section title="Virksomhedsprofil" desc="Offentlig bio vises på marketplace. Skatte-/CVR-oplysninger håndteres i Skat-fanen.">
      <div><Label>Offentlig bio</Label>
        <Textarea rows={4} value={pp.public_bio ?? ""} onChange={(e) => patch("public_bio", e.target.value)} maxLength={1500} />
        <p className="mt-1 text-xs opacity-60">Vises på /c/{pp.provider_slug ?? "…"}</p></div>
      <div><Label>År med erfaring</Label>
        <Input type="number" min={0} max={60} className="w-32" value={pp.years_experience ?? ""}
          onChange={(e) => patch("years_experience", e.target.value === "" ? null : Number(e.target.value))} /></div>
    </Section>
  );
}

/* ----------------------------- Tab: Services ----------------------------- */
function ServicesTab({ pp, patch }: { pp: PP; patch: (k: OwnerCol, v: any) => void }) {
  const cats: string[] = pp.service_categories ?? [];
  const toggle = (id: string) => {
    const next = cats.includes(id) ? cats.filter((c) => c !== id) : [...cats, id];
    patch("service_categories", next);
  };
  return (
    <Section title="Ydelser" desc="Vælg de kategorier du tilbyder. Detaljerede booking-regler (min varighed, gentagelser) håndteres pr. booking i backend.">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(([id, label]) => (
          <button key={id} onClick={() => toggle(id)}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-semibold ${cats.includes(id) ? "bg-teal-700 text-white border-teal-700" : "bg-white text-gray-700 border-gray-300"}`}>
            {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

/* ----------------------------- Tab: Pricing ------------------------------ */
function PricingTab({ pp, patch }: { pp: PP; patch: (k: OwnerCol, v: any) => void }) {
  const rate = Number(pp.hourly_rate ?? 0);
  const commission = Math.round(rate * 0.14);
  const customer = rate + commission;
  const payout = rate - commission;
  return (
    <Section title="Priser" desc="Endelig booking-pris beregnes altid server-side inkl. VAT og evt. tillæg.">
      <div className="max-w-xs"><Label>Timepris (DKK)</Label>
        <Input type="number" min={0} value={pp.hourly_rate ?? ""} onChange={(e) => patch("hourly_rate", e.target.value === "" ? null : Number(e.target.value))} /></div>
      <div className="rounded-xl bg-gray-50 p-4 text-sm grid gap-1">
        <div className="flex justify-between"><span>Din pris</span><b>{rate} kr</b></div>
        <div className="flex justify-between"><span>Platform commission (14%)</span><b>{commission} kr</b></div>
        <div className="flex justify-between text-teal-800"><span>Kundens pris (est.)</span><b>{customer} kr</b></div>
        <div className="flex justify-between text-teal-800"><span>Din udbetaling (est.)</span><b>{payout} kr</b></div>
        <p className="mt-2 text-xs opacity-60">Estimater. Tillæg for weekend/helligdage/same-day konfigureres i backend.</p>
      </div>
    </Section>
  );
}

/* -------------------------- Tab: Availability ---------------------------- */
function AvailabilityTab() {
  return (
    <Section title="Tilgængelighed" desc="Ugeskema, pauser og bookingvinduer.">
      <div className="rounded-xl border-2 border-dashed p-6 text-center text-sm opacity-70">
        Kalender-editor kommer snart. Tag i mellemtiden kontakt til support for at justere dine åbningstider.
      </div>
    </Section>
  );
}

/* ------------------------------ Tab: Area -------------------------------- */
function AreaTab({ pp, patch }: { pp: PP; patch: (k: OwnerCol, v: any) => void }) {
  return (
    <Section title="Serviceområde" desc="Din præcise adresse deles aldrig offentligt — kun et cirkelområde vises.">
      <AddressAutocomplete
        value={pp.base_address_formatted ?? ""}
        onChange={(v) => patch("base_address_formatted", v)}
        onSelect={(res) => {
          patch("base_address_place_id", res.placeId);
          patch("base_address_formatted", res.address);
          if (res.lat != null) patch("base_lat", res.lat);
          if (res.lng != null) patch("base_lng", res.lng);
        }}
        countries={[(pp.base_country_code ?? "DK").toLowerCase()]}
      />
      <div className="max-w-xs">
        <Label>Serviceradius (km)</Label>
        <Input type="number" min={1} max={200} value={pp.service_area_radius_km ?? ""}
          onChange={(e) => patch("service_area_radius_km", e.target.value === "" ? null : Number(e.target.value))} />
      </div>
    </Section>
  );
}

/* ---------------------------- Tab: Languages ----------------------------- */
function LanguagesTab({ pp, patch }: { pp: PP; patch: (k: OwnerCol, v: any) => void }) {
  const langs: string[] = pp.languages ?? [];
  const toggle = (id: string) => {
    const next = langs.includes(id) ? langs.filter((c) => c !== id) : [...langs, id];
    patch("languages", next);
  };
  return (
    <Section title="Sprog">
      <div className="flex flex-wrap gap-2">
        {LANGS.map(([id, label]) => (
          <button key={id} onClick={() => toggle(id)}
            className={`rounded-full border-2 px-4 py-1.5 text-sm ${langs.includes(id) ? "bg-teal-700 text-white border-teal-700" : "bg-white border-gray-300"}`}>
            {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

/* ---------------------------- Tab: Equipment ----------------------------- */
function EquipmentTab({ pp, patch }: { pp: PP; patch: (k: OwnerCol, v: any) => void }) {
  const badges: Record<string, boolean> = (pp.equipment_badges ?? {}) as any;
  const items = [
    ["own_vacuum", "Egen støvsuger"], ["eco_products", "Miljøvenlige midler"],
    ["own_mop", "Egen mop/gulvsæt"], ["car", "Egen bil"], ["ladder", "Stige"],
  ] as const;
  const toggle = (k: string) => patch("equipment_badges", { ...badges, [k]: !badges[k] });
  return (
    <Section title="Udstyr & materialer">
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(([k, label]) => (
          <label key={k} className="flex items-center justify-between rounded-lg border p-3">
            <span>{label}</span>
            <Switch checked={!!badges[k]} onCheckedChange={() => toggle(k)} />
          </label>
        ))}
      </div>
    </Section>
  );
}

/* ---------------------------- Tab: Insurance ----------------------------- */
function InsuranceTab({ pp, patch }: { pp: PP; patch: (k: OwnerCol, v: any) => void }) {
  return (
    <Section title="Forsikring" desc="Dokumentet verificeres af admin før det tæller som gyldigt.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label>Policenummer</Label>
          <Input value={pp.insurance_policy_number ?? ""} onChange={(e) => patch("insurance_policy_number", e.target.value)} /></div>
        <div><Label>Udløbsdato</Label>
          <Input type="date" value={pp.insurance_expires_on ?? ""} onChange={(e) => patch("insurance_expires_on", e.target.value || null)} /></div>
      </div>
      <div className="text-xs opacity-70">Upload forsikringsdokument i fanen "Dokumenter".</div>
    </Section>
  );
}

/* ---------------------------- Tab: Documents ----------------------------- */
function DocumentsTab() {
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<"insurance" | "other">("insurance");

  async function upload(file: File) {
    setUploading(true);
    try {
      const { data, error } = await supabase.functions.invoke("provider-document-upload", {
        body: { kind, content_type: file.type },
      });
      if (error || !data?.signed_url) throw new Error(error?.message || "Kunne ikke oprette upload");
      const put = await fetch(data.signed_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error(`Upload fejlede (${put.status})`);
      toast.success("Dokument uploadet");
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  }

  return (
    <Section title="Dokumenter" desc="Signerede URLs — filerne er private. Identitetsdokumenter håndteres separat i Identitet-fanen.">
      <div className="flex flex-wrap items-center gap-3">
        <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="h-10 rounded-md border px-3 text-sm">
          <option value="insurance">Forsikring</option>
          <option value="other">Andet</option>
        </select>
        <label className="inline-flex items-center gap-2 rounded-md border-2 border-teal-700 bg-white px-4 py-2 text-sm font-semibold cursor-pointer">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
          <input type="file" className="hidden" accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} disabled={uploading} />
        </label>
      </div>
    </Section>
  );
}

/* --------------------------- Tab: Performance ---------------------------- */
function PerformanceTab({ pp }: { pp: PP }) {
  const { user } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    supabase.from("provider_score_history").select("provider_score,provider_tier,calculated_at,metrics_snapshot")
      .eq("user_id", user.id).order("calculated_at", { ascending: false }).limit(30)
      .then(({ data }) => setHistory(data ?? []));
  }, [user]);

  const snap = (pp.performance_snapshot ?? {}) as any;
  return (
    <div>
      <Section title="Marketplace Score & Tier">
        <ProviderScorePreview />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
          <Stat label="Score" value={pp.provider_score ?? "—"} />
          <Stat label="Tier" value={pp.provider_tier ?? "—"} />
          <Stat label="Bookings" value={snap.completed_count ?? 0} />
          <Stat label="Rating" value={snap.avg_rating != null ? Number(snap.avg_rating).toFixed(2) : "—"} />
          <Stat label="Accept-rate" value={pct(snap.acceptance_rate)} />
          <Stat label="Fuldførelse" value={pct(snap.completion_rate)} />
          <Stat label="Aflysninger" value={pct(snap.cancellation_rate)} />
          <Stat label="Gengangere" value={pct(snap.repeat_customer_rate)} />
        </div>
      </Section>
      <Section title="Score-historik">
        {history.length === 0 ? (
          <p className="text-sm opacity-70">Ingen historik endnu.</p>
        ) : (
          <ul className="divide-y text-sm">
            {history.map((h, i) => (
              <li key={i} className="flex justify-between py-2">
                <span>{new Date(h.calculated_at).toLocaleDateString("da-DK")}</span>
                <span className="font-mono">{h.provider_score} · {h.provider_tier}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
const Stat = ({ label, value }: { label: string; value: any }) => (
  <div className="rounded-lg bg-gray-50 p-3"><div className="text-[10px] uppercase opacity-60">{label}</div><div className="text-lg font-bold">{value}</div></div>
);
const pct = (v: any) => v == null ? "—" : `${Math.round(Number(v) * 100)}%`;

/* ----------------------------- Tab: Reviews ------------------------------ */
function ReviewsTab() {
  return (
    <Section title="Anmeldelser" desc="Kundeanmeldelser vises her når bookings er fuldført.">
      <div className="rounded-xl border-2 border-dashed p-8 text-center text-sm opacity-70">
        <Star className="mx-auto mb-2 h-6 w-6 opacity-40" />
        Ingen anmeldelser endnu.
      </div>
    </Section>
  );
}

/* ----------------------------- Tab: Settings ----------------------------- */
function SettingsTab({ pp, patch, onReload }: { pp: PP; patch: (k: OwnerCol, v: any) => void; onReload: () => void }) {
  const [busy, setBusy] = useState(false);
  const paused = pp.status === "paused";

  async function pause() {
    if (!confirm("Sæt din profil på pause? Du vises ikke længere på marketplace før du genoptager.")) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke("provider-self-pause", { body: { reason: "provider_settings" } });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profil sat på pause"); onReload();
  }
  async function resume() {
    setBusy(true);
    const { error } = await supabase.functions.invoke("provider-self-resume", { body: {} });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profil genoptaget"); onReload();
  }
  async function requestExport() {
    const { error } = await supabase.functions.invoke("gdpr-export-request", { body: {} });
    if (error) return toast.error(error.message);
    toast.success("Eksport anmodet — du får en e-mail");
  }
  async function requestDeletion() {
    if (!confirm("Anmod om sletning af din konto? Finansielle og juridiske bilag bevares som krævet af lovgivningen.")) return;
    const { error } = await supabase.functions.invoke("gdpr-delete-request", { body: {} });
    if (error) return toast.error(error.message);
    toast.success("Sletning anmodet");
  }

  return (
    <div>
      <Section title="Synlighed på marketplace">
        <label className="flex items-center justify-between">
          <span>
            <div className="font-medium">Vis min profil offentligt</div>
            <div className="text-xs opacity-60">Kræver aktiv status og opfyldte krav.</div>
          </span>
          <Switch checked={!!pp.is_public} onCheckedChange={(v) => patch("is_public", v)} />
        </label>
      </Section>

      <Section title="Konto-status">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium flex items-center gap-2">
              {paused ? "På pause" : "Aktiv"} <StatusBadge status={pp.status} />
            </div>
            <div className="text-xs opacity-60">Pausér midlertidigt, uden at miste score eller historik.</div>
          </div>
          {paused ? (
            <Button onClick={resume} disabled={busy}><Play className="h-4 w-4 mr-1" /> Genoptag</Button>
          ) : (
            <Button variant="outline" onClick={pause} disabled={busy}><Pause className="h-4 w-4 mr-1" /> Pausér</Button>
          )}
        </div>
      </Section>

      <Section title="Databehandling (GDPR)">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={requestExport}>Anmod om dataeksport</Button>
          <Button variant="outline" onClick={requestDeletion}>
            <ShieldAlert className="h-4 w-4 mr-1" /> Anmod om sletning
          </Button>
        </div>
        <p className="text-xs opacity-60">Bogføring, bookings og juridiske dokumenter opbevares iht. lovkrav.</p>
      </Section>
    </div>
  );
}

// Exposed for tests
export const __OWNER_EDITABLE_COLUMNS = OWNER_EDITABLE_COLUMNS;
export const PROTECTED_COLUMNS = [
  "status", "visibility", "provider_score", "provider_tier", "tier_is_manual",
  "tier_calculated_at", "identity_status", "stripe_charges_enabled",
  "stripe_payouts_enabled", "stripe_details_submitted", "stripe_requirements_due",
  "stripe_disabled_reason", "payout_frozen", "payout_frozen_reason",
  "approved_at", "approved_by", "activated_at", "suspended_at", "suspended_by",
  "rejected_at", "rejected_reason", "archived_at", "archived_by", "submitted_at",
] as const;
