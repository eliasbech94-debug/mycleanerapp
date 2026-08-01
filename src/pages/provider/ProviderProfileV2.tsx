// Provider Profile v2 — premium overview surface for /provider/profile.
// Reads the same underlying rows as the legacy 16-tab editor
// (`provider_profiles`, `provider_service_prices`, `bookings`). All
// editing is now native V2: every "Redigér" opens a SectionEditDialog
// with a form from `provider-editors`. Legacy tabbed editor removed in
// Phase 6.
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ExternalLink, Pencil, ShieldCheck, MapPin, Languages, Wrench,
  FileBadge, CalendarClock, Sparkles, Star, User as UserIcon, Briefcase,
} from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { useCountryPath } from "@/lib/countryPath";

type EditorKey =
  | "personal" | "business" | "languages" | "equipment" | "services"
  | "pricing" | "area" | "availability" | "identity" | "insurance"
  | "documents" | "performance" | "settings" | "stripe" | "tax";

const formatMoney = (minor: number, currency: string, locale: string) => {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 })
      .format(minor / 100);
  } catch { return `${Math.round(minor / 100)} ${currency}`; }
};

export default function ProviderProfileV2() {
  const { t, i18n } = useTranslation("provider");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const localize = useCountryPath();
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
    if (h < 10) return t("profile.greeting.morning");
    if (h < 18) return t("profile.greeting.day");
    return t("profile.greeting.evening");
  }, [t]);

  if (!authLoading && !user) { navigate(localize("/login")); return null; }

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
        <h1 className="font-display text-2xl">{t("profile.noProfile.title")}</h1>
        <p className="mt-2 opacity-70">{t("profile.noProfile.body")}</p>
        <Button className="mt-4" onClick={() => navigate(localize("/bliv-cleaner"))}>{t("profile.noProfile.cta")}</Button>
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

  const editBtn = (key: EditorKey, label = t("profile.editButton")) => (
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
            <h1 className="sr-only">{t("profile.pageTitle")}</h1>
            <div className="text-xs opacity-70">{t("profile.pageSubtitle")}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {p.provider_slug && p.is_public && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/p/${p.provider_slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-4 w-4" /> {t("profile.viewPublicProfile")}
              </Link>
            </Button>
          )}
          <Button size="sm" onClick={() => setOpenEditor("personal")}>
            <Pencil className="mr-1 h-4 w-4" /> {t("profile.editProfile")}
          </Button>
        </div>
      </div>

      <WelcomeHeader
        greeting={greeting}
        name={firstName}
        subtitle={p.headline ?? t("profile.welcomeSubtitleDefault")}
        completion={p.completion_pct ?? null}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label={t("profile.status.label")} value={(p.status ?? "draft").replace(/_/g, " ")}
              tone={p.status === "active" ? "ok" : "warn"} />
            <StatusPill label={t("profile.visibility.label")} value={p.is_public ? t("profile.visibility.public") : t("profile.visibility.hidden")}
              tone={p.is_public ? "ok" : "warn"} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("profile.stats.completedJobs")} value={view.completedJobs} icon={Briefcase} />
        <StatCard label={t("profile.stats.yearsExperience")} value={p.years_experience ?? "—"} icon={Sparkles} />
        <StatCard label={t("profile.stats.responseTime")}
          value={snap.avg_response_seconds != null
            ? t("profile.time.minutes", { count: Math.round(Number(snap.avg_response_seconds) / 60) })
            : "—"}
          hint={t("profile.stats.responseTimeHint")} />
        <StatCard label={t("profile.stats.acceptanceRate")}
          value={snap.acceptance_rate != null
            ? `${Math.round(Number(snap.acceptance_rate) * 100)}%` : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t("profile.sections.photoIdentity.title")} action={editBtn("personal")}>
          <div className="flex items-center gap-4">
            <span aria-hidden
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {(p.display_name ?? "?").slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg">{p.display_name ?? t("profile.sections.photoIdentity.noName")}</p>
              {p.headline && <p className="truncate text-sm text-muted-foreground">{p.headline}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <IdentityBadge status={identity} />
                {p.provider_tier && <Badge variant="outline">{p.provider_tier}</Badge>}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("profile.sections.about.title")} action={editBtn("business")}>
          {p.public_bio ? (
            <p className="whitespace-pre-line text-sm text-foreground">{p.public_bio}</p>
          ) : (
            <EmptyState icon={UserIcon} title={t("profile.sections.about.emptyTitle")}
              description={t("profile.sections.about.emptyDescription")} />
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t("profile.sections.languages.title")} action={editBtn("languages")}>
          <div className="flex flex-wrap gap-2">
            {langs.length === 0 ? (
              <EmptyState icon={Languages} title={t("profile.sections.languages.empty")} />
            ) : langs.map((l) => (
              <Badge key={l} variant="secondary">{t(`catalog.languages.${l}`, { defaultValue: l })}</Badge>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={t("profile.sections.experienceEquipment.title")} action={editBtn("equipment")}>
          <div className="space-y-3">
            <div className="text-sm">
              <span className="text-muted-foreground">{t("profile.sections.experienceEquipment.experienceLabel")} </span>
              <b>{p.years_experience != null
                ? t("profile.sections.experienceEquipment.yearsValue", { count: p.years_experience })
                : "—"}</b>
            </div>
            <div className="flex flex-wrap gap-2">
              {equip.length === 0
                ? <span className="text-sm text-muted-foreground">{t("profile.sections.experienceEquipment.noEquipment")}</span>
                : equip.map((k) => (
                  <Badge key={k} variant="outline" className="gap-1">
                    <Wrench className="h-3 w-3" /> {t(`catalog.equipment.${k}`, { defaultValue: k })}
                  </Badge>
                ))}
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title={t("profile.sections.servicesPricing.title")}
        description={t("profile.sections.servicesPricing.description")}
        action={
          <div className="flex gap-1">
            {editBtn("services", t("profile.sections.servicesPricing.categoriesButton"))}
            {editBtn("pricing", t("profile.sections.servicesPricing.pricesButton"))}
          </div>
        }>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {cats.length === 0
              ? <span className="text-sm text-muted-foreground">{t("profile.sections.servicesPricing.noCategories")}</span>
              : cats.map((c) => (
                <Badge key={c} className="bg-primary/10 text-primary hover:bg-primary/15">
                  {t(`catalog.categories.${c}`, { defaultValue: c })}
                </Badge>
              ))}
          </div>

          {activePrices.length === 0 ? (
            <EmptyState icon={Briefcase} title={t("profile.sections.servicesPricing.emptyPricesTitle")}
              description={t("profile.sections.servicesPricing.emptyPricesDescription")}
              action={<Button size="sm" onClick={() => setOpenEditor("pricing")}>{t("profile.sections.servicesPricing.addPrices")}</Button>} />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {activePrices.map((row) => (
                <li key={row.service_code} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">
                    {t(`catalog.services.${row.service_code}`, { defaultValue: row.service_code })}
                  </span>
                  <span className="text-sm font-semibold">
                    {formatMoney(row.amount_minor, row.currency, i18n.language)}
                    <span className="opacity-60"> {t("profile.sections.servicesPricing.perHour")}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t("profile.sections.area.title")} action={editBtn("area")}>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{p.base_address_formatted ?? t("profile.sections.area.noAddress")}</div>
                <div className="text-xs text-muted-foreground">
                  {t("profile.sections.area.publicNotice")}
                </div>
              </div>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">{t("profile.sections.area.radiusLabel")} </span>
              <b>{p.service_area_radius_km != null ? t("profile.sections.area.radiusValue", { count: p.service_area_radius_km }) : "—"}</b>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("profile.sections.availability.title")} action={editBtn("availability")}>
          <div className="flex items-start gap-2 text-sm">
            <CalendarClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <p>{t("profile.sections.availability.description")}</p>
          </div>
          <Button variant="outline" size="sm" className="mt-3"
            onClick={() => setOpenEditor("availability")}>
            {t("profile.sections.availability.openCalendar")}
          </Button>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title={t("profile.sections.verification.title")} action={editBtn("identity")}>
          <div className="space-y-2 text-sm">
            <Row icon={ShieldCheck} label={t("profile.sections.verification.identityLabel")}
              value={identityOk ? t("profile.sections.verification.verified") : t("profile.sections.verification.missing")} ok={identityOk} />
            <Row icon={ShieldCheck} label={t("profile.sections.verification.stripeLabel")}
              value={stripeReady ? t("profile.sections.verification.ready") : t("profile.sections.verification.notReady")} ok={stripeReady} />
            <Button variant="link" size="sm" className="px-0 text-primary"
              onClick={() => setOpenEditor("stripe")}>
              {t("profile.sections.verification.openStripeStatus")}
            </Button>
          </div>
        </SectionCard>

        <SectionCard title={t("profile.sections.insurance.title")} action={editBtn("insurance")}>
          <div className="space-y-2 text-sm">
            <Row icon={FileBadge} label={t("profile.sections.insurance.policyLabel")} value={p.insurance_policy_number || "—"}
              ok={!!p.insurance_policy_number} />
            <Row icon={FileBadge} label={t("profile.sections.insurance.expiresLabel")}
              value={(p.insurance_expires_on as string | null) ?? "—"} ok={insuranceValid} />
          </div>
        </SectionCard>

        <SectionCard title={t("profile.sections.documents.title")} action={editBtn("documents", t("profile.sections.documents.uploadButton"))}>
          <div className="text-sm">
            <Row icon={FileBadge} label={t("profile.sections.documents.insuranceDocLabel")}
              value={p.insurance_doc_path ? t("profile.sections.documents.uploaded") : t("profile.sections.documents.missing")} ok={!!p.insurance_doc_path} />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t("profile.sections.performance.title")} action={editBtn("performance", t("profile.sections.performance.detailsButton"))}>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label={t("profile.sections.performance.score")} value={p.provider_score ?? "—"} />
            <MiniStat label={t("profile.sections.performance.tier")} value={p.provider_tier ?? "—"} />
            <MiniStat label={t("profile.sections.performance.completed")} value={view.completedJobs} />
            <MiniStat label={t("profile.stats.acceptanceRate")}
              value={snap.acceptance_rate != null
                ? `${Math.round(Number(snap.acceptance_rate) * 100)}%` : "—"} />
          </div>
        </SectionCard>

        <ComingSoonCard title={t("profile.sections.reviews.title")}
          description={t("profile.sections.reviews.description")} />
      </div>

      <SectionCard title={t("profile.sections.tax.title")} action={editBtn("tax", t("profile.sections.tax.openButton"))}>
        <p className="text-sm text-muted-foreground">
          {t("profile.sections.tax.body")}
        </p>
      </SectionCard>

      <SectionCard title={t("profile.sections.settings.title")}
        description={t("profile.sections.settings.description")}
        action={editBtn("settings", t("profile.sections.settings.openButton"))}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">{t("profile.sections.settings.publicUrlLabel")}</div>
            <code className="block truncate text-sm">
              {p.provider_slug ? `/p/${p.provider_slug}` : t("profile.sections.settings.notAssigned")}
            </code>
          </div>
          {p.provider_slug && p.is_public ? (
            <Button asChild size="sm">
              <Link to={`/p/${p.provider_slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 h-4 w-4" /> {t("profile.sections.settings.openButton")}
              </Link>
            </Button>
          ) : (
            <Badge variant="outline">{p.provider_slug ? t("profile.sections.settings.hidden") : <><Star className="mr-1 h-3 w-3 inline" />{t("profile.sections.settings.pending")}</>}</Badge>
          )}
        </div>
      </SectionCard>

      {/* Native V2 editors */}
      {editor.pp && (
        <>
          <SectionEditDialog
            open={openEditor === "personal"} onOpenChange={(o) => o || closeEditor()}
            title={t("profile.editors.personal")} dirty={editor.isDirty} saving={editor.saving}
            onSave={handleSave}>
            <PersonalEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "business"} onOpenChange={(o) => o || closeEditor()}
            title={t("profile.editors.business")} dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <BusinessEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "languages"} onOpenChange={(o) => o || closeEditor()}
            title={t("profile.editors.languages")} dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <LanguagesEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "equipment"} onOpenChange={(o) => o || closeEditor()}
            title={t("profile.editors.equipment")} dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <EquipmentEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "services"} onOpenChange={(o) => o || closeEditor()}
            title={t("profile.editors.services")} dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <ServicesEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "pricing"} onOpenChange={(o) => o || closeEditor()}
            title={t("profile.editors.pricing")} dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <PricingEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "area"} onOpenChange={(o) => o || closeEditor()}
            title={t("profile.editors.area")} dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <AreaEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "insurance"} onOpenChange={(o) => o || closeEditor()}
            title={t("profile.editors.insurance")} dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <InsuranceEditor pp={editor.pp} patch={editor.patch} />
          </SectionEditDialog>

          <SectionEditDialog
            open={openEditor === "settings"} onOpenChange={(o) => o || closeEditor()}
            title={t("profile.editors.settings")} dirty={editor.isDirty} saving={editor.saving} onSave={handleSave}>
            <SettingsEditor pp={editor.pp} patch={editor.patch} onReload={editor.reload} />
          </SectionEditDialog>
        </>
      )}

      <SectionEditDialog
        open={openEditor === "availability"} onOpenChange={(o) => o || closeEditor()}
        title={t("profile.editors.availability")} showFooter={false}>
        {openEditor === "availability" && <AvailabilityEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "identity"} onOpenChange={(o) => o || closeEditor()}
        title={t("profile.editors.identity")} showFooter={false}>
        {openEditor === "identity" && <IdentityEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "stripe"} onOpenChange={(o) => o || closeEditor()}
        title={t("profile.editors.stripe")} showFooter={false}>
        {openEditor === "stripe" && <StripeEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "documents"} onOpenChange={(o) => o || closeEditor()}
        title={t("profile.editors.documents")} showFooter={false}>
        {openEditor === "documents" && <DocumentsEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "tax"} onOpenChange={(o) => o || closeEditor()}
        title={t("profile.editors.tax")} showFooter={false}>
        {openEditor === "tax" && <TaxEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "performance"} onOpenChange={(o) => o || closeEditor()}
        title={t("profile.editors.performance.title")} showFooter={false}>
        {openEditor === "performance" && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label={t("profile.sections.performance.score")} value={p.provider_score ?? "—"} />
              <MiniStat label={t("profile.sections.performance.tier")} value={p.provider_tier ?? "—"} />
              <MiniStat label={t("profile.sections.performance.completed")} value={view.completedJobs} />
              <MiniStat label={t("profile.editors.performance.rating")}
                value={snap.avg_rating != null ? Number(snap.avg_rating).toFixed(2) : "—"} />
              <MiniStat label={t("profile.stats.acceptanceRate")}
                value={snap.acceptance_rate != null
                  ? `${Math.round(Number(snap.acceptance_rate) * 100)}%` : "—"} />
              <MiniStat label={t("profile.editors.performance.completionRate")}
                value={snap.completion_rate != null
                  ? `${Math.round(Number(snap.completion_rate) * 100)}%` : "—"} />
              <MiniStat label={t("profile.editors.performance.cancellations")}
                value={snap.cancellation_rate != null
                  ? `${Math.round(Number(snap.cancellation_rate) * 100)}%` : "—"} />
              <MiniStat label={t("profile.editors.performance.repeatCustomers")}
                value={snap.repeat_customer_rate != null
                  ? `${Math.round(Number(snap.repeat_customer_rate) * 100)}%` : "—"} />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("profile.editors.performance.note")}
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
  const { t } = useTranslation("provider");
  const ok = status === "approved";
  const pending = status === "pending" || status === "on_hold";
  const label = ok ? t("profile.identityBadge.verified") : pending ? t("profile.identityBadge.pending") : t("profile.identityBadge.unverified");
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
