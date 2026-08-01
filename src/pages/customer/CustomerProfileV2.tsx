// Customer Profile v2 — premium overview surface for /customer/profile.
// Reads the same underlying rows that the classic tabbed editor at
// `/profil?tab=…` writes to (`profiles`, `customer_addresses`, `bookings`),
// so the two views stay in sync. Editing is fully native: every
// "Redigér" opens a SectionEditDialog with a native V2 form.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell, Calendar, CreditCard, FileText, Inbox, LifeBuoy, Lock, Mail,
  MapPin, MessageSquare, Pencil, Phone, Receipt, ShieldOff, Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCustomerProfile } from "@/hooks/useCustomerProfile";
import { useCountryPath } from "@/lib/countryPath";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComingSoonCard, EmptyState, QuickActionCard, SectionCard,
  SectionEditDialog, SectionErrorState, StatCard, WelcomeHeader,
} from "@/components/dashboard/primitives";
import {
  ACCESS_METHOD_LABEL, PLACE_TYPE_LABEL, type CustomerAddress,
} from "@/lib/customerAddresses";
import {
  AccessInstructionsEditor, AddressesEditor, CleaningPreferencesEditor,
  ContactEditor, DeactivateEditor, NotificationsEditor, PersonalEditor,
  TaxEditor,
} from "@/components/profile/customer-editors";

const EDITOR_KEYS = [
  "personal", "contact", "addresses", "notifications",
  "prefs", "access", "deactivate", "tax",
] as const;

type EditorKey = (typeof EDITOR_KEYS)[number];

const formatDate = (iso: string | null, locale: string) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return "—";
  }
};

function Initials({ name, email }: { name: string | null; email: string | null }) {
  const source = (name?.trim() || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const initials = (parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : source.slice(0, 2)
  ).toUpperCase();
  return (
    <span aria-hidden
      className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
      {initials}
    </span>
  );
}

function AddressRow({ a }: { a: CustomerAddress }) {
  const { t } = useTranslation("customer");
  const placeType = t(`profileV2.addressLabels.placeType.${a.place_type}`, {
    defaultValue: PLACE_TYPE_LABEL[a.place_type] ?? a.place_type,
  });
  const accessMethod = t(`profileV2.addressLabels.accessMethod.${a.access_method}`, {
    defaultValue: ACCESS_METHOD_LABEL[a.access_method] ?? a.access_method,
  });
  return (
    <li className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{a.label || a.address}</span>
          {a.is_primary && (
            <Badge variant="secondary" className="text-[10px]">{t("profileV2.addresses.primary")}</Badge>
          )}
          <Badge variant="outline" className="text-[10px]">{placeType}</Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">{a.address}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("profileV2.addresses.accessPrefix")}: {accessMethod}
          {a.size_sqm ? ` · ${a.size_sqm} ${t("profileV2.addresses.sizeSuffix")}` : ""}
          {a.rooms ? ` · ${a.rooms} ${t("profileV2.addresses.roomsSuffix")}` : ""}
        </p>
      </div>
    </li>
  );
}

export default function CustomerProfileV2() {
  const { t, i18n } = useTranslation("customer");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const data = useCustomerProfile();
  const localize = useCountryPath();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openEditor, setOpenEditor] = useState<EditorKey | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveRef = useRef<(() => Promise<boolean>) | null>(null);

  const registerSave = useCallback((fn: () => Promise<boolean>) => {
    saveRef.current = fn;
  }, []);
  const registerDirty = useCallback((d: boolean) => setDirty(d), []);

  const closeEditor = useCallback(() => {
    setOpenEditor(null);
    setDirty(false);
    saveRef.current = null;
  }, []);

  const handleSave = useCallback(async () => {
    if (!saveRef.current) return;
    setSaving(true);
    const ok = await saveRef.current();
    setSaving(false);
    if (ok) {
      await data.refetch();
      closeEditor();
    }
  }, [data, closeEditor]);

  // Deep-link support: /customer/profile?edit=contact opens the editor directly,
  // so dashboard shortcuts ("Tilføj telefon"/"Tilføj adresse") are actionable.
  const editParam = searchParams.get("edit") as EditorKey | null;
  useEffect(() => {
    if (!editParam) return;
    if (!EDITOR_KEYS.includes(editParam)) return;
    setOpenEditor(editParam);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [editParam, searchParams, setSearchParams]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 10) return t("greeting.morning");
    if (h < 18) return t("greeting.day");
    return t("greeting.evening");
  }, [t]);

  if (!authLoading && !user) {
    navigate(localize("/login?redirect=/customer/profile"));
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

  const openBtn = (key: EditorKey, label = t("profileV2.edit"), ariaLabel?: string) => (
    <Button variant="ghost" size="sm"
      aria-label={ariaLabel ?? `${label} — ${key}`}
      onClick={() => setOpenEditor(key)}>
      <Pencil className="mr-1 h-4 w-4" /> {label}
    </Button>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      {data.error && (
        <SectionErrorState message={data.error} onRetry={data.refetch} compact />
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="sr-only">{t("profileV2.title")}</h1>
            <div className="text-xs opacity-70">{t("profileV2.subtitle")}</div>
          </div>
        </div>
        <Button size="sm" onClick={() => setOpenEditor("personal")}>
          <Pencil className="mr-1 h-4 w-4" /> {t("profileV2.editProfile")}
        </Button>
      </div>

      <WelcomeHeader
        greeting={greeting}
        name={firstName}
        subtitle={
          data.bookings.total > 0
            ? t("profileV2.bookingsSummary", { count: data.bookings.total })
            : t("profileV2.welcomeSubtitle")
        }
        completion={data.completion}
        actions={
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" />
            {t("profileV2.memberSince", { date: formatDate(data.memberSince, i18n.language) })}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("profileV2.stats.totalBookings")} value={data.bookings.total} icon={Calendar} />
        <StatCard label={t("profileV2.stats.upcoming")} value={data.bookings.upcoming} icon={Calendar} />
        <StatCard label={t("profileV2.stats.completed")} value={data.bookings.completed} icon={Sparkles} />
        <StatCard label={t("profileV2.stats.lastBooking")}
          value={data.bookings.lastBookingAt ? formatDate(data.bookings.lastBookingAt, i18n.language) : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t("profileV2.personal.title")} action={openBtn("personal")}>
          <div className="flex items-center gap-4">
            <Initials name={p?.full_name ?? null} email={data.email} />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-display text-lg">
                {p?.full_name || t("profileV2.personal.noName")}
              </p>
              <p className="truncate text-sm text-muted-foreground">{data.email ?? "—"}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {p?.country_code && (
                  <Badge variant="outline" className="text-[10px] uppercase">{p.country_code}</Badge>
                )}
                {p?.ui_language && (
                  <Badge variant="outline" className="text-[10px] uppercase">{p.ui_language}</Badge>
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("profileV2.contact.title")} action={openBtn("contact")}>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{data.email ?? "—"}</span>
            </li>
            <li className="flex items-center gap-3">
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              {p?.phone ? (
                <span className="truncate">{p.phone}</span>
              ) : (
                <Button variant="link" size="sm" className="h-auto p-0"
                  onClick={() => setOpenEditor("contact")}>
                  {t("surfaces.dashboard.complete.addPhone")}
                </Button>
              )}
            </li>
            <li className="flex items-center gap-3">
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{p?.sms_phone ? p.sms_phone : t("profileV2.contact.noSms")}</span>
              {smsVerified ? (
                <Badge variant="secondary" className="ml-auto text-[10px]">{t("profileV2.contact.verified")}</Badge>
              ) : p?.sms_phone ? (
                <Badge variant="outline" className="ml-auto text-[10px]">{t("profileV2.contact.unverified")}</Badge>
              ) : null}
            </li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard title={t("profileV2.addresses.title")}
        description={t("profileV2.addresses.description")}
        action={openBtn("addresses", t("profileV2.addresses.manage"))}>
        {data.addresses.length === 0 ? (
          <EmptyState icon={MapPin} title={t("profileV2.addresses.emptyTitle")}
            description={t("profileV2.addresses.emptyDescription")}
            action={<Button size="sm" onClick={() => setOpenEditor("addresses")}>{t("profileV2.addresses.addAddress")}</Button>} />
        ) : (
          <ul className="space-y-2">
            {data.addresses.map((a) => <AddressRow key={a.id} a={a} />)}
          </ul>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t("profileV2.notifications.title")} action={openBtn("notifications")}>
          {notifCount === 0 ? (
            <EmptyState icon={Bell} title={t("profileV2.notifications.emptyTitle")}
              description={t("profileV2.notifications.emptyDescription")} />
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {t("profileV2.notifications.channelsActive", { count: notifCount })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(notifPrefs).filter(([, v]) => !!v).map(([k]) => (
                  <Badge key={k} variant="outline">{k}</Badge>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title={t("profileV2.preferences.title")} action={openBtn("prefs")}>
          {data.primaryAddress ? (
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("profileV2.preferences.pets")}</span>
                <span>
                  {data.primaryAddress.has_pets
                    ? (data.primaryAddress.pet_details || t("profileV2.preferences.yes"))
                    : t("profileV2.preferences.no")}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("profileV2.preferences.children")}</span>
                <span>{data.primaryAddress.has_children ? t("profileV2.preferences.yes") : t("profileV2.preferences.no")}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("profileV2.preferences.suppliesReady")}</span>
                <span>{data.primaryAddress.cleaning_supplies_available ? t("profileV2.preferences.yes") : t("profileV2.preferences.no")}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("profileV2.preferences.parking")}</span>
                <span className="truncate max-w-[55%] text-right">
                  {data.primaryAddress.parking_info || "—"}
                </span>
              </li>
            </ul>
          ) : (
            <EmptyState icon={Sparkles} title={t("profileV2.preferences.emptyTitle")}
              description={t("profileV2.preferences.emptyDescription")} />
          )}
        </SectionCard>
      </div>

      <SectionCard title={t("profileV2.access.title")} action={openBtn("access")}>
        {data.primaryAddress ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("profileV2.access.method")}</span>
              <span>
                {t(`profileV2.addressLabels.accessMethod.${data.primaryAddress.access_method}`, {
                  defaultValue: ACCESS_METHOD_LABEL[data.primaryAddress.access_method] ?? data.primaryAddress.access_method,
                })}
              </span>
            </div>
            {data.primaryAddress.access_code && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("profileV2.access.code")}</span>
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
          <EmptyState icon={Lock} title={t("profileV2.access.emptyTitle")}
            description={t("profileV2.access.emptyDescription")} />
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t("profileV2.privacy.title")} action={
          <Button asChild variant="ghost" size="sm">
            <Link to={localize("/privatliv")}><Pencil className="mr-1 h-4 w-4" /> {t("profileV2.open")}</Link>
          </Button>
        }>
          <p className="text-sm text-muted-foreground">
            {t("profileV2.privacy.description")}
          </p>
        </SectionCard>

        <SectionCard title={t("profileV2.account.title")} action={openBtn("deactivate", t("profileV2.account.deactivate"))}>
          <div className="flex items-start gap-3 text-sm">
            <ShieldOff className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              {p?.deactivated_at ? (
                <>
                  <p className="font-medium text-destructive">{t("profileV2.account.deactivated")}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(p.deactivated_at, i18n.language)}</p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  {t("profileV2.account.activeDescription")}
                </p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title={t("profileV2.shortcuts.title")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickActionCard title={t("profileV2.shortcuts.myBookings")} description={t("profileV2.shortcuts.myBookingsDescription")} icon={Calendar} to={localize("/customer/bookings")} />
          <QuickActionCard title={t("profileV2.shortcuts.messages")} description={t("profileV2.shortcuts.messagesDescription")} icon={Inbox} to={localize("/customer/notifications")} />
          <QuickActionCard title={t("profileV2.shortcuts.cards")} description={t("profileV2.shortcuts.cardsDescription")} icon={CreditCard} to={localize("/customer/cards")} />
          <QuickActionCard title={t("profileV2.shortcuts.invoices")} description={t("profileV2.shortcuts.invoicesDescription")} icon={FileText} to={localize("/customer/invoices")} />
          <QuickActionCard title={t("profileV2.shortcuts.support")} description={t("profileV2.shortcuts.supportDescription")} icon={LifeBuoy} to={localize("/faq")} />
          <button type="button" onClick={() => setOpenEditor("tax")}
            className="group flex min-h-[88px] items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
            <span aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{t("profileV2.shortcuts.tax")}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{t("profileV2.shortcuts.taxDescription")}</p>
            </div>
          </button>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ComingSoonCard title={t("profileV2.comingSoon.familyTitle")}
          description={t("profileV2.comingSoon.familyDescription")} />
        <ComingSoonCard title={t("profileV2.comingSoon.productsTitle")}
          description={t("profileV2.comingSoon.productsDescription")} />
      </div>

      {/* Native V2 editors */}
      <SectionEditDialog
        open={openEditor === "personal"} onOpenChange={(o) => o || closeEditor()}
        title={t("profileV2.editors.personal")} dirty={dirty} saving={saving} onSave={handleSave}>
        {openEditor === "personal" && (
          <PersonalEditor
            initial={{
              full_name: p?.full_name ?? null,
              country_code: p?.country_code ?? null,
              ui_language: p?.ui_language ?? null,
            }}
            onSaved={() => void data.refetch()}
            registerSave={registerSave}
            registerDirty={registerDirty}
          />
        )}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "contact"} onOpenChange={(o) => o || closeEditor()}
        title={t("profileV2.editors.contact")} dirty={dirty} saving={saving} onSave={handleSave}>
        {openEditor === "contact" && (
          <ContactEditor
            initial={{ phone: p?.phone ?? null, email: data.email }}
            onSaved={() => void data.refetch()}
            registerSave={registerSave}
            registerDirty={registerDirty}
          />
        )}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "addresses"} onOpenChange={(o) => o || closeEditor()}
        title={t("profileV2.editors.addresses")} showFooter={false}>
        {openEditor === "addresses" && <AddressesEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "notifications"} onOpenChange={(o) => o || closeEditor()}
        title={t("profileV2.editors.notifications")} showFooter={false}>
        {openEditor === "notifications" && <NotificationsEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "prefs"} onOpenChange={(o) => o || closeEditor()}
        title={t("profileV2.editors.preferences")} dirty={dirty} saving={saving} onSave={handleSave}
        saveDisabled={!data.primaryAddress}>
        {openEditor === "prefs" && (
          <CleaningPreferencesEditor
            address={data.primaryAddress}
            onSaved={() => void data.refetch()}
            registerSave={registerSave}
            registerDirty={registerDirty}
          />
        )}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "access"} onOpenChange={(o) => o || closeEditor()}
        title={t("profileV2.editors.access")} dirty={dirty} saving={saving} onSave={handleSave}
        saveDisabled={!data.primaryAddress}>
        {openEditor === "access" && (
          <AccessInstructionsEditor
            address={data.primaryAddress}
            onSaved={() => void data.refetch()}
            registerSave={registerSave}
            registerDirty={registerDirty}
          />
        )}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "deactivate"} onOpenChange={(o) => o || closeEditor()}
        title={t("profileV2.editors.deactivate")} showFooter={false}>
        {openEditor === "deactivate" && <DeactivateEditor />}
      </SectionEditDialog>

      <SectionEditDialog
        open={openEditor === "tax"} onOpenChange={(o) => o || closeEditor()}
        title={t("profileV2.editors.tax")} showFooter={false}>
        {openEditor === "tax" && <TaxEditor />}
      </SectionEditDialog>
    </div>
  );
}
