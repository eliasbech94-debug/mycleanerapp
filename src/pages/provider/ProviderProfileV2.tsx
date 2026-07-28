// Provider Profile v2 — premium overview surface for /provider/profile.
// Reads the same underlying rows as the legacy 16-tab editor
// (`provider_profiles`, `provider_service_prices`, `bookings`). All
// editing is now native V2: every "Redigér" opens a SectionEditDialog
// with a form from `provider-editors`. No `?legacy=1` links in normal
// user flow — the safety-net remains reachable via `/provider/profile?legacy=1`.
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ExternalLink, Pencil, ShieldCheck, MapPin, Languages, Wrench,
  FileBadge, CalendarClock, Sparkles, Star, User as UserIcon, Briefcase,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { useProviderProfileEditor } from "@/hooks/useProviderProfileEditor";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatCard, SectionCard, EmptyState, ComingSoonCard, WelcomeHeader,
  SectionErrorState, SectionEditDialog,
} from "@/components/dashboard/primitives";
import {
  AreaEditor, AvailabilityEditor, BusinessEditor, DocumentsEditor,
  EquipmentEditor, IdentityEditor, InsuranceEditor, LanguagesEditor,
  PersonalEditor, PricingEditor, ServicesEditor, SettingsEditor,
  StripeEditor, TaxEditor,
} from "@/components/profile/provider-editors";

type EditorKey =
  | "personal" | "business" | "languages" | "equipment" | "services"
  | "pricing" | "area" | "availability" | "identity" | "insurance"
  | "documents" | "performance" | "settings" | "stripe" | "tax";

const CATEGORY_LABEL: Record<string, string> = {
  cleaning: "Rengøring", handyman: "Handyman", garden: "Have", moving: "Flytning",
};
const LANG_LABEL: Record<string, string> = {
  da: "Dansk", en: "Engelsk", sv: "Svensk", de: "Tysk", es: "Spansk", pl: "Polsk",
};
const EQUIP_LABEL: Record<string, string> = {
  own_vacuum: "Egen støvsuger", eco_products: "Miljøvenlige midler",
  own_mop: "Egen mop/gulvsæt", car: "Egen bil", ladder: "Stige",
};
const SERVICE_LABEL: Record<string, string> = {
  home_cleaning: "Almindelig rengøring", deep_cleaning: "Hovedrengøring",
  move_out_cleaning: "Flytterengøring", office_cleaning: "Erhvervsrengøring",
  window_cleaning: "Vinduespudsning",
};

const formatMoney = (minor: number, currency: string) => {
  try {
    return new Intl.NumberFormat("da-DK", { style: "currency", currency, maximumFractionDigits: 0 })
      .format(minor / 100);
  } catch { return `${Math.round(minor / 100)} ${currency}`; }
};

export default function ProviderProfileV2() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const view = useProviderProfile();
  const editor = useProviderProfileEditor();
  const [openEditor, setOpenEditor] = useState<EditorKey | null>(null);

  const closeEditor = useCallback(() => {
    editor.reset();
    setOpenEditor(null);
  }, [editor]);

  const handleSave = useCallback(async () => {
    const ok = await editor.save();
    if (ok) {
      await view.refetch();
      setOpenEditor(null);
    }
  }, [editor, view]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 10) return "Godmorgen";
    if (h < 18) return "Goddag";
    return "Godaften";
  }, []);

  if (!authLoading && !user) { navigate("/login"); return null; }

  if (view.loading || authLoading || editor.loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const p = view.profile;
  if (!p) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center">
        <h1 className="font-display text-2xl">Ingen provider-profil</h1>
        <p className="mt-2 opacity-70">Du skal starte en cleaner-ansøgning først.</p>
        <Button className="mt-4" onClick={() => navigate("/bliv-cleaner")}>Bliv cleaner</Button>
      </div>
    );
  }

  const firstName = (p.display_name ?? user?.email?.split("@")[0] ?? "").split(" ")[0] || null;
  const activePrices = view.prices.filter((x) => x.active);
  const langs = (p.languages ?? []) as string[];
  const cats = (p.service_categories ?? []) as string[];
  const equip = Object.entries((p.equipment_badges ?? {}) as Record<string, boolean>)
    .filter(([, v]) => v).map(([k]) => k);
  const insuranceValid = !!p.insurance_expires_on &&
    new Date(p.insurance_expires_on as string) > new Date();
  const identity = (p.identity_status as string | null) ?? "unverified";
  const identityOk = identity === "approved";
  const stripeReady = !!p.stripe_charges_enabled && !!p.stripe_payouts_enabled;
  const snap = (p.performance_snapshot ?? {}) as Record<string, number | null>;

  const editBtn = (key: EditorKey, label = "Redigér") => (
    <Button variant="ghost" size="sm" className="text-primary"
      aria-label={`${label} — ${key}`}
      onClick={() => setOpenEditor(key)}>
      <Pencil className="mr-1 h-3.5 w-3.5" /> {label}
    </Button>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      {view.error && (
        <SectionErrorState message={view.error} onRetry={view.refetch} compact />
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="sr-only">Min profil</h1>
            <div className="text-xs opacity-70">Din offentlige profil og oplysninger</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {p.provider_slug && p.is_public && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/p/${p.provider_slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-4 w-4" /> Se offentlig profil
              </Link>
            </Button>
          )}
          <Button size="sm" onClick={() => setOpenEditor("personal")}>
            <Pencil className="mr-1 h-4 w-4" /> Redigér profil
          </Button>
        </div>
      </div>

      <WelcomeHeader
        greeting={greeting}
        name={firstName}
        subtitle={p.headline ?? "Din profil styrer hvordan kunder ser dig på marketplace."}
        completion={p.completion_pct ?? null}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label="Status" value={(p.status ?? "draft").replace(/_/g, " ")}
              tone={p.status === "active" ? "ok" : "warn"} />
            <StatusPill label="Synlighed" value={p.is_public ? "Offentlig" : "Skjult"}
              tone={p.is_public ? "ok" : "warn"} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Fuldførte jobs" value={view.completedJobs} icon={Briefcase} />
        <StatCard label="Års erfaring" value={p.years_experience ?? "—"} icon={Sparkles} />
        <StatCard label="Svartid"
          value={snap.avg_response_seconds != null
            ? `${Math.round(Number(snap.avg_response_seconds) / 60)} min`
            : "—"}
          hint="Sidste 30 dage" />
        <StatCard label="Accept-rate"
          value={snap.acceptance_rate != null
            ? `${Math.round(Number(snap.acceptance_rate) * 100)}%` : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Profilbillede & identitet" action={editBtn("personal")}>
          <div className="flex items-center gap-4">
            <span aria-hidden
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {(p.display_name ?? "?").slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg">{p.display_name ?? "Uden navn"}</p>
              {p.headline && <p className="truncate text-sm text-muted-foreground">{p.headline}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <IdentityBadge status={identity} />
                {p.provider_tier && <Badge variant="outline">{p.provider_tier}</Badge>}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Om mig" action={editBtn("business")}>
          {p.public_bio ? (
            <p className="whitespace-pre-line text-sm text-foreground">{p.public_bio}</p>
          ) : (
            <EmptyState icon={UserIcon} title="Ingen offentlig bio endnu"
              description="Fortæl kunderne hvem du er, og hvorfor de skal vælge dig." />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Sprog" action={editBtn("languages")}>
          <div className="flex flex-wrap gap-2">
            {langs.length === 0 ? (
              <EmptyState icon={Languages} title="Ingen sprog valgt" />
            ) : langs.map((l) => (
              <Badge key={l} variant="secondary">{LANG_LABEL[l] ?? l}</Badge>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Erfaring & udstyr" action={editBtn("equipment")}>
          <div className="space-y-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Erfaring: </span>
              <b>{p.years_experience != null ? `${p.years_experience} år` : "—"}</b>
            </div>
            <div className="flex flex-wrap gap-2">
              {equip.length === 0
                ? <span className="text-sm text-muted-foreground">Ingen udstyr markeret.</span>
                : equip.map((k) => (
                  <Badge key={k} variant="outline" className="gap-1">
                    <Wrench className="h-3 w-3" /> {EQUIP_LABEL[k] ?? k}
                  </Badge>
                ))}
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Ydelser & priser"
        description="Hver service har sin egen timepris. Endelige priser beregnes altid server-side."
        action={
          <div className="flex gap-1">
            {editBtn("services", "Kategorier")}
            {editBtn("pricing", "Priser")}
          </div>
        }>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {cats.length === 0
              ? <span className="text-sm text-muted-foreground">Ingen kategorier valgt.</span>
              : cats.map((c) => (
                <Badge key={c} className="bg-primary/10 text-primary hover:bg-primary/15">
                  {CATEGORY_LABEL[c] ?? c}
                </Badge>
              ))}
          </div>

          {activePrices.length === 0 ? (
            <EmptyState icon={Briefcase} title="Ingen individuelle serviceprises endnu"
              description="Sæt priser pr. service så kunderne ved præcis hvad det koster."
              action={<Button size="sm" onClick={() => setOpenEditor("pricing")}>Tilføj priser</Button>} />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {activePrices.map((row) => (
                <li key={row.service_code} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">
                    {SERVICE_LABEL[row.service_code] ?? row.service_code}
                  </span>
                  <span className="text-sm font-semibold">
                    {formatMoney(row.amount_minor, row.currency)}<span className="opacity-60"> /t.</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Serviceområde" action={editBtn("area")}>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{p.base_address_formatted ?? "Ingen adresse valgt"}</div>
                <div className="text-xs text-muted-foreground">
                  Kun et cirkelområde vises offentligt — aldrig præcis adresse.
                </div>
              </div>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Radius: </span>
              <b>{p.service_area_radius_km != null ? `${p.service_area_radius_km} km` : "—"}</b>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Tilgængelighed" action={editBtn("availability")}>
          <div className="flex items-start gap-2 text-sm">
            <CalendarClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <p>Dit ugeskema og bookingvinduer.</p>
          </div>
          <Button variant="outline" size="sm" className="mt-3"
            onClick={() => setOpenEditor("availability")}>
            Åbn kalender-editor
          </Button>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Verifikation" action={editBtn("identity")}>
          <div className="space-y-2 text-sm">
            <Row icon={ShieldCheck} label="Identitet"
              value={identityOk ? "Verificeret" : "Mangler"} ok={identityOk} />
            <Row icon={ShieldCheck} label="Stripe udbetaling"
              value={stripeReady ? "Klar" : "Ikke klar"} ok={stripeReady} />
            <Button variant="link" size="sm" className="px-0 text-primary"
              onClick={() => setOpenEditor("stripe")}>
              Åbn Stripe-status
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Forsikring" action={editBtn("insurance")}>
          <div className="space-y-2 text-sm">
            <Row icon={FileBadge} label="Police" value={p.insurance_policy_number || "—"}
              ok={!!p.insurance_policy_number} />
            <Row icon={FileBadge} label="Udløber"
              value={(p.insurance_expires_on as string | null) ?? "—"} ok={insuranceValid} />
          </div>
        </SectionCard>

        <SectionCard title="Dokumenter" action={editBtn("documents", "Upload")}>
          <div className="text-sm">
            <Row icon={FileBadge} label="Forsikringsdokument"
              value={p.insurance_doc_path ? "Uploadet" : "Mangler"} ok={!!p.insurance_doc_path} />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Ydeevne" action={editBtn("performance", "Se detaljer")}>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Score" value={p.provider_score ?? "—"} />
            <MiniStat label="Tier" value={p.provider_tier ?? "—"} />
            <MiniStat label="Fuldførte" value={view.completedJobs} />
            <MiniStat label="Accept-rate"
              value={snap.acceptance_rate != null
                ? `${Math.round(Number(snap.acceptance_rate) * 100)}%` : "—"} />
          </div>
        </SectionCard>

        <ComingSoonCard title="Kundeanmeldelser"
          description="Vises her når kunder afgiver anmeldelser på fuldførte bookings." />
      </div>

      <SectionCard title="Skat" action={editBtn("tax", "Åbn skatteprofil")}>
        <p className="text-sm text-muted-foreground">
          CVR/CPR og skatte-indstillinger opdateres i sin egen editor.
        </p>
      </SectionCard>

      <SectionCard title="Indstillinger & synlighed"
        description="Del din profil, synlighed, konto-status og GDPR."
        action={editBtn("settings", "Åbn")}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Offentlig URL</div>
            <code className="block truncate text-sm">
              {p.provider_slug ? `/p/${p.provider_slug}` : "Ikke tildelt endnu"}
            </code>
          </div>
          {p.provider_slug && p.is_public ? (
            <Button asChild size="sm">
              <Link to={`/p/${p.provider_slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-4 w-4" /> Åbn
              </Link>
            </Button>
          ) : (
            <Badge variant="outline">{p.provider_slug ? "Skjult" : <><Star className="mr-1 h-3 w-3 inline" />Afventer</>}</Badge>
          )}
        </div>
      </SectionCard>

      {/* Native V2 editors */}
      {editor.pp && (
        <>
          <SectionEditDialog
            open={openEditor === "personal"} onOpenChange={(o) => o || closeEditor()}
            title="Personlige oplysninger" dirty={editor.isDirty} saving={editor.saving}
            onSave={handleSave}>
            <PersonalEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "business"} onOpenChange={(o) => o || closeEditor()}
            title="Om mig" dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <BusinessEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "languages"} onOpenChange={(o) => o || closeEditor()}
            title="Sprog" dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <LanguagesEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "equipment"} onOpenChange={(o) => o || closeEditor()}
            title="Udstyr" dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <EquipmentEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "services"} onOpenChange={(o) => o || closeEditor()}
            title="Servicekategorier" dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <ServicesEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "pricing"} onOpenChange={(o) => o || closeEditor()}
            title="Priser" dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <PricingEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "area"} onOpenChange={(o) => o || closeEditor()}
            title="Serviceområde" dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <AreaEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "insurance"} onOpenChange={(o) => o || closeEditor()}
            title="Forsikring" dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <InsuranceEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "settings"} onOpenChange={(o) => o || closeEditor()}
            title="Indstillinger" dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <SettingsEditor pp={editor.pp} patch={editor.patch} onReload={editor.reload} />
          </SectionEditDialog>
        </>
      )}

      <SectionEditDialog
        open={openEditor === "availability"} onOpenChange={(o) => o || closeEditor()}
        title="Tilgængelighed" showFooter={false}>
        {openEditor === "availability" && <AvailabilityEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "identity"} onOpenChange={(o) => o || closeEditor()}
        title="Verifikation" showFooter={false}>
        {openEditor === "identity" && <IdentityEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "stripe"} onOpenChange={(o) => o || closeEditor()}
        title="Stripe & udbetaling" showFooter={false}>
        {openEditor === "stripe" && <StripeEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "documents"} onOpenChange={(o) => o || closeEditor()}
        title="Dokumenter" showFooter={false}>
        {openEditor === "documents" && <DocumentsEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "tax"} onOpenChange={(o) => o || closeEditor()}
        title="Skatteoplysninger" showFooter={false}>
        {openEditor === "tax" && <TaxEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "performance"} onOpenChange={(o) => o || closeEditor()}
        title="Ydeevne & score" showFooter={false}>
        {openEditor === "performance" && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Score" value={p.provider_score ?? "—"} />
              <MiniStat label="Tier" value={p.provider_tier ?? "—"} />
              <MiniStat label="Fuldførte" value={view.completedJobs} />
              <MiniStat label="Rating"
                value={snap.avg_rating != null ? Number(snap.avg_rating).toFixed(2) : "—"} />
              <MiniStat label="Accept-rate"
                value={snap.acceptance_rate != null
                  ? `${Math.round(Number(snap.acceptance_rate) * 100)}%` : "—"} />
              <MiniStat label="Fuldførelse"
                value={snap.completion_rate != null
                  ? `${Math.round(Number(snap.completion_rate) * 100)}%` : "—"} />
              <MiniStat label="Aflysninger"
                value={snap.cancellation_rate != null
                  ? `${Math.round(Number(snap.cancellation_rate) * 100)}%` : "—"} />
              <MiniStat label="Gengangere"
                value={snap.repeat_customer_rate != null
                  ? `${Math.round(Number(snap.repeat_customer_rate) * 100)}%` : "—"} />
            </div>
            <p className="text-xs text-muted-foreground">
              Score og tier opdateres automatisk baseret på dine seneste 30 dage.
            </p>
          </div>
        )}
      </SectionEditDialog>
    </div>
  );
}

/* ------------------------------ helpers ------------------------------ */

function StatusPill({ label, value, tone }: {
  label: string; value: string; tone: "ok" | "warn";
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold">
      <span className={`h-1.5 w-1.5 rounded-full ${tone === "ok" ? "bg-emerald-500" : "bg-amber-500"}`} />
      <span className="text-muted-foreground">{label}:</span>
      <span className="capitalize text-foreground">{value}</span>
    </span>
  );
}

function IdentityBadge({ status }: { status: string }) {
  const ok = status === "approved";
  const pending = status === "pending" || status === "on_hold";
  const label = ok ? "Verificeret" : pending ? "Under review" : "Ikke verificeret";
  return (
    <Badge variant={ok ? "default" : "outline"} className="gap-1">
      <ShieldCheck className="h-3 w-3" /> {label}
    </Badge>
  );
}

function Row({ icon: Icon, label, value, ok }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className={`text-sm font-semibold ${ok ? "text-emerald-600" : "text-amber-600"}`}>
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-base font-bold text-foreground">{value}</div>
    </div>
  );
}
