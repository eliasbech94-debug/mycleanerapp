// Provider Profile v2 — premium overview surface for /provider/profile.
// Reads the same underlying rows as the legacy 16-tab editor
// (`provider_profiles`, `provider_service_prices`, `bookings`) so the
// public profile and the private view stay in sync. Deep edits deep-link
// into the legacy editor at `?legacy=1&tab=<id>`.
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ExternalLink, Pencil, ShieldCheck, MapPin, Languages, Wrench,
  FileBadge, CalendarClock, Sparkles, Star, User as UserIcon, Briefcase,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatCard, SectionCard, EmptyState, ComingSoonCard, WelcomeHeader, SectionErrorState,
} from "@/components/dashboard/primitives";

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

const editHref = (tab: string) => `/provider/profile?legacy=1&tab=${tab}`;

const formatMoney = (minor: number, currency: string) => {
  try {
    return new Intl.NumberFormat("da-DK", { style: "currency", currency, maximumFractionDigits: 0 })
      .format(minor / 100);
  } catch { return `${Math.round(minor / 100)} ${currency}`; }
};

export default function ProviderProfileV2() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { loading, profile, prices, completedJobs, reload, error, refetch } = useProviderProfile();

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 10) return "Godmorgen";
    if (h < 18) return "Goddag";
    return "Godaften";
  }, []);

  if (!authLoading && !user) { navigate("/login"); return null; }

  if (loading || authLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center">
        <h1 className="font-display text-2xl">Ingen provider-profil</h1>
        <p className="mt-2 opacity-70">Du skal starte en cleaner-ansøgning først.</p>
        <Button className="mt-4" onClick={() => navigate("/bliv-cleaner")}>Bliv cleaner</Button>
      </div>
    );
  }

  const p = profile;
  const firstName = (p.display_name ?? user?.email?.split("@")[0] ?? "").split(" ")[0] || null;
  const activePrices = prices.filter((x) => x.active);
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

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      {error && (
        <SectionErrorState message={error} onRetry={refetch} compact />
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
          <Button asChild size="sm">
            <Link to={editHref("personal")}>
              <Pencil className="mr-1 h-4 w-4" /> Redigér alt
            </Link>
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
            <StatusPill label="Status" value={(p.status ?? "draft").replace(/_/g, " ")} tone={p.status === "active" ? "ok" : "warn"} />
            <StatusPill label="Synlighed" value={p.is_public ? "Offentlig" : "Skjult"} tone={p.is_public ? "ok" : "warn"} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Fuldførte jobs" value={completedJobs} icon={Briefcase} />
        <StatCard label="Års erfaring" value={p.years_experience ?? "—"} icon={Sparkles} />
        <StatCard
          label="Svartid"
          value={snap.avg_response_seconds != null
            ? `${Math.round(Number(snap.avg_response_seconds) / 60)} min`
            : "—"}
          hint="Sidste 30 dage"
        />
        <StatCard
          label="Accept-rate"
          value={snap.acceptance_rate != null ? `${Math.round(Number(snap.acceptance_rate) * 100)}%` : "—"}
        />
      </div>

      {/* Identity + About */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Profilbillede & identitet"
          action={<EditLink tab="personal" />}
        >
          <div className="flex items-center gap-4 p-4 sm:p-5">
            <Avatar path={p.photo_path ?? null} name={p.display_name ?? null} />
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

        <SectionCard title="Om mig" action={<EditLink tab="business" />}>
          <div className="p-4 sm:p-5">
            {p.public_bio ? (
              <p className="whitespace-pre-line text-sm text-foreground">{p.public_bio}</p>
            ) : (
              <EmptyState
                icon={UserIcon}
                title="Ingen offentlig bio endnu"
                description="Fortæl kunderne hvem du er, og hvorfor de skal vælge dig."
              />
            )}
          </div>
        </SectionCard>
      </div>

      {/* Languages + Experience */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Sprog" action={<EditLink tab="languages" />}>
          <div className="flex flex-wrap gap-2 p-4 sm:p-5">
            {langs.length === 0 ? (
              <EmptyState icon={Languages} title="Ingen sprog valgt" />
            ) : langs.map((l) => (
              <Badge key={l} variant="secondary">{LANG_LABEL[l] ?? l}</Badge>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Erfaring & udstyr" action={<EditLink tab="equipment" />}>
          <div className="space-y-3 p-4 sm:p-5">
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

      {/* Services + per-service pricing */}
      <SectionCard
        title="Ydelser & priser"
        description="Hver service har sin egen timepris. Endelige priser beregnes altid server-side."
        action={<EditLink tab="pricing" label="Redigér priser" />}
      >
        <div className="space-y-4 p-4 sm:p-5">
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
            <EmptyState
              icon={Briefcase}
              title="Ingen individuelle serviceprises endnu"
              description="Sæt priser pr. service så kunderne ved præcis hvad det koster."
              action={<Button asChild size="sm"><Link to={editHref("pricing")}>Tilføj priser</Link></Button>}
            />
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

      {/* Area + Availability */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Serviceområde" action={<EditLink tab="area" />}>
          <div className="space-y-2 p-4 sm:p-5 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {p.base_address_formatted ?? "Ingen adresse valgt"}
                </div>
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

        <SectionCard title="Tilgængelighed" action={<EditLink tab="availability" />}>
          <div className="p-4 sm:p-5">
            <div className="flex items-start gap-2 text-sm">
              <CalendarClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <p>Dit ugeskema og bookingvinduer styres i den detaljerede editor.</p>
            </div>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to={editHref("availability")}>Åbn kalender-editor</Link>
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* Verification + Insurance + Documents */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Verifikation" action={<EditLink tab="identity" />}>
          <div className="space-y-2 p-4 sm:p-5 text-sm">
            <Row icon={ShieldCheck} label="Identitet" value={identityOk ? "Verificeret" : "Mangler"} ok={identityOk} />
            <Row icon={ShieldCheck} label="Stripe udbetaling" value={stripeReady ? "Klar" : "Ikke klar"} ok={stripeReady} />
          </div>
        </SectionCard>

        <SectionCard title="Forsikring" action={<EditLink tab="insurance" />}>
          <div className="space-y-2 p-4 sm:p-5 text-sm">
            <Row icon={FileBadge} label="Police" value={p.insurance_policy_number || "—"} ok={!!p.insurance_policy_number} />
            <Row icon={FileBadge} label="Udløber" value={(p.insurance_expires_on as string | null) ?? "—"} ok={insuranceValid} />
          </div>
        </SectionCard>

        <SectionCard title="Dokumenter" action={<EditLink tab="documents" label="Upload" />}>
          <div className="p-4 sm:p-5 text-sm">
            <Row icon={FileBadge} label="Forsikringsdokument"
              value={p.insurance_doc_path ? "Uploadet" : "Mangler"} ok={!!p.insurance_doc_path} />
          </div>
        </SectionCard>
      </div>

      {/* Performance + Reviews */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Ydeevne" action={<EditLink tab="performance" label="Se detaljer" />}>
          <div className="grid grid-cols-2 gap-3 p-4 sm:p-5">
            <MiniStat label="Score" value={p.provider_score ?? "—"} />
            <MiniStat label="Tier" value={p.provider_tier ?? "—"} />
            <MiniStat label="Fuldførte" value={completedJobs} />
            <MiniStat
              label="Accept-rate"
              value={snap.acceptance_rate != null ? `${Math.round(Number(snap.acceptance_rate) * 100)}%` : "—"}
            />
          </div>
        </SectionCard>

        <ComingSoonCard
          title="Kundeanmeldelser"
          description="Vises her når kunder afgiver anmeldelser på fuldførte bookings."
        />
      </div>

      {/* Public preview + share */}
      <SectionCard
        title="Offentlig profil"
        description="Sådan ser kunderne dig på marketplace."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to={editHref("settings")}>Del & synlighed</Link>
          </Button>
        }
      >
        <div className="p-4 sm:p-5">
          {p.provider_slug ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Link</div>
                <code className="block truncate text-sm">/p/{p.provider_slug}</code>
              </div>
              {p.is_public ? (
                <Button asChild size="sm">
                  <Link to={`/p/${p.provider_slug}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1 h-4 w-4" /> Åbn
                  </Link>
                </Button>
              ) : (
                <Badge variant="outline">Skjult</Badge>
              )}
            </div>
          ) : (
            <EmptyState icon={Star} title="Slug ikke tildelt endnu"
              description="Din offentlige URL oprettes automatisk når du er godkendt." />
          )}
        </div>
      </SectionCard>

      <p className="text-center text-xs text-muted-foreground">
        Bruger den klassiske editor?{" "}
        <Link to="/provider/profile?legacy=1" className="underline">Skift til klassisk visning</Link>
      </p>

      {/* noop to satisfy unused warning if any */}
      <span className="hidden" aria-hidden onClick={() => void reload()} />
    </div>
  );
}

/* ------------------------------ helpers ------------------------------ */

function EditLink({ tab, label = "Redigér" }: { tab: string; label?: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="text-primary">
      <Link to={editHref(tab)}>
        <Pencil className="mr-1 h-3.5 w-3.5" /> {label}
      </Link>
    </Button>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" }) {
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
      <span className={`font-medium ${ok ? "text-emerald-700" : "text-amber-700"}`}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
    </div>
  );
}

function Avatar({ path, name }: { path: string | null; name: string | null }) {
  const initials = (name ?? "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  if (path) {
    // photo_path is a storage path; without a signed URL we fall back to initials.
    // Signed avatar URL fetching lives in a follow-up sprint.
  }
  return (
    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-xl text-primary">
      {initials || "?"}
    </div>
  );
}
