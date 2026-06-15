import { Link, useNavigate } from "react-router-dom";
import { Bell, Search, TrendingUp, ArrowUpRight, LogOut } from "lucide-react";
import WebhookAlertBanner from "@/components/WebhookAlertBanner";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard";
import { Button } from "@/components/ui/button";

// ============================================================================
// Mock data — replace with Lovable Cloud queries
// ============================================================================

const kpis = [
  {
    label: "Omsætning (7 dage)",
    value: "142.500 kr",
    delta: "+12.4%",
    deltaTone: "positive" as const,
    spark: "M0,15 Q10,5 20,12 T40,8 T60,15 T80,5 T100,10",
  },
  {
    label: "Aktive Udbydere",
    value: "842",
    delta: "+4.2% fra i går",
    deltaTone: "positive" as const,
  },
  {
    label: "Pending KYC",
    value: "14",
    delta: "Venter på godkendelse",
    deltaTone: "warning" as const,
  },
  {
    label: "Dagens Bookings",
    value: "156",
    delta: "Se alle detaljer",
    deltaTone: "link" as const,
    href: "/admin/payments",
  },
];

const recentPayments = [
  { id: "BK-2941", customer: "Mads Jørgensen", amount: "450 kr", status: "Gennemført" },
  { id: "BK-2938", customer: "Sofie Nielsen", amount: "1.200 kr", status: "Afventer" },
  { id: "BK-2935", customer: "Peter Berg", amount: "300 kr", status: "Refunderet" },
  { id: "BK-2932", customer: "Anna Lindgren", amount: "820 kr", status: "Gennemført" },
  { id: "BK-2929", customer: "Hans Klein", amount: "560 kr", status: "Gennemført" },
];

const webhookHealth = [
  { name: "Stripe Events", pct: 99.9, tone: "ok" as const },
  { name: "Email Delivery", pct: 94.2, tone: "warn" as const },
  { name: "SMS Gateway", pct: 98.1, tone: "ok" as const },
];

const supportQueue = [
  { title: "Mangler udstyr", ago: "2 min siden", initials: "SJ" },
  { title: "Refund forespørgsel", ago: "12 min siden", initials: "AL" },
  { title: "Provider ikke mødt op", ago: "34 min siden", initials: "MK" },
];

const countries = [
  { flag: "🇩🇰", name: "Danmark", pct: 42, primary: true },
  { flag: "🇸🇪", name: "Sverige", pct: 18 },
  { flag: "🇩🇪", name: "Tyskland", pct: 12 },
  { flag: "🇳🇴", name: "Norge", pct: 9 },
  { flag: "🇫🇷", name: "Frankrig", pct: 6 },
  { flag: "🇪🇸", name: "Spanien", pct: 5 },
];

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Gennemført"
      ? "bg-green-500/10 text-green-600 dark:text-green-400"
      : status === "Afventer"
      ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
      : "bg-red-500/10 text-red-600 dark:text-red-400";
  return (
    <span className={`px-2 py-1 rounded-full text-[10px] ${tone}`}>{status}</span>
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
          placeholder="Søg brugere, bookings..."
          className="pl-9 pr-4 py-1.5 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-ring w-64"
        />
      </div>
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="w-4 h-4" />
        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary" />
      </Button>
      <Button variant="ghost" size="icon" onClick={handleSignOut} title="Log ud">
        <LogOut className="w-4 h-4" />
      </Button>
    </>
  );

  return (
    <DashboardLayout role="admin" title="Admin Oversigt" headerActions={headerActions}>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Admin Oversigt</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Realtidsstatus for hele markedspladsen
          </p>
        </div>

        <WebhookAlertBanner />

        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="bg-card p-5 rounded-2xl border border-border relative overflow-hidden hover:border-primary/40 transition-colors"
            >
              <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
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
              {k.delta ? (
                k.deltaTone === "link" && k.href ? (
                  <Link
                    to={k.href}
                    className="text-[10px] text-primary mt-2 inline-flex items-center gap-1 hover:underline"
                  >
                    {k.delta} <ArrowUpRight className="w-3 h-3" />
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
                    {k.delta}
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
              <h4 className="text-sm font-bold text-foreground">Seneste Betalinger</h4>
              <Link
                to="/admin/payments"
                className="text-[10px] px-2 py-1 rounded text-primary hover:underline"
              >
                Se alle →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground text-[11px] uppercase tracking-wider">
                    <th className="p-4 font-medium">Booking ID</th>
                    <th className="p-4 font-medium">Kunde</th>
                    <th className="p-4 font-medium">Beløb</th>
                    <th className="p-4 font-medium">Status</th>
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
                        <StatusPill status={p.status} />
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
                  Webhook Health
                </h4>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              <div className="space-y-3">
                {webhookHealth.map((h) => (
                  <div key={h.name}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs">{h.name}</span>
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
                  Support Kø
                </h4>
                <Link to="/employee" className="text-[10px] text-primary hover:underline">
                  Se alle →
                </Link>
              </div>
              <div className="space-y-3">
                {supportQueue.map((t, i) => (
                  <div
                    key={i}
                    className="p-3 bg-muted/50 rounded-lg border border-border flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs text-foreground font-medium">{t.title}</p>
                      <p className="text-[10px] text-muted-foreground">{t.ago}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px]">
                      {t.initials}
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
              EU Operationer (12 lande)
            </h4>
            <Link
              to="/admin/stripe"
              className="text-[10px] text-primary font-bold uppercase tracking-wider hover:underline"
            >
              Administrer →
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            {countries.map((c) => (
              <div
                key={c.name}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  c.primary ? "bg-muted border border-primary/30" : "bg-muted"
                }`}
              >
                <span className="text-xs">
                  {c.flag} {c.name}
                </span>
                <span className="text-xs font-bold text-foreground">{c.pct}%</span>
              </div>
            ))}
            <span className="px-3 py-1.5 text-[10px] text-primary font-bold uppercase tracking-wider self-center">
              +6 lande mere
            </span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
