import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import {
  Users, Briefcase, DollarSign, TrendingUp, AlertCircle, CheckCircle2, Clock,
  Search, Shield, Globe, BarChart3, Settings, LogOut, Eye, Ban, Star,
  MessageSquare, FileText, Pencil, Trash2, Pause, Play, Undo2, ArrowDownToLine,
  AlertTriangle, Send, ShieldCheck, Wallet, Loader2, XCircle, RefreshCw,
} from "lucide-react";
import WebhookAlertBanner from "@/components/WebhookAlertBanner";

// ============================================================================
// Mock data (would come from Lovable Cloud in production)
// ============================================================================

type UserStatus = "active" | "blocked" | "pending_docs";
type UserRole = "customer" | "provider_private" | "provider_business";

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  country: string;
  role: UserRole;
  status: UserStatus;
  joined: string;
  balance: number; // EUR — positive = owed to provider, negative = debt to platform
  currency: string;
}

const initialUsers: ManagedUser[] = [
  { id: "u_001", name: "Anne Mortensen", email: "anne.m@example.dk", country: "🇩🇰", role: "customer", status: "active", joined: "Mar 2025", balance: 0, currency: "DKK" },
  { id: "u_002", name: "Maria Jensen", email: "maria@cleanpro.dk", country: "🇩🇰", role: "provider_business", status: "active", joined: "Jan 2025", balance: 1240, currency: "DKK" },
  { id: "u_003", name: "Hans Klein", email: "hans.k@example.de", country: "🇩🇪", role: "customer", status: "blocked", joined: "Feb 2025", balance: 0, currency: "EUR" },
  { id: "u_004", name: "Erik Bergström", email: "erik.b@handyman.se", country: "🇸🇪", role: "provider_private", status: "active", joined: "Apr 2025", balance: -85, currency: "SEK" },
  { id: "u_005", name: "Pierre Laurent", email: "pierre@example.fr", country: "🇫🇷", role: "customer", status: "pending_docs", joined: "May 2026", balance: 0, currency: "EUR" },
  { id: "u_006", name: "Schmidt GmbH", email: "info@schmidt-clean.de", country: "🇩🇪", role: "provider_business", status: "active", joined: "Sep 2024", balance: 3420, currency: "EUR" },
];

type PaymentStatus = "completed" | "pending" | "refunded" | "paused" | "withdrawn";
type SyncState = "idle" | "pending" | "succeeded" | "failed";
type StripeAction = "pause" | "resume" | "refund";

interface PaymentSync {
  state: SyncState;
  action?: StripeAction;
  targetStatus?: PaymentStatus; // status to apply if sync succeeds
  prevStatus?: PaymentStatus;   // status to revert to on failure
  message?: string;
  stripeId?: string;            // e.g. re_xxx / tr_xxx
  attempts: number;
  updatedAt?: string;
}

interface Payment {
  id: string;
  taskId: string;
  customer: string;
  provider: string;
  gross: number;
  fee: number;
  payout: number; // to provider
  currency: string;
  status: PaymentStatus;
  date: string;
  stripePaymentIntent: string;
  sync: PaymentSync;
}

const initialSync = (): PaymentSync => ({ state: "idle", attempts: 0 });

const initialPayments: Payment[] = [
  { id: "p_1001", taskId: "T-2401", customer: "Anne M.", provider: "Maria Jensen", gross: 420, fee: 105, payout: 315, currency: "DKK", status: "completed", date: "06/06", stripePaymentIntent: "pi_3Nx1aQ", sync: { state: "succeeded", attempts: 1, stripeId: "tr_3Nx1aQ", updatedAt: "06/06 09:12" } },
  { id: "p_1002", taskId: "T-2402", customer: "Hans K.", provider: "Schmidt GmbH", gross: 180, fee: 45, payout: 135, currency: "EUR", status: "pending", date: "05/06", stripePaymentIntent: "pi_3Nx1bR", sync: initialSync() },
  { id: "p_1003", taskId: "T-2403", customer: "Pierre L.", provider: "CleanPro", gross: 95, fee: 23.75, payout: 71.25, currency: "EUR", status: "completed", date: "05/06", stripePaymentIntent: "pi_3Nx1cS", sync: { state: "succeeded", attempts: 1, stripeId: "tr_3Nx1cS", updatedAt: "05/06 14:02" } },
  { id: "p_1004", taskId: "T-2404", customer: "Sofia N.", provider: "Erik Bergström", gross: 450, fee: 112.5, payout: 337.5, currency: "SEK", status: "paused", date: "04/06", stripePaymentIntent: "pi_3Nx1dT", sync: { state: "succeeded", action: "pause", attempts: 1, updatedAt: "04/06 10:48" } },
  { id: "p_1005", taskId: "T-2399", customer: "Lars T.", provider: "Maria Jensen", gross: 600, fee: 150, payout: 450, currency: "DKK", status: "refunded", date: "03/06", stripePaymentIntent: "pi_3Nx19P", sync: { state: "succeeded", action: "refund", attempts: 2, stripeId: "re_3Nx19P", updatedAt: "03/06 16:30" } },
];

const pendingProviders = [
  { id: 1, name: "Lars Petersen", country: "🇩🇰", type: "Privat", category: "Håndværk", submitted: "2 timer siden", docs: 3 },
  { id: 2, name: "Schmidt GmbH", country: "🇩🇪", type: "Virksomhed", category: "Rengøring", submitted: "5 timer siden", docs: 5 },
  { id: 3, name: "Eva Lindberg", country: "🇸🇪", type: "Privat", category: "Have", submitted: "1 dag siden", docs: 2 },
];

const stats = [
  { label: "Aktive kunder", value: "12,847", change: "+12%", icon: Users, color: "text-primary" },
  { label: "Aktive providere", value: "3,291", change: "+8%", icon: Briefcase, color: "text-success" },
  { label: "Omsætning (mdr)", value: "€847,200", change: "+23%", icon: DollarSign, color: "text-accent" },
  { label: "Ventende godkendelser", value: "47", change: "", icon: AlertCircle, color: "text-warning" },
];

// ============================================================================
// Helpers
// ============================================================================

const roleLabel = (r: UserRole) =>
  r === "customer" ? "Kunde" : r === "provider_private" ? "Provider (privat)" : "Provider (virksomhed)";

const statusBadge = (status: UserStatus | PaymentStatus) => {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
    active: { label: "Aktiv", variant: "default" },
    blocked: { label: "Blokeret", variant: "destructive" },
    pending_docs: { label: "Afventer dok.", variant: "secondary" },
    completed: { label: "Fuldført", variant: "default" },
    pending: { label: "Ventende", variant: "secondary" },
    refunded: { label: "Refunderet", variant: "outline" },
    paused: { label: "Pauset", variant: "outline", className: "border-warning text-warning" },
    withdrawn: { label: "Trukket", variant: "outline", className: "border-destructive text-destructive" },
  };
  const s = map[status] || { label: status, variant: "secondary" as const };
  return <Badge variant={s.variant} className={s.className}>{s.label}</Badge>;
};

const fmt = (n: number, cur: string) =>
  new Intl.NumberFormat("da-DK", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n);

// ============================================================================
// Component
// ============================================================================

const AdminDashboard = () => {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [activeNav, setActiveNav] = useState<string>("Oversigt");
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers);
  const [payments, setPayments] = useState<Payment[]>(initialPayments);

  // Dialog state
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [messageUser, setMessageUser] = useState<ManagedUser | null>(null);
  const [docsUser, setDocsUser] = useState<ManagedUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [withdrawUser, setWithdrawUser] = useState<ManagedUser | null>(null);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.id.includes(q)
    );
  }, [users, search]);

  // ---- User actions ----
  const toggleBlock = (u: ManagedUser) => {
    setUsers(prev => prev.map(x =>
      x.id === u.id ? { ...x, status: x.status === "blocked" ? "active" : "blocked" } : x
    ));
    toast({
      title: u.status === "blocked" ? "Blokering fjernet" : "Bruger blokeret",
      description: `${u.name} er nu ${u.status === "blocked" ? "aktiv" : "blokeret"}.`,
    });
  };

  const saveUser = (updated: ManagedUser) => {
    setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
    toast({ title: "Brugeroplysninger gemt", description: `Ændringer for ${updated.name} er gemt.` });
    setEditUser(null);
  };

  const confirmDelete = () => {
    if (!deleteUser) return;
    setUsers(prev => prev.filter(x => x.id !== deleteUser.id));
    toast({ title: "Bruger slettet", description: `${deleteUser.name} er fjernet fra platformen.`, variant: "destructive" });
    setDeleteUser(null);
  };

  // ---- Payment actions (validated via Stripe sync) ----
  const patchPayment = (id: string, patch: Partial<Payment>) =>
    setPayments(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

  const patchSync = (id: string, patch: Partial<PaymentSync>) =>
    setPayments(prev => prev.map(p => p.id === id ? { ...p, sync: { ...p.sync, ...patch } } : p));

  // Simulated Stripe API call — swap with edge function call once Lovable Cloud + Stripe is enabled.
  type StripeResult = { ok: true; stripeId: string } | { ok: false; error: string };
  const callStripe = (action: StripeAction, _p: Payment): Promise<StripeResult> =>
    new Promise<StripeResult>((resolve) => {
      const latency = 700 + Math.random() * 1200;
      setTimeout(() => {
        const ok = Math.random() > 0.22;
        if (ok) {
          const prefix = action === "refund" ? "re" : "tr";
          resolve({ ok: true, stripeId: `${prefix}_${Math.random().toString(36).slice(2, 12)}` });
        } else {
          const errors = [
            "stripe: network_error — kunne ikke nå Stripe",
            "stripe: charge_already_refunded",
            "stripe: insufficient_funds på connect-konto",
            "stripe: rate_limited — prøv igen",
          ];
          resolve({ ok: false, error: errors[Math.floor(Math.random() * errors.length)] });
        }
      }, latency);
    });


  const runStripeAction = async (p: Payment, action: StripeAction, targetStatus: PaymentStatus, retry = false) => {
    const prevStatus = retry ? (p.sync.prevStatus ?? p.status) : p.status;
    const attempts = (retry ? p.sync.attempts : 0) + 1;
    const labels: Record<StripeAction, string> = {
      pause: "Pause udbetaling",
      resume: "Genoptag udbetaling",
      refund: "Refundering",
    };

    patchPayment(p.id, {
      sync: { state: "pending", action, targetStatus, prevStatus, attempts, message: "Synkroniserer med Stripe…" },
    });
    toast({ title: `${labels[action]} sendt til Stripe`, description: `${p.id} · forsøg ${attempts}` });

    const res = await callStripe(action, p);
    const now = new Date().toLocaleString("da-DK", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

    if ("stripeId" in res) {
      patchPayment(p.id, {
        status: targetStatus,
        sync: { state: "succeeded", action, attempts, stripeId: res.stripeId, updatedAt: now, message: `${labels[action]} bekræftet af Stripe` },
      });
      toast({ title: `${labels[action]} bekræftet`, description: `Stripe: ${res.stripeId}` });
    } else {
      const err = res.error;
      patchSync(p.id, { state: "failed", action, prevStatus, targetStatus, attempts, message: err, updatedAt: now });
      toast({
        title: `${labels[action]} fejlede`,
        description: `${err}. Klik på Genprøv for at forsøge igen.`,
        variant: "destructive",
      });
    }
  };


  const refundPayment = (p: Payment) => runStripeAction(p, "refund", "refunded");
  const togglePausePayout = (p: Payment) => {
    const action: StripeAction = p.status === "paused" ? "resume" : "pause";
    const target: PaymentStatus = action === "pause" ? "paused" : "pending";
    runStripeAction(p, action, target);
  };
  const retrySync = (p: Payment) => {
    if (!p.sync.action || !p.sync.targetStatus) return;
    runStripeAction(p, p.sync.action, p.sync.targetStatus, true);
  };

  const savePayment = (updated: Payment) => {
    setPayments(prev => prev.map(p => p.id === updated.id ? updated : p));
    toast({ title: "Betaling opdateret", description: `Beløb/gebyr for ${updated.id} er gemt.` });
    setEditPayment(null);
  };

  // ---- Withdrawal from provider account (with negative balance support) ----
  const performWithdrawal = (u: ManagedUser, amount: number, reason: string) => {
    const newBalance = u.balance - amount;
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, balance: newBalance } : x));
    const negative = newBalance < 0;
    toast({
      title: negative ? "Træk registreret med minus-saldo" : "Træk gennemført",
      description: negative
        ? `${u.name}: ny saldo ${fmt(newBalance, u.currency)}. Manko dækkes af kommende opgavebetalinger.`
        : `${u.name}: ny saldo ${fmt(newBalance, u.currency)}. Årsag: ${reason || "–"}`,
      variant: negative ? "destructive" : "default",
    });
    setWithdrawUser(null);
  };

  // ============================================================================

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card min-h-screen p-4">
          <Link to="/" className="flex items-center gap-2 mb-8 px-2">
            <div className="gradient-hero rounded-xl w-8 h-8 flex items-center justify-center">
              <span className="text-primary-foreground font-heading font-bold">H</span>
            </div>
            <span className="font-heading font-bold">Admin</span>
          </Link>
          <nav className="space-y-1 flex-1">
            {[
              { icon: BarChart3, label: "Oversigt" },
              { icon: Users, label: "Brugere" },
              { icon: DollarSign, label: "Betalinger" },
              { icon: Shield, label: "Godkendelser" },
              { icon: Globe, label: "Lande & priser" },
              { icon: Star, label: "Anmeldelser" },
              { icon: Settings, label: "Indstillinger" },
            ].map((item) => (
              <button key={item.label}
                onClick={() => setActiveNav(item.label)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeNav === item.label ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>
          <button className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-destructive transition-colors">
            <LogOut className="h-4 w-4" /> Log ud
          </button>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8">
          {/* Mobile top bar with brand */}
          <div className="lg:hidden flex items-center justify-between mb-5">
            <Link to="/" className="flex items-center gap-2">
              <div className="gradient-hero rounded-lg w-8 h-8 flex items-center justify-center">
                <span className="text-primary-foreground font-heading font-bold text-sm">H</span>
              </div>
              <span className="font-heading font-bold text-sm">Admin</span>
            </Link>
            <Button size="sm" variant="ghost" className="text-muted-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>

          <div className="mb-5">
            <WebhookAlertBanner compact />
          </div>


          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6 md:mb-8">
            <div>
              <h1 className="font-heading text-xl sm:text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Fuld administration af brugere, betalinger og platform</p>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søg kunder, providere..." className="pl-9 w-full" />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 md:mb-8">
            {stats.map((s) => (
              <div key={s.label} className="glass-card p-4 sm:p-5">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-xs sm:text-sm text-muted-foreground line-clamp-1">{s.label}</span>
                  <s.icon className={`h-4 w-4 sm:h-5 sm:w-5 shrink-0 ${s.color}`} />
                </div>
                <div className="font-heading text-lg sm:text-2xl font-bold">{s.value}</div>
                {s.change && <span className="text-xs text-success font-medium flex items-center gap-1 mt-1"><TrendingUp className="h-3 w-3" /> {s.change}</span>}
              </div>
            ))}
          </div>

          <Tabs defaultValue="users" className="space-y-4">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="users"><Users className="h-4 w-4 mr-1.5" /> Brugere ({users.length})</TabsTrigger>
              <TabsTrigger value="payments"><DollarSign className="h-4 w-4 mr-1.5" /> Betalinger</TabsTrigger>
              <TabsTrigger value="approvals"><Shield className="h-4 w-4 mr-1.5" /> Godkendelser ({pendingProviders.length})</TabsTrigger>
            </TabsList>

            {/* ============ USERS ============ */}
            <TabsContent value="users">
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Bruger</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Land</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Rolle</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Saldo</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>
                        <th className="text-right text-xs font-medium text-muted-foreground p-4">Handlinger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                          <td className="p-4">
                            <div className="font-medium text-sm">{u.name}</div>
                            <div className="text-xs text-muted-foreground">{u.email} · {u.id}</div>
                          </td>
                          <td className="p-4 text-sm">{u.country}</td>
                          <td className="p-4"><Badge variant="secondary" className="text-xs">{roleLabel(u.role)}</Badge></td>
                          <td className="p-4 text-sm font-medium">
                            <span className={u.balance < 0 ? "text-destructive" : u.balance > 0 ? "text-success" : ""}>
                              {fmt(u.balance, u.currency)}
                            </span>
                          </td>
                          <td className="p-4">{statusBadge(u.status)}</td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              <Button size="sm" variant="ghost" title="Rediger" onClick={() => setEditUser(u)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Send besked" onClick={() => setMessageUser(u)}>
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Anmod om dokumentation" onClick={() => setDocsUser(u)}>
                                <FileText className="h-4 w-4" />
                              </Button>
                              {u.role !== "customer" && (
                                <Button size="sm" variant="ghost" title="Træk fra provider-konto" onClick={() => setWithdrawUser(u)}>
                                  <ArrowDownToLine className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                title={u.status === "blocked" ? "Fjern blokering" : "Blokér"}
                                onClick={() => toggleBlock(u)}
                                className={u.status === "blocked" ? "text-success" : "text-warning"}
                              >
                                {u.status === "blocked" ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                              </Button>
                              <Button size="sm" variant="ghost" title="Slet" onClick={() => setDeleteUser(u)} className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">Ingen brugere matcher søgningen.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ============ PAYMENTS ============ */}
            <TabsContent value="payments">
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Betaling</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Kunde → Provider</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Brutto</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Gebyr (25%)</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Udbetaling</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Stripe sync</th>
                        <th className="text-right text-xs font-medium text-muted-foreground p-4">Handlinger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => {
                        const syncing = p.sync.state === "pending";
                        const failed = p.sync.state === "failed";
                        return (
                        <tr key={p.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                          <td className="p-4">
                            <div className="font-medium text-sm">{p.id}</div>
                            <div className="text-xs text-muted-foreground">{p.taskId} · {p.date}</div>
                          </td>
                          <td className="p-4 text-sm">
                            <div>{p.customer}</div>
                            <div className="text-xs text-muted-foreground">→ {p.provider}</div>
                          </td>
                          <td className="p-4 text-sm font-medium">{fmt(p.gross, p.currency)}</td>
                          <td className="p-4 text-sm">{fmt(p.fee, p.currency)}</td>
                          <td className="p-4 text-sm font-medium text-success">{fmt(p.payout, p.currency)}</td>
                          <td className="p-4">{statusBadge(p.status)}</td>
                          <td className="p-4"><StripeSyncCell sync={p.sync} onRetry={() => retrySync(p)} /></td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              <Button size="sm" variant="ghost" title="Rediger beløb/gebyr" onClick={() => setEditPayment(p)} disabled={syncing}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title={p.status === "paused" ? "Genoptag udbetaling" : "Pause udbetaling"}
                                onClick={() => togglePausePayout(p)}
                                disabled={p.status === "refunded" || syncing}
                              >
                                {syncing && p.sync.action !== "refund"
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : p.status === "paused"
                                    ? <Play className="h-4 w-4 text-success" />
                                    : <Pause className="h-4 w-4 text-warning" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Refundér"
                                onClick={() => refundPayment(p)}
                                disabled={p.status === "refunded" || syncing}
                                className="text-destructive"
                              >
                                {syncing && p.sync.action === "refund"
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <Undo2 className="h-4 w-4" />}
                              </Button>
                              {failed && (
                                <Button size="sm" variant="outline" title="Genprøv Stripe-synkronisering" onClick={() => retrySync(p)} className="text-warning border-warning">
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* ============ APPROVALS (existing) ============ */}
            <TabsContent value="approvals">
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Provider</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Land</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Type</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Kategori</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Dokumenter</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Modtaget</th>
                        <th className="text-right text-xs font-medium text-muted-foreground p-4">Handlinger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingProviders.map((p) => (
                        <tr key={p.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                          <td className="p-4 font-medium text-sm">{p.name}</td>
                          <td className="p-4 text-sm">{p.country}</td>
                          <td className="p-4"><Badge variant="secondary" className="text-xs">{p.type}</Badge></td>
                          <td className="p-4 text-sm text-muted-foreground">{p.category}</td>
                          <td className="p-4 text-sm">{p.docs} filer</td>
                          <td className="p-4 text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> {p.submitted}</td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button size="sm" variant="ghost"><Eye className="h-4 w-4" /></Button>
                              <Button size="sm" variant="outline" className="text-success"><CheckCircle2 className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" className="text-destructive"><Ban className="h-4 w-4" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* ============================ DIALOGS ============================ */}

      {/* Edit user */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rediger bruger</DialogTitle>
            <DialogDescription>Opdatér oplysninger, rolle eller status for {editUser?.name}.</DialogDescription>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Navn</Label>
                  <Input value={editUser.name} onChange={(e) => setEditUser({ ...editUser, name: e.target.value })} />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input value={editUser.email} onChange={(e) => setEditUser({ ...editUser, email: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Rolle</Label>
                  <Select value={editUser.role} onValueChange={(v: UserRole) => setEditUser({ ...editUser, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Kunde</SelectItem>
                      <SelectItem value="provider_private">Provider (privat)</SelectItem>
                      <SelectItem value="provider_business">Provider (virksomhed)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editUser.status} onValueChange={(v: UserStatus) => setEditUser({ ...editUser, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktiv</SelectItem>
                      <SelectItem value="blocked">Blokeret</SelectItem>
                      <SelectItem value="pending_docs">Afventer dokumentation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Saldo ({editUser.currency})</Label>
                <Input
                  type="number"
                  value={editUser.balance}
                  onChange={(e) => setEditUser({ ...editUser, balance: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground mt-1">Negativ saldo dækkes automatisk af kommende opgavebetalinger.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Annullér</Button>
            <Button onClick={() => editUser && saveUser(editUser)}>Gem ændringer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send message */}
      <MessageDialog user={messageUser} onClose={() => setMessageUser(null)} onSend={(subject, body) => {
        toast({ title: "Besked sendt", description: `"${subject}" sendt til ${messageUser?.name}.` });
        setMessageUser(null);
      }} />

      {/* Request documentation */}
      <DocsDialog user={docsUser} onClose={() => setDocsUser(null)} onSend={(items, note) => {
        toast({
          title: "Anmodning sendt",
          description: `${docsUser?.name} er bedt om: ${items.join(", ")}${note ? ` — ${note}` : ""}.`,
        });
        if (docsUser) setUsers(prev => prev.map(x => x.id === docsUser.id ? { ...x, status: "pending_docs" } : x));
        setDocsUser(null);
      }} />

      {/* Delete confirm */}
      <Dialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Slet bruger permanent
            </DialogTitle>
            <DialogDescription>
              Du er ved at slette <strong>{deleteUser?.name}</strong>. Dette kan ikke fortrydes. Alle data, opgaver og betalingshistorik fjernes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>Annullér</Button>
            <Button variant="destructive" onClick={confirmDelete}>Slet permanent</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit payment */}
      <Dialog open={!!editPayment} onOpenChange={(o) => !o && setEditPayment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rediger betaling {editPayment?.id}</DialogTitle>
            <DialogDescription>Justér brutto-beløb, platformgebyr og provider-udbetaling.</DialogDescription>
          </DialogHeader>
          {editPayment && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Brutto ({editPayment.currency})</Label>
                  <Input
                    type="number"
                    value={editPayment.gross}
                    onChange={(e) => {
                      const gross = Number(e.target.value);
                      setEditPayment({ ...editPayment, gross, payout: +(gross - editPayment.fee).toFixed(2) });
                    }}
                  />
                </div>
                <div>
                  <Label>Platformgebyr</Label>
                  <Input
                    type="number"
                    value={editPayment.fee}
                    onChange={(e) => {
                      const fee = Number(e.target.value);
                      setEditPayment({ ...editPayment, fee, payout: +(editPayment.gross - fee).toFixed(2) });
                    }}
                  />
                </div>
                <div>
                  <Label>Udbetaling</Label>
                  <Input
                    type="number"
                    value={editPayment.payout}
                    onChange={(e) => setEditPayment({ ...editPayment, payout: Number(e.target.value) })}
                  />
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Stop platformgebyr på denne transaktion</Label>
                  <p className="text-xs text-muted-foreground">Sætter gebyret til 0 og overfører hele beløbet til provider.</p>
                </div>
                <Switch
                  checked={editPayment.fee === 0}
                  onCheckedChange={(c) => {
                    const fee = c ? 0 : +(editPayment.gross * 0.25).toFixed(2);
                    setEditPayment({ ...editPayment, fee, payout: +(editPayment.gross - fee).toFixed(2) });
                  }}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPayment(null)}>Annullér</Button>
            <Button onClick={() => editPayment && savePayment(editPayment)}>Gem</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw from provider account */}
      <WithdrawDialog user={withdrawUser} onClose={() => setWithdrawUser(null)} onConfirm={performWithdrawal} />
    </div>
  );
};

// ============================================================================
// Sub-components
// ============================================================================

const StripeSyncCell = ({ sync, onRetry }: { sync: PaymentSync; onRetry: () => void }) => {
  if (sync.state === "idle") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (sync.state === "pending") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <div>
          <div className="font-medium text-primary">Pending</div>
          <div className="text-muted-foreground">Stripe · forsøg {sync.attempts}</div>
        </div>
      </div>
    );
  }
  if (sync.state === "succeeded") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        <div>
          <div className="font-medium text-success">Succeeded</div>
          <div className="text-muted-foreground truncate max-w-[140px]" title={sync.stripeId}>
            {sync.stripeId ?? "ok"} {sync.updatedAt && `· ${sync.updatedAt}`}
          </div>
        </div>
      </div>
    );
  }
  // failed
  return (
    <div className="flex items-start gap-2 text-xs">
      <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5" />
      <div className="min-w-0">
        <div className="font-medium text-destructive">Failed</div>
        <div className="text-muted-foreground truncate max-w-[160px]" title={sync.message}>
          {sync.message ?? "ukendt fejl"} · forsøg {sync.attempts}
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-warning hover:underline"
        >
          <RefreshCw className="h-3 w-3" /> Genprøv synkronisering
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// Sub-dialogs
// ============================================================================


const MessageDialog = ({ user, onClose, onSend }: {
  user: ManagedUser | null;
  onClose: () => void;
  onSend: (subject: string, body: string) => void;
}) => {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) { onClose(); setSubject(""); setBody(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> Send besked til {user?.name}</DialogTitle>
          <DialogDescription>Beskeden sendes som e-mail og vises i brugerens kontoindbakke.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Emne</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="F.eks. Vedrørende din konto" />
          </div>
          <div>
            <Label>Besked</Label>
            <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Skriv din besked her..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annullér</Button>
          <Button onClick={() => { onSend(subject, body); setSubject(""); setBody(""); }} disabled={!subject.trim() || !body.trim()}>
            <Send className="h-4 w-4 mr-1.5" /> Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DOC_OPTIONS = [
  "ID / pas",
  "Straffeattest",
  "CVR / virksomhedsregistrering",
  "Forsikringsbevis",
  "Bankoplysninger",
  "Adressebevis",
  "Faglige certifikater",
];

const DocsDialog = ({ user, onClose, onSend }: {
  user: ManagedUser | null;
  onClose: () => void;
  onSend: (items: string[], note: string) => void;
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const toggle = (item: string) =>
    setSelected(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) { onClose(); setSelected([]); setNote(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Kræv dokumentation</DialogTitle>
          <DialogDescription>Vælg hvilke dokumenter {user?.name} skal uploade. Brugeren får status "Afventer dokumentation".</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {DOC_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggle(d)}
                className={`text-left text-sm px-3 py-2 rounded-lg border transition-colors ${
                  selected.includes(d)
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border hover:bg-secondary"
                }`}
              >
                {selected.includes(d) && <CheckCircle2 className="h-3.5 w-3.5 text-primary inline mr-1.5" />}
                {d}
              </button>
            ))}
          </div>
          <div>
            <Label>Note til brugeren (valgfri)</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="F.eks. frist eller specifikke krav..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annullér</Button>
          <Button onClick={() => { onSend(selected, note); setSelected([]); setNote(""); }} disabled={selected.length === 0}>
            <Send className="h-4 w-4 mr-1.5" /> Send anmodning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const WithdrawDialog = ({ user, onClose, onConfirm }: {
  user: ManagedUser | null;
  onClose: () => void;
  onConfirm: (u: ManagedUser, amount: number, reason: string) => void;
}) => {
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState("");
  const num = Number(amount) || 0;
  const newBalance = user ? user.balance - num : 0;
  const goesNegative = newBalance < 0;

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) { onClose(); setAmount(""); setReason(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Træk fra provider-konto</DialogTitle>
          <DialogDescription>
            Træk beløb fra {user?.name}s saldo. Hvis saldoen er utilstrækkelig, registreres minus og dækkes automatisk af kommende opgavebetalinger.
          </DialogDescription>
        </DialogHeader>
        {user && (
          <div className="space-y-4">
            <div className="rounded-xl bg-secondary p-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Nuværende saldo</span>
              <span className={`font-medium ${user.balance < 0 ? "text-destructive" : ""}`}>{fmt(user.balance, user.currency)}</span>
            </div>
            <div>
              <Label>Beløb ({user.currency})</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Årsag</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="F.eks. tilbageførsel, justering, kompensation..." />
            </div>
            {num > 0 && (
              <div className={`rounded-xl border p-3 text-sm ${goesNegative ? "border-destructive/40 bg-destructive/5" : "border-border bg-secondary"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Ny saldo efter træk</span>
                  <span className={`font-semibold ${goesNegative ? "text-destructive" : ""}`}>{fmt(newBalance, user.currency)}</span>
                </div>
                {goesNegative && (
                  <p className="text-xs text-destructive mt-2 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Saldoen bliver negativ. Manko ({fmt(Math.abs(newBalance), user.currency)}) registreres som gæld og trækkes automatisk fra de næste opgavebetalinger.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annullér</Button>
          <Button
            variant={goesNegative ? "destructive" : "default"}
            onClick={() => user && onConfirm(user, num, reason)}
            disabled={!user || num <= 0}
          >
            <ArrowDownToLine className="h-4 w-4 mr-1.5" /> Bekræft træk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminDashboard;
