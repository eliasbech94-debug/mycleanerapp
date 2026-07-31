import { Link, useNavigate } from "react-router-dom";
import { Bell, Search, TrendingUp, ArrowUpRight, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import WebhookAlertBanner from "@/components/WebhookAlertBanner";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard";
import { Button } from "@/components/ui/button";

// ============================================================================
// Mock data — replace with Lovable Cloud queries
// ============================================================================

const kpis = [
  {
    key: "revenue",
    labelKey: "ops.dashboard.kpi.revenue.label",
    value: "142.500 kr",
    deltaKey: "ops.dashboard.kpi.revenue.delta",
    deltaTone: "positive" as const,
    spark: "M0,15 Q10,5 20,12 T40,8 T60,15 T80,5 T100,10",
  },
  {
    key: "providers",
    labelKey: "ops.dashboard.kpi.providers.label",
    value: "842",
    deltaKey: "ops.dashboard.kpi.providers.delta",
    deltaTone: "positive" as const,
  },
  {
    key: "kyc",
    labelKey: "ops.dashboard.kpi.kyc.label",
    value: "14",
    deltaKey: "ops.dashboard.kpi.kyc.delta",
    deltaTone: "warning" as const,
  },
  {
    key: "bookings",
    labelKey: "ops.dashboard.kpi.bookings.label",
    value: "156",
    deltaKey: "ops.dashboard.kpi.bookings.delta",
    deltaTone: "link" as const,
    href: "/admin/payments",
  },
];

const recentPayments = [
  { id: "BK-2941", customer: "Mads Jørgensen", amount: "450 kr", statusKey: "completed" },
  { id: "BK-2938", customer: "Sofie Nielsen", amount: "1.200 kr", statusKey: "pending" },
  { id: "BK-2935", customer: "Peter Berg", amount: "300 kr", statusKey: "refunded" },
  { id: "BK-2932", customer: "Anna Lindgren", amount: "820 kr", statusKey: "completed" },
  { id: "BK-2929", customer: "Hans Klein", amount: "560 kr", statusKey: "completed" },
];

const webhookHealth = [
  { nameKey: "ops.dashboard.webhookHealth.stripeEvents", pct: 99.9, tone: "ok" as const },
  { nameKey: "ops.dashboard.webhookHealth.emailDelivery", pct: 94.2, tone: "warn" as const },
  { nameKey: "ops.dashboard.webhookHealth.smsGateway", pct: 98.1, tone: "ok" as const },
];

const supportQueue = [
  { titleKey: "ops.dashboard.supportQueue.item1.title", agoKey: "ops.dashboard.supportQueue.item1.ago", initials: "SJ" },
  { titleKey: "ops.dashboard.supportQueue.item2.title", agoKey: "ops.dashboard.supportQueue.item2.ago", initials: "AL" },
  { titleKey: "ops.dashboard.supportQueue.item3.title", agoKey: "ops.dashboard.supportQueue.item3.ago", initials: "MK" },
];

const countries = [
  { flag: "🇩🇰", nameKey: "ops.dashboard.countries.dk", pct: 42, primary: true },
  { flag: "🇸🇪", nameKey: "ops.dashboard.countries.se", pct: 18 },
  { flag: "🇩🇪", nameKey: "ops.dashboard.countries.de", pct: 12 },
  { flag: "🇳🇴", nameKey: "ops.dashboard.countries.no", pct: 9 },
  { flag: "🇫🇷", nameKey: "ops.dashboard.countries.fr", pct: 6 },
  { flag: "🇪🇸", nameKey: "ops.dashboard.countries.es", pct: 5 },
];

function StatusPill({ statusKey, t }: { statusKey: string; t: (k: string) => string }) {
  const tone =
    statusKey === "completed"
      ? "bg-green-500/10 text-green-600 dark:text-green-400"
      : statusKey === "pending"
      ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
      : "bg-red-500/10 text-red-600 dark:text-red-400";
  return (
    <span className={`px-2 py-1 rounded-full text-[10px] ${tone}`}>
      {t(`ops.dashboard.paymentStatus.${statusKey}`)}
    </span>
  );
}

function HealthBar({ pct, tone }: { pct: number; tone: "ok" | "warn" }) {
  const color = tone === "ok" ? "bg-green-500" : "bg-yellow-500";
  return (
    <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
      <div className={`${color} h-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AdminDashboard() {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  const headerActions = (
    <>
      <div className="relative hidden md:block">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder={t("ops.dashboard.searchPlaceholder")}
          className="pl-9 pr-4 py-1.5 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-ring w-64"
        />
      </div>
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="w-4 h-4" />
        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary" />
      </Button>
      <Button variant="ghost" size="icon" onClick={handleSignOut} title={t("ops.dashboard.signOut")}>
        <LogOut className="w-4 h-4" />
      </Button>
    </>
  );

  return (
    <DashboardLayout role="admin" title={t("ops.dashboard.title")} headerActions={headerActions}>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t("ops.dashboard.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("ops.dashboard.subtitle")}
          </p>
        </div>

        <WebhookAlertBanner />

        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div
              key={k.key}
              className="bg-card p-5 rounded-2xl border border-border relative overflow-hidden hover:border-primary/40 transition-colors"
            >
              <p className="text-xs text-muted-foreground mb-1">{t(k.labelKey)}</p>
              <h3
                className={`text-2xl font-bold ${
                  k.deltaTone === "warning" ? "text-orange-500" : "text-foreground"
                }`}
              >
                {k.value}
              </h3>
              {k.spark ? (
                <div className="mt-4 h-8 w-full">
                  <svg
                    viewBox="0 0 100 20"
                    className="w-full h-full text-primary opacity-60 stroke-2 fill-none"
                    preserveAspectRatio="none"
                  >
                    <path d={k.spark} stroke="currentColor" strokeLinecap="round" />
                  </svg>
                </div>
              ) : null}
              {k.deltaKey ? (
                k.deltaTone === "link" && k.href ? (
                  <Link
                    to={k.href}
                    className="text-[10px] text-primary mt-2 inline-flex items-center gap-1 hover:underline"
                  >
                    {t(k.deltaKey)} <ArrowUpRight className="w-3 h-3" />
                  </Link>
                ) : (
                  <span
                    className={`text-[10px] mt-2 inline-flex items-center gap-1 ${
                      k.deltaTone === "warning"
                        ? "text-orange-500"
                        : k.deltaTone === "positive"
                        ? "text-green-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {k.deltaTone === "positive" ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : null}
                    {t(k.deltaKey)}
                  </span>
                )
              ) : null}
            </div>
          ))}
        </div>

        {/* Mid grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Payments table */}
          <div className="lg:col-span-2 bg-card rounded-2xl border border-border overflow-hidden">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h4 className="text-sm font-bold text-foreground">{t("ops.dashboard.recentPayments.title")}</h4>
              <Link
                to="/admin/payments"
                className="text-[10px] px-2 py-1 rounded text-primary hover:underline"
              >
                {t("ops.dashboard.seeAll")}
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground text-[11px] uppercase tracking-wider">
                    <th className="p-4 font-medium">{t("ops.dashboard.recentPayments.headers.bookingId")}</th>
                    <th className="p-4 font-medium">{t("ops.dashboard.recentPayments.headers.customer")}</th>
                    <th className="p-4 font-medium">{t("ops.dashboard.recentPayments.headers.amount")}</th>
                    <th className="p-4 font-medium">{t("ops.dashboard.recentPayments.headers.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                      <td className="p-4 text-muted-foreground font-mono text-xs">
                        #{p.id}
                      </td>
                      <td className="p-4 text-foreground">{p.customer}</td>
                      <td className="p-4 text-foreground font-medium">{p.amount}</td>
                      <td className="p-4">
                        <StatusPill statusKey={p.statusKey} t={t} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <div className="bg-card p-5 rounded-2xl border border-border">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-widest">
                  {t("ops.dashboard.webhookHealth.title")}
                </h4>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              <div className="space-y-3">
                {webhookHealth.map((h) => (
                  <div key={h.nameKey}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs">{t(h.nameKey)}</span>
                      <span
                        className={`text-xs font-medium ${
                          h.tone === "ok" ? "text-green-500" : "text-yellow-500"
                        }`}
                      >
                        {h.pct}%
                      </span>
                    </div>
                    <HealthBar pct={h.pct} tone={h.tone} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card p-5 rounded-2xl border border-border">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-widest">
                  {t("ops.dashboard.supportQueue.title")}
                </h4>
                <Link to="/employee" className="text-[10px] text-primary hover:underline">
                  {t("ops.dashboard.seeAll")}
                </Link>
              </div>
              <div className="space-y-3">
                {supportQueue.map((s, i) => (
                  <div
                    key={i}
                    className="p-3 bg-muted/50 rounded-lg border border-border flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs text-foreground font-medium">{t(s.titleKey)}</p>
                      <p className="text-[10px] text-muted-foreground">{t(s.agoKey)}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px]">
                      {s.initials}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Country breakdown */}
        <div className="bg-card p-5 rounded-2xl border border-border">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-widest">
              {t("ops.dashboard.euOperations.title")}
            </h4>
            <Link
              to="/admin/stripe"
              className="text-[10px] text-primary font-bold uppercase tracking-wider hover:underline"
            >
              {t("ops.dashboard.euOperations.manage")}
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            {countries.map((c) => (
              <div
                key={c.nameKey}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  c.primary ? "bg-muted border border-primary/30" : "bg-muted"
                }`}
              >
                <span className="text-xs">
                  {c.flag} {t(c.nameKey)}
                </span>
                <span className="text-xs font-bold text-foreground">{c.pct}%</span>
              </div>
            ))}
            <span className="px-3 py-1.5 text-[10px] text-primary font-bold uppercase tracking-wider self-center">
              {t("ops.dashboard.euOperations.moreCountries")}
            </span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
