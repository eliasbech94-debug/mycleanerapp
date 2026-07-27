/**
 * MobileProfile — iOS Settings-style profile overview for < 768px only.
 *
 * Rendered by MobileProfileGate at /profil when NO ?tab= param is set.
 * Tapping a row navigates to an existing /profil?tab=X sub-view or an
 * existing top-level route — no new destinations are invented.
 *
 * Role rows are gated by `useUserRoles`. Operations-only roles (admin,
 * employee) are already redirected by the underlying Profile page, so we
 * still fall through to the existing behavior on load.
 */
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bell, ChevronRight, CreditCard, FileText, Globe, HelpCircle, Home, LogIn, LogOut,
  MapPin, MessageSquare, Receipt, ShieldOff, User as UserIcon, Wallet,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useActiveMarket } from "@/context/ActiveMarketContext";
import { supabase } from "@/integrations/supabase/client";
import { MobileAppShell } from "@/components/layout/MobileAppShell";

type Row = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  onClick?: () => void;
  value?: string;
};

type Group = {
  key: string;
  title: string;
  rows: Row[];
};

function RowLink({ row }: { row: Row }) {
  const Icon = row.icon;
  const content = (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--mkt-ink))]/6 text-[hsl(var(--mkt-ink))]">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="flex-1 truncate text-[15px] text-[hsl(var(--mkt-ink))]">{row.label}</span>
      {row.value ? (
        <span className="max-w-[40%] truncate text-[13px] text-[hsl(var(--mkt-ink-muted))]">
          {row.value}
        </span>
      ) : null}
      <ChevronRight className="h-4 w-4 text-[hsl(var(--mkt-ink-muted))]" aria-hidden />
    </>
  );
  const cls =
    "tap-target flex w-full min-h-[52px] items-center gap-3 px-4 py-2 text-left active:bg-[hsl(var(--mkt-ink))]/4";
  if (row.to) {
    return (
      <Link to={row.to} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={row.onClick} className={cls}>
      {content}
    </button>
  );
}

export default function MobileProfile() {
  const { t, i18n } = useTranslation("common");
  const { user, profile } = useAuth();
  const roles = useUserRoles();
  const { market } = useActiveMarket();
  const navigate = useNavigate();

  const roleLabel = !user
    ? t("mobileProfile.roleGuest", "Gæst")
    : roles.isProvider
      ? t("mobileProfile.roleProvider", "Cleaner")
      : roles.isCustomer
        ? t("mobileProfile.roleCustomer", "Kunde")
        : t("mobileProfile.roleMember", "Medlem");

  const displayName = profile?.full_name ?? user?.email ?? "";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  };

  const groups: Group[] = [];

  // Account
  if (user) {
    const accountRows: Row[] = [
      { key: "info", label: t("mobileProfile.info", "Mine oplysninger"), icon: UserIcon, to: "/profil?tab=info" },
      { key: "addresses", label: t("mobileProfile.addresses", "Adresser"), icon: MapPin, to: "/profil?tab=addresses" },
      { key: "notifications", label: t("mobileProfile.notifications", "Notifikationer"), icon: Bell, to: "/profil?tab=notifications" },
    ];
    if (roles.isCustomer && !roles.isProvider) {
      accountRows.push(
        { key: "cards", label: t("mobileProfile.cards", "Kort & betalinger"), icon: CreditCard, to: "/profil?tab=cards" },
        { key: "invoices", label: t("mobileProfile.invoices", "Fakturaer"), icon: FileText, to: "/profil?tab=invoices" },
      );
    }
    if (roles.isProvider) {
      accountRows.push(
        { key: "payout", label: t("mobileProfile.payout", "Udbetalinger"), icon: Wallet, to: "/provider/finance" },
        { key: "receipts", label: t("mobileProfile.receipts", "Bilag"), icon: Receipt, to: "/provider/bilag" },
      );
    }
    accountRows.push(
      { key: "sms", label: t("mobileProfile.sms", "SMS"), icon: MessageSquare, to: "/profil?tab=sms" },
      { key: "tax", label: t("mobileProfile.tax", "Skatteoplysninger"), icon: Receipt, to: "/profil?tab=tax" },
    );
    groups.push({
      key: "account",
      title: t("mobileProfile.groupAccount", "Konto"),
      rows: accountRows,
    });
  }

  // Preferences
  const marketLabel = market?.country_code ?? "—";
  const langMap: Record<string, string> = {
    da: t("language.da", "Dansk"),
    en: t("language.en", "English"),
    sv: t("language.sv", "Svenska"),
    es: t("language.es", "Español"),
  };
  const langLabel = langMap[i18n.language?.split("-")[0] ?? "da"] ?? i18n.language;
  groups.push({
    key: "prefs",
    title: t("mobileProfile.groupPrefs", "Præferencer"),
    rows: [
      { key: "lang", label: t("mobileProfile.language", "Sprog"), icon: Globe, to: "/profil?tab=info", value: langLabel },
      { key: "market", label: t("mobileProfile.country", "Land"), icon: Home, to: "/profil?tab=addresses", value: marketLabel },
    ],
  });

  // Help & Rules
  groups.push({
    key: "help",
    title: t("mobileProfile.groupHelp", "Hjælp"),
    rows: [
      { key: "faq", label: t("mobileProfile.faq", "Hjælp & FAQ"), icon: HelpCircle, to: "/faq" },
      { key: "rules", label: t("mobileProfile.rules", "Regler"), icon: FileText, to: "/regler" },
    ],
  });

  // Danger / auth
  if (user) {
    groups.push({
      key: "session",
      title: t("mobileProfile.groupSession", "Session"),
      rows: [
        { key: "deactivate", label: t("mobileProfile.deactivate", "Deaktivér konto"), icon: ShieldOff, to: "/profil?tab=deactivate" },
        { key: "signout", label: t("mobileProfile.signOut", "Log ud"), icon: LogOut, onClick: handleSignOut },
      ],
    });
  } else {
    groups.push({
      key: "session",
      title: t("mobileProfile.groupSession", "Session"),
      rows: [
        { key: "signin", label: t("mobileProfile.signIn", "Log ind"), icon: LogIn, to: "/login?redirect=/profil" },
      ],
    });
  }

  return (
    <MobileAppShell appBar={{ title: t("mobileProfile.title", "Profil") }}>
      <div data-testid="mobile-profile" className="pb-6">
        {/* Avatar header */}
        <section className="flex items-center gap-3 px-4 pt-4 pb-6">
          <div
            aria-hidden
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--mkt-brand))]/12 text-2xl font-semibold text-[hsl(var(--mkt-brand))]"
          >
            {(displayName || "?").trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-[hsl(var(--mkt-ink))]">
              {displayName || t("mobileProfile.title", "Profil")}
            </p>
            <p className="truncate text-[13px] text-[hsl(var(--mkt-ink-muted))]">{roleLabel}</p>
          </div>
        </section>

        {groups.map((g) => (
          <section key={g.key} className="mt-4">
            <h2 className="px-4 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--mkt-ink-muted))]">
              {g.title}
            </h2>
            <div className="mx-3 divide-y divide-[hsl(var(--mkt-border))] overflow-hidden rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))]">
              {g.rows.map((r) => (
                <RowLink key={r.key} row={r} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </MobileAppShell>
  );
}
