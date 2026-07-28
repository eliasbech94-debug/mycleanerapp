// Customer Profile v2 — premium overview surface for /customer/profile.
// Reads the same underlying rows that the classic tabbed editor at
// `/profil?tab=…` writes to (`profiles`, `customer_addresses`, `bookings`),
// so the two views stay in sync. Every "Redigér" action deep-links into
// the legacy editor until native v2 editing lands.
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell, Calendar, CreditCard, FileText, Home, Inbox, LifeBuoy, Lock,
  Mail, MapPin, MessageSquare, Pencil, Phone, Receipt, ShieldOff, Sparkles,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCustomerProfile } from "@/hooks/useCustomerProfile";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComingSoonCard, EmptyState, QuickActionCard, SectionCard,
  SectionErrorState, StatCard, WelcomeHeader,
} from "@/components/dashboard/primitives";
import {
  ACCESS_METHOD_LABEL, PLACE_TYPE_LABEL, type CustomerAddress,
} from "@/lib/customerAddresses";

const editHref = (tab: string) => `/profil?tab=${tab}`;
const legacyHref = "/customer/profile?legacy=1";

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("da-DK", { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return "—";
  }
};

function EditLink({ tab, label = "Redigér" }: { tab: string; label?: string }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={editHref(tab)}>
        <Pencil className="mr-1 h-4 w-4" /> {label}
      </Link>
    </Button>
  );
}

function Initials({ name, email }: { name: string | null; email: string | null }) {
  const source = (name?.trim() || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const initials = (parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : source.slice(0, 2)
  ).toUpperCase();
  return (
    <span
      aria-hidden
      className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary"
    >
      {initials}
    </span>
  );
}

function AddressRow({ a }: { a: CustomerAddress }) {
  return (
    <li className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{a.label || a.address}</span>
          {a.is_primary && <Badge variant="secondary" className="text-[10px]">Primær</Badge>}
          <Badge variant="outline" className="text-[10px]">
            {PLACE_TYPE_LABEL[a.place_type] ?? a.place_type}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">{a.address}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Adgang: {ACCESS_METHOD_LABEL[a.access_method] ?? a.access_method}
          {a.size_sqm ? ` · ${a.size_sqm} m²` : ""}
          {a.rooms ? ` · ${a.rooms} vær.` : ""}
        </p>
      </div>
    </li>
  );
}

export default function CustomerProfileV2() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const data = useCustomerProfile();

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 10) return "Godmorgen";
    if (h < 18) return "Goddag";
    return "Godaften";
  }, []);

  if (!authLoading && !user) {
    navigate("/login?redirect=/customer/profile");
    return null;
  }

  if (authLoading || data.loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const p = data.profile;
  const firstName = (p?.full_name ?? data.email?.split("@")[0] ?? "").split(" ")[0] || null;
  const notifPrefs = (p?.notification_prefs ?? {}) as Record<string, unknown>;
  const notifCount = Object.values(notifPrefs).filter(Boolean).length;
  const smsVerified = !!p?.sms_verified_at;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      {data.error && (
        <SectionErrorState
          message={data.error}
          onRetry={data.refetch}
          compact
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="sr-only">Min profil</h1>
            <div className="text-xs opacity-70">Din konto og oplysninger</div>
          </div>
        </div>
        <Button asChild size="sm">
          <Link to={editHref("info")}>
            <Pencil className="mr-1 h-4 w-4" /> Redigér alt
          </Link>
        </Button>
      </div>

      <WelcomeHeader
        greeting={greeting}
        name={firstName}
        subtitle={
          data.bookings.total > 0
            ? `Du har ${data.bookings.total} booking${data.bookings.total === 1 ? "" : "er"} i alt.`
            : "Velkommen — book din første rengøring når du er klar."
        }
        completion={data.completion}
        actions={
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" /> Medlem siden {formatDate(data.memberSince)}
          </Badge>
        }
      />

      {/* Booking summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bookinger i alt" value={data.bookings.total} icon={Calendar} />
        <StatCard label="Kommende" value={data.bookings.upcoming} icon={Calendar} />
        <StatCard label="Fuldførte" value={data.bookings.completed} icon={Sparkles} />
        <StatCard
          label="Sidste booking"
          value={data.bookings.lastBookingAt ? formatDate(data.bookings.lastBookingAt) : "—"}
        />
      </div>

      {/* Identity + Contact */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Personlige oplysninger"
          action={<EditLink tab="info" />}
        >
          <div className="flex items-center gap-4">
            <Initials name={p?.full_name ?? null} email={data.email} />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-display text-lg">
                {p?.full_name || "Ingen navn angivet"}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {data.email ?? "—"}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {p?.country_code && (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {p.country_code}
                  </Badge>
                )}
                {p?.ui_language && (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {p.ui_language}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Kontakt" action={<EditLink tab="info" />}>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{data.email ?? "—"}</span>
            </li>
            <li className="flex items-center gap-3">
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{p?.phone || "Ingen telefon"}</span>
            </li>
            <li className="flex items-center gap-3">
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {p?.sms_phone ? p.sms_phone : "Ingen SMS-nummer"}
              </span>
              {smsVerified ? (
                <Badge variant="secondary" className="ml-auto text-[10px]">Verificeret</Badge>
              ) : p?.sms_phone ? (
                <Badge variant="outline" className="ml-auto text-[10px]">Ikke verificeret</Badge>
              ) : null}
            </li>
          </ul>
        </SectionCard>
      </div>

      {/* Saved addresses */}
      <SectionCard
        title="Gemte adresser"
        description="Adgang, størrelse, kæledyr og noter pr. adresse."
        action={<EditLink tab="addresses" label="Administrér" />}
      >
        {data.addresses.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="Ingen gemte adresser endnu"
            description="Tilføj en adresse for at gøre booking hurtigere."
            action={
              <Button asChild size="sm">
                <Link to={editHref("addresses")}>Tilføj adresse</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {data.addresses.map((a) => <AddressRow key={a.id} a={a} />)}
          </ul>
        )}
      </SectionCard>

      {/* Preferences + Notifications */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Notifikationer" action={<EditLink tab="notifications" />}>
          {notifCount === 0 ? (
            <EmptyState
              icon={Bell}
              title="Ingen kanaler aktive"
              description="Vælg hvordan vi må kontakte dig om bookinger og beskeder."
            />
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {notifCount} kanal{notifCount === 1 ? "" : "er"} aktiveret.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(notifPrefs)
                  .filter(([, v]) => !!v)
                  .map(([k]) => (
                    <Badge key={k} variant="outline">{k}</Badge>
                  ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Rengøringspræferencer" action={<EditLink tab="addresses" />}>
          {data.primaryAddress ? (
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Kæledyr</span>
                <span>{data.primaryAddress.has_pets ? (data.primaryAddress.pet_details || "Ja") : "Nej"}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Børn</span>
                <span>{data.primaryAddress.has_children ? "Ja" : "Nej"}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Rengøringsmidler klar</span>
                <span>{data.primaryAddress.cleaning_supplies_available ? "Ja" : "Nej"}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Parkering</span>
                <span className="truncate max-w-[55%] text-right">
                  {data.primaryAddress.parking_info || "—"}
                </span>
              </li>
            </ul>
          ) : (
            <EmptyState
              icon={Sparkles}
              title="Ingen præferencer endnu"
              description="Tilføj en primær adresse for at sætte dine præferencer."
            />
          )}
        </SectionCard>
      </div>

      {/* Access instructions (from primary address) */}
      <SectionCard title="Adgangsinstruktioner" action={<EditLink tab="addresses" />}>
        {data.primaryAddress ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Adgangsmetode</span>
              <span>
                {ACCESS_METHOD_LABEL[data.primaryAddress.access_method] ??
                  data.primaryAddress.access_method}
              </span>
            </div>
            {data.primaryAddress.access_code && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Kode</span>
                <span className="font-mono">••••</span>
              </div>
            )}
            {data.primaryAddress.access_instructions && (
              <p className="rounded-lg bg-muted/50 p-3 text-xs text-foreground">
                {data.primaryAddress.access_instructions}
              </p>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Lock}
            title="Ingen adgangsinstruktioner"
            description="Tilføj en primær adresse for at gemme adgangsinstruktioner."
          />
        )}
      </SectionCard>

      {/* Privacy & account */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Privatliv" action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/privatliv"><Pencil className="mr-1 h-4 w-4" /> Åbn</Link>
          </Button>
        }>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Se, download eller anmod om sletning af dine data i Privatlivscenteret.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Konto" action={<EditLink tab="deactivate" label="Deaktivér" />}>
          <div className="flex items-start gap-3 text-sm">
            <ShieldOff className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              {p?.deactivated_at ? (
                <>
                  <p className="font-medium text-destructive">Konto er deaktiveret</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(p.deactivated_at)}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Din konto er aktiv. Du kan altid deaktivere den fra kontoindstillinger.
                </p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Quick links */}
      <SectionCard title="Genveje">
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickActionCard title="Mine bookinger" description="Se og administrér" icon={Calendar} to="/customer/bookings" />
          <QuickActionCard title="Beskeder" description="Din indbakke" icon={Inbox} to="/profil?tab=inbox" />
          <QuickActionCard title="Kort & betalinger" description="Betalingsmetoder" icon={CreditCard} to="/profil?tab=cards" />
          <QuickActionCard title="Fakturaer" description="Kvitteringer og bilag" icon={FileText} to="/profil?tab=invoices" />
          <QuickActionCard title="Support" description="Få hjælp" icon={LifeBuoy} to="/faq" />
          <QuickActionCard title="Skatteoplysninger" description="Servicefradrag" icon={Receipt} to="/profil?tab=tax" />
        </div>
      </SectionCard>

      {/* Coming soon */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ComingSoonCard
          title="Familiemedlemmer"
          description="Del konto og bookinger med resten af husstanden."
        />
        <ComingSoonCard
          title="Foretrukne produkter"
          description="Gem ønskede rengøringsmidler og allergier."
        />
      </div>

      <div className="text-center text-xs text-muted-foreground">
        <Link to={legacyHref} className="underline">Åbn den klassiske profil-editor</Link>
      </div>
    </div>
  );
}
