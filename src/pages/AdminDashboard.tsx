import { Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Webhook,
  ShieldCheck,
  FileText,
  LogOut,
  Search,
  Bell,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import WebhookAlertBanner from "@/components/WebhookAlertBanner";
import { supabase } from "@/integrations/supabase/client";

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

const navItems = [
  { label: "Oversigt", href: "/admin", icon: LayoutDashboard, active: true },
  { label: "Betalinger", href: "/admin/payments", icon: CreditCard },
  { label: "Webhooks", href: "/admin/webhooks", icon: Webhook },
  { label: "Stripe", href: "/admin/stripe", icon: ShieldCheck },
  { label: "Adgangs-log", href: "/admin/access-logs", icon: FileText },
  { label: "Support (medarbejder)", href: "/employee", icon: Users },
];

// ============================================================================
// Subcomponents
// ============================================================================

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Gennemført"
      ? "bg-green-500/10 text-green-400"
      : status === "Afventer"
      ? "bg-orange-500/10 text-orange-400"
      : "bg-red-500/10 text-red-400";
  return (
    <span className={`px-2 py-1 rounded-full text-[10px] ${tone}`}>{status}</span>
  );
}

function HealthBar({ pct, tone }: { pct: number; tone: "ok" | "warn" }) {
  const color = tone === "ok" ? "bg-green-400" : "bg-yellow-400";
  return (
    <div className="w-full bg-[#1e1e5a] h-1 rounded-full overflow-hidden">
      <div className={`${color} h-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function AdminDashboard() {
  const navigate = useNavigate();
  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }
  return (
    <div
      className="min-h-screen w-full bg-[#0a0a1a] text-slate-300"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=DM+Sans:wght@400;500;700&display=swap"
        rel="stylesheet"
      />

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-[#1e1e5a] bg-[#0a0a1a] p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-[#4f46e5] rounded-xl flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-indigo-500/30">
              M
            </div>
            <h1
              className="text-white font-bold text-lg tracking-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              MyCleaner<span className="text-[#4f46e5]">.</span>
            </h1>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                    item.active
                      ? "bg-[#1e1e5a] text-white border border-[#4f46e5]/30"
                      : "text-slate-400 hover:bg-[#141432] hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4 opacity-70" />
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.badge ? (
                    <span className="ml-auto bg-[#4f46e5] text-[10px] px-2 py-0.5 rounded-full text-white font-bold">
                      {item.badge}
                    </span>
                  ) : item.active ? (
                    <span className="ml-auto w-2 h-2 rounded-full bg-[#4f46e5]" />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto pt-6 border-t border-[#1e1e5a] space-y-1">
            <Link
              to="/"
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-400 hover:bg-[#141432] hover:text-white transition-all"
            >
              <LayoutDashboard className="w-4 h-4 opacity-70" />
              <span className="text-sm">Til forside</span>
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-400 hover:bg-[#141432] hover:text-white transition-all"
            >
              <LogOut className="w-4 h-4 opacity-70" />
              <span className="text-sm">Log ud</span>
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 p-6 lg:p-10 space-y-6">
          {/* Header */}
          <header className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2
                className="text-2xl font-bold text-white"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Admin Oversigt
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Realtidsstatus for hele markedspladsen
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative hidden md:block">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  placeholder="Søg brugere, bookings, betalinger..."
                  className="pl-9 pr-4 py-2 bg-[#141432] border border-[#1e1e5a] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#4f46e5] w-72"
                />
              </div>
              <button className="relative w-10 h-10 rounded-xl bg-[#141432] border border-[#1e1e5a] flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                <Bell className="w-4 h-4" />
                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#4f46e5]" />
              </button>
              <div className="w-10 h-10 rounded-xl bg-[#1e1e5a] border border-[#4f46e5]/30 flex items-center justify-center text-xs font-bold text-white">
                EL
              </div>
            </div>
          </header>

          <WebhookAlertBanner />

          {/* KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((k) => (
              <div
                key={k.label}
                className="bg-[#141432] p-5 rounded-2xl border border-[#1e1e5a] relative overflow-hidden hover:border-[#4f46e5]/40 transition-colors"
              >
                <p className="text-xs text-slate-400 mb-1">{k.label}</p>
                <h3
                  className={`text-2xl font-bold ${
                    k.deltaTone === "warning" ? "text-orange-400" : "text-white"
                  }`}
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {k.value}
                </h3>
                {k.spark ? (
                  <div className="mt-4 h-8 w-full">
                    <svg
                      viewBox="0 0 100 20"
                      className="w-full h-full text-[#4f46e5] opacity-60 stroke-2 fill-none"
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
                      className="text-[10px] text-indigo-400 mt-2 inline-flex items-center gap-1 hover:underline"
                    >
                      {k.delta} <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  ) : (
                    <span
                      className={`text-[10px] mt-2 inline-flex items-center gap-1 ${
                        k.deltaTone === "warning"
                          ? "text-orange-400"
                          : k.deltaTone === "positive"
                          ? "text-green-400"
                          : "text-slate-500"
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
            <div className="lg:col-span-2 bg-[#141432] rounded-2xl border border-[#1e1e5a] overflow-hidden">
              <div className="p-5 border-b border-[#1e1e5a] flex justify-between items-center">
                <h4
                  className="text-sm font-bold text-white"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Seneste Betalinger
                </h4>
                <div className="flex gap-2">
                  <span className="text-[10px] px-2 py-1 rounded bg-[#1e1e5a] border border-[#4f46e5]/30 text-white">
                    Alle
                  </span>
                  <span className="text-[10px] px-2 py-1 rounded text-slate-400 hover:bg-[#1e1e5a] cursor-pointer">
                    Afventer
                  </span>
                  <Link
                    to="/admin/payments"
                    className="text-[10px] px-2 py-1 rounded text-[#4f46e5] hover:underline"
                  >
                    Se alle →
                  </Link>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-slate-500 text-[11px] uppercase tracking-wider">
                      <th className="p-4 font-medium">Booking ID</th>
                      <th className="p-4 font-medium">Kunde</th>
                      <th className="p-4 font-medium">Beløb</th>
                      <th className="p-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e5a]">
                    {recentPayments.map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-[#1e1e5a]/30 transition-colors"
                      >
                        <td className="p-4 text-slate-400 font-mono text-xs">
                          #{p.id}
                        </td>
                        <td className="p-4 text-white">{p.customer}</td>
                        <td className="p-4 text-white font-medium">{p.amount}</td>
                        <td className="p-4">
                          <StatusPill status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right column: health + support */}
            <div className="space-y-6">
              <div className="bg-[#141432] p-5 rounded-2xl border border-[#1e1e5a]">
                <div className="flex items-center justify-between mb-4">
                  <h4
                    className="text-xs font-bold text-white uppercase tracking-widest"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    Webhook Health
                  </h4>
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                </div>
                <div className="space-y-3">
                  {webhookHealth.map((h) => (
                    <div key={h.name}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs">{h.name}</span>
                        <span
                          className={`text-xs font-medium ${
                            h.tone === "ok" ? "text-green-400" : "text-yellow-400"
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

              <div className="bg-[#141432] p-5 rounded-2xl border border-[#1e1e5a]">
                <div className="flex items-center justify-between mb-4">
                  <h4
                    className="text-xs font-bold text-white uppercase tracking-widest"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    Support Kø
                  </h4>
                  <Link
                    to="/employee"
                    className="text-[10px] text-[#4f46e5] hover:underline"
                  >
                    Se alle →
                  </Link>
                </div>
                <div className="space-y-3">
                  {supportQueue.map((t, i) => (
                    <div
                      key={i}
                      className="p-3 bg-[#1e1e5a]/50 rounded-lg border border-[#1e1e5a] flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs text-white font-medium">
                          {t.title}
                        </p>
                        <p className="text-[10px] text-slate-500">{t.ago}</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-[#4f46e5]/10 flex items-center justify-center text-[#4f46e5] font-bold text-[10px]">
                        {t.initials}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Country breakdown */}
          <div className="bg-[#141432] p-5 rounded-2xl border border-[#1e1e5a]">
            <div className="flex items-center justify-between mb-4">
              <h4
                className="text-xs font-bold text-white uppercase tracking-widest"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                EU Operationer (12 lande)
              </h4>
              <Link
                to="/admin/stripe"
                className="text-[10px] text-[#4f46e5] font-bold uppercase tracking-wider hover:underline"
              >
                Administrer →
              </Link>
            </div>
            <div className="flex flex-wrap gap-3">
              {countries.map((c) => (
                <div
                  key={c.name}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                    c.primary
                      ? "bg-[#1e1e5a] border border-[#4f46e5]/30"
                      : "bg-[#1e1e5a]"
                  }`}
                >
                  <span className="text-xs">
                    {c.flag} {c.name}
                  </span>
                  <span className="text-xs font-bold text-white">{c.pct}%</span>
                </div>
              ))}
              <span className="px-3 py-1.5 text-[10px] text-[#4f46e5] font-bold uppercase tracking-wider self-center">
                +6 lande mere
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
