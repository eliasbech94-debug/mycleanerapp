import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import {
  Users, Briefcase, DollarSign, TrendingUp, AlertCircle, CheckCircle2, Clock,
  Search, Shield, Globe, BarChart3, Settings, LogOut, Eye, Ban, Star
} from "lucide-react";

const stats = [
  { label: "Aktive kunder", value: "12,847", change: "+12%", icon: Users, color: "text-primary" },
  { label: "Aktive providere", value: "3,291", change: "+8%", icon: Briefcase, color: "text-success" },
  { label: "Omsætning (mdr)", value: "€847,200", change: "+23%", icon: DollarSign, color: "text-accent" },
  { label: "Ventende godkendelser", value: "47", change: "", icon: AlertCircle, color: "text-warning" },
];

const pendingProviders = [
  { id: 1, name: "Lars Petersen", country: "🇩🇰", type: "Privat", category: "Håndværk", submitted: "2 timer siden", docs: 3 },
  { id: 2, name: "Schmidt GmbH", country: "🇩🇪", type: "Virksomhed", category: "Rengøring", submitted: "5 timer siden", docs: 5 },
  { id: 3, name: "Eva Lindberg", country: "🇸🇪", type: "Privat", category: "Have", submitted: "1 dag siden", docs: 2 },
];

const recentTasks = [
  { id: 101, customer: "Anne M.", provider: "Maria J.", service: "Hjemmerengøring", amount: "420 kr", status: "completed", country: "🇩🇰" },
  { id: 102, customer: "Hans K.", provider: "—", service: "VVS reparation", amount: "€180", status: "pending", country: "🇩🇪" },
  { id: 103, customer: "Pierre L.", provider: "CleanPro", service: "Vinduespudsning", amount: "€95", status: "in_progress", country: "🇫🇷" },
  { id: 104, customer: "Sofia N.", provider: "Erik B.", service: "Plæneklipning", amount: "450 kr", status: "completed", country: "🇸🇪" },
];

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    completed: { label: "Fuldført", variant: "default" },
    pending: { label: "Ventende", variant: "secondary" },
    in_progress: { label: "I gang", variant: "outline" },
  };
  const s = map[status] || map.pending;
  return <Badge variant={s.variant}>{s.label}</Badge>;
};

const AdminDashboard = () => {
  const [search, setSearch] = useState("");

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
              { icon: BarChart3, label: "Oversigt", active: true },
              { icon: Users, label: "Kunder" },
              { icon: Briefcase, label: "Providere" },
              { icon: DollarSign, label: "Betalinger" },
              { icon: Globe, label: "Lande & priser" },
              { icon: Shield, label: "Godkendelser" },
              { icon: Star, label: "Anmeldelser" },
              { icon: Settings, label: "Indstillinger" },
            ].map((item) => (
              <button key={item.label}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  item.active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
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
        <main className="flex-1 p-6 md:p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-heading text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">Oversigt over hele HomeHero-platformen</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søg kunder, providere..." className="pl-9 w-64" />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((s) => (
              <div key={s.label} className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div className="font-heading text-2xl font-bold">{s.value}</div>
                {s.change && <span className="text-xs text-success font-medium flex items-center gap-1 mt-1"><TrendingUp className="h-3 w-3" /> {s.change}</span>}
              </div>
            ))}
          </div>

          <Tabs defaultValue="approvals" className="space-y-4">
            <TabsList>
              <TabsTrigger value="approvals">Ventende godkendelser ({pendingProviders.length})</TabsTrigger>
              <TabsTrigger value="tasks">Seneste opgaver</TabsTrigger>
            </TabsList>

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

            <TabsContent value="tasks">
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">#</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Kunde</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Provider</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Service</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Land</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Beløb</th>
                        <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTasks.map((t) => (
                        <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                          <td className="p-4 text-sm text-muted-foreground">#{t.id}</td>
                          <td className="p-4 text-sm font-medium">{t.customer}</td>
                          <td className="p-4 text-sm">{t.provider}</td>
                          <td className="p-4 text-sm text-muted-foreground">{t.service}</td>
                          <td className="p-4 text-sm">{t.country}</td>
                          <td className="p-4 text-sm font-medium">{t.amount}</td>
                          <td className="p-4">{statusBadge(t.status)}</td>
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
    </div>
  );
};

export default AdminDashboard;
