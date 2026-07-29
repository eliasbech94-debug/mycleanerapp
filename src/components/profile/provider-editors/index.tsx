/**
 * Native V2 provider profile section editors.
 *
 * Each editor is a self-contained form used inside `SectionEditDialog`
 * from the V2 provider profile overview. Business logic (allowed
 * columns, save, dirty tracking, trigger-safe payload) is delegated to
 * `useProviderProfileEditor` — no logic is duplicated from the legacy
 * page. Long-form editors that already exist as standalone components
 * (availability, identity, stripe, documents, tax, insurance upload)
 * are re-mounted directly.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { StripeConnectStatusWidget } from "@/components/provider/StripeConnectStatusWidget";
import { IdentityVerificationCard } from "@/components/identity/IdentityVerificationCard";
import { ProviderTaxProfileTab } from "@/components/profile/ProviderTaxProfileTab";
import ProviderShareCard from "@/components/provider/ProviderShareCard";
import { ProviderAvailabilityEditor } from "@/components/provider/ProviderAvailabilityEditor";
import type { OwnerCol, PP } from "@/hooks/useProviderProfileEditor";

export interface EditorProps {
  pp: PP;
  patch: (k: OwnerCol, v: unknown) => void;
}

const CATEGORIES = [
  ["cleaning", "Rengøring"], ["handyman", "Handyman"],
  ["garden", "Have"], ["moving", "Flytning"],
] as const;
const LANGS = [
  ["da", "Dansk"], ["en", "Engelsk"], ["sv", "Svensk"],
  ["de", "Tysk"], ["es", "Spansk"], ["pl", "Polsk"],
] as const;
const EQUIPMENT = [
  ["own_vacuum", "Egen støvsuger"], ["eco_products", "Miljøvenlige midler"],
  ["own_mop", "Egen mop/gulvsæt"], ["car", "Egen bil"], ["ladder", "Stige"],
] as const;

/* ------------------------------ Personal ------------------------------ */
export function PersonalEditor({ pp, patch }: EditorProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="display_name">Visningsnavn</Label>
        <Input id="display_name" value={pp.display_name ?? ""} maxLength={80}
          onChange={(e) => patch("display_name", e.target.value)} />
      </div>
      <div>
        <Label htmlFor="dob">Fødselsdato</Label>
        <Input id="dob" type="date" value={pp.date_of_birth ?? ""}
          onChange={(e) => patch("date_of_birth", e.target.value || null)} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="headline">Overskrift</Label>
        <Input id="headline" value={pp.headline ?? ""} maxLength={120}
          onChange={(e) => patch("headline", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="bio">Intern bio (kun synlig for admin)</Label>
        <Textarea id="bio" rows={3} value={pp.bio ?? ""} maxLength={2000}
          onChange={(e) => patch("bio", e.target.value)} />
      </div>
    </div>
  );
}

/* ------------------------------ Business ------------------------------ */
export function BusinessEditor({ pp, patch }: EditorProps) {
  const bio = String(pp.public_bio ?? "");
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="public_bio">Offentlig bio</Label>
        <Textarea id="public_bio" rows={5} value={bio} maxLength={1500}
          onChange={(e) => patch("public_bio", e.target.value)} />
        <p className="mt-1 text-xs text-muted-foreground">
          {bio.length}/1500 · vises på /p/{pp.provider_slug ?? "…"}
        </p>
      </div>
      <div>
        <Label htmlFor="years">År med erfaring</Label>
        <Input id="years" type="number" min={0} max={60} className="w-32"
          value={pp.years_experience ?? ""}
          onChange={(e) => patch("years_experience",
            e.target.value === "" ? null : Number(e.target.value))} />
      </div>
    </div>
  );
}

/* ------------------------------ Services ------------------------------ */
export function ServicesEditor({ pp, patch }: EditorProps) {
  const cats: string[] = (pp.service_categories ?? []) as string[];
  const toggle = (id: string) => {
    const next = cats.includes(id) ? cats.filter((c) => c !== id) : [...cats, id];
    patch("service_categories", next);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map(([id, label]) => {
        const on = cats.includes(id);
        return (
          <button key={id} type="button" onClick={() => toggle(id)}
            aria-pressed={on}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-semibold transition ${
              on ? "border-primary bg-primary text-primary-foreground"
                 : "border-border bg-background text-foreground"
            }`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Pricing ------------------------------- */
export function PricingEditor({ pp, patch }: EditorProps) {
  const rate = Number(pp.hourly_rate ?? 0);
  const commission = Math.round(rate * 0.14);
  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Label htmlFor="rate">Timepris (DKK)</Label>
        <Input id="rate" type="number" min={0} value={pp.hourly_rate ?? ""}
          onChange={(e) => patch("hourly_rate",
            e.target.value === "" ? null : Number(e.target.value))} />
      </div>
      <div className="grid gap-1 rounded-xl bg-muted/50 p-4 text-sm">
        <div className="flex justify-between"><span>Din pris</span><b>{rate} kr</b></div>
        <div className="flex justify-between">
          <span>Platform commission (14%)</span><b>{commission} kr</b>
        </div>
        <div className="flex justify-between text-primary">
          <span>Kundens pris (est.)</span><b>{rate + commission} kr</b>
        </div>
        <div className="flex justify-between text-primary">
          <span>Din udbetaling (est.)</span><b>{rate - commission} kr</b>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Endelig pris beregnes altid server-side inkl. VAT og evt. tillæg.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------- Area -------------------------------- */
export function AreaEditor({ pp, patch }: EditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Baseadresse</Label>
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
        <p className="mt-1 text-xs text-muted-foreground">
          Din præcise adresse deles aldrig — kun et cirkelområde vises offentligt.
        </p>
      </div>
      <div className="max-w-xs">
        <Label htmlFor="radius">Serviceradius (km)</Label>
        <Input id="radius" type="number" min={1} max={200}
          value={pp.service_area_radius_km ?? ""}
          onChange={(e) => patch("service_area_radius_km",
            e.target.value === "" ? null : Number(e.target.value))} />
      </div>
    </div>
  );
}

/* ------------------------------ Languages ----------------------------- */
export function LanguagesEditor({ pp, patch }: EditorProps) {
  const langs: string[] = (pp.languages ?? []) as string[];
  const toggle = (id: string) => {
    const next = langs.includes(id) ? langs.filter((c) => c !== id) : [...langs, id];
    patch("languages", next);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {LANGS.map(([id, label]) => {
        const on = langs.includes(id);
        return (
          <button key={id} type="button" onClick={() => toggle(id)}
            aria-pressed={on}
            className={`rounded-full border-2 px-4 py-1.5 text-sm transition ${
              on ? "border-primary bg-primary text-primary-foreground"
                 : "border-border bg-background text-foreground"
            }`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Equipment ----------------------------- */
export function EquipmentEditor({ pp, patch }: EditorProps) {
  const badges: Record<string, boolean> =
    (pp.equipment_badges ?? {}) as Record<string, boolean>;
  const toggle = (k: string) =>
    patch("equipment_badges", { ...badges, [k]: !badges[k] });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {EQUIPMENT.map(([k, label]) => (
        <label key={k}
          className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
          <span>{label}</span>
          <Switch checked={!!badges[k]} onCheckedChange={() => toggle(k)} />
        </label>
      ))}
    </div>
  );
}

/* ------------------------------ Insurance ----------------------------- */
export function InsuranceEditor({ pp, patch }: EditorProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="policy">Policenummer</Label>
          <Input id="policy" value={pp.insurance_policy_number ?? ""}
            onChange={(e) => patch("insurance_policy_number", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="expires">Udløbsdato</Label>
          <Input id="expires" type="date" value={pp.insurance_expires_on ?? ""}
            onChange={(e) => patch("insurance_expires_on", e.target.value || null)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Upload dokumentet i sektionen "Dokumenter". Admin verificerer det før det tæller som gyldigt.
      </p>
    </div>
  );
}

/* ------------------------------ Documents ----------------------------- */
export function DocumentsEditor() {
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<"insurance" | "other">("insurance");

  async function upload(file: File) {
    setUploading(true);
    try {
      const { data, error } = await supabase.functions.invoke("provider-document-upload", {
        body: { kind, content_type: file.type },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signed = (data as any)?.signed_url;
      if (error || !signed) throw new Error(error?.message || "Kunne ikke oprette upload");
      const put = await fetch(signed, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload fejlede (${put.status})`);
      toast.success("Dokument uploadet");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fejlede");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Filerne er private. Identitetsdokumenter håndteres separat via Sumsub i sektionen "Verifikation".
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <select value={kind}
          onChange={(e) => setKind(e.target.value as "insurance" | "other")}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm">
          <option value="insurance">Forsikring</option>
          <option value="other">Andet</option>
        </select>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border-2 border-primary bg-background px-4 py-2 text-sm font-semibold text-primary">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
          <input type="file" className="hidden"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
    </div>
  );
}

/* ------------------------------ Settings ------------------------------ */
export function SettingsEditor({
  pp, patch, onReload,
}: EditorProps & { onReload: () => void }) {
  const [busy, setBusy] = useState(false);
  const paused = pp.status === "paused";

  async function pause() {
    if (!confirm("Sæt din profil på pause? Du vises ikke længere på marketplace før du genoptager.")) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke("provider-self-pause",
      { body: { reason: "provider_settings" } });
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
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 font-display text-base">Del din profil</h3>
        <ProviderShareCard slug={pp.provider_slug} isPublic={!!pp.is_public} onRenamed={onReload} />
      </section>

      <section>
        <h3 className="mb-2 font-display text-base">Synlighed</h3>
        <label className="flex items-center justify-between rounded-lg border border-border p-3">
          <span>
            <span className="block font-medium">Vis min profil offentligt</span>
            <span className="block text-xs text-muted-foreground">
              Kræver aktiv status og opfyldte krav.
            </span>
          </span>
          <Switch checked={!!pp.is_public} onCheckedChange={(v) => patch("is_public", v)} />
        </label>
      </section>

      <section>
        <h3 className="mb-2 font-display text-base">Konto-status</h3>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <div className="text-sm font-medium">{paused ? "På pause" : "Aktiv"}</div>
            <div className="text-xs text-muted-foreground">
              Pausér midlertidigt uden at miste score eller historik.
            </div>
          </div>
          {paused ? (
            <Button onClick={resume} disabled={busy} size="sm">Genoptag</Button>
          ) : (
            <Button variant="outline" onClick={pause} disabled={busy} size="sm">Pausér</Button>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-display text-base">Databehandling (GDPR)</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={requestExport}>Anmod om dataeksport</Button>
          <Button variant="outline" size="sm" onClick={requestDeletion}>Anmod om sletning</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Bogføring, bookings og juridiske dokumenter opbevares iht. lovkrav.
        </p>
      </section>
    </div>
  );
}

/* --- Re-exports for the standalone editors (no logic duplication) --- */
export { ProviderAvailabilityEditor as AvailabilityEditor };
export { IdentityVerificationCard as IdentityEditor };
export { StripeConnectStatusWidget as StripeEditor };
export { ProviderTaxProfileTab as TaxEditor };
