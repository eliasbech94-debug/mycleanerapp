import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import {
  Users, Briefcase, MessageCircle, AlertTriangle, Search, Clock,
  CheckCircle2, Phone, Mail, ArrowRight, LogOut, BarChart3, Settings,
  HelpCircle
} from "lucide-react";

const myTickets = [
  { id: "T-1042", customer: "Anne Mortensen", issue: "Provider mødte ikke op", priority: "high", status: "open", created: "1 time siden", country: "🇩🇰" },
  { id: "T-1039", customer: "Hans Klein", issue: "Forkert beløb trukket", priority: "medium", status: "in_progress", created: "3 timer siden", country: "🇩🇪" },
  { id: "T-1035", customer: "Pierre Lefebvre", issue: "Kvalitetsklage", priority: "low", status: "open", created: "1 dag siden", country: "🇫🇷" },
];

const providerIssues = [
  { id: "P-88", provider: "Maria Jensen", issue: "Manglende dokumenter", action: "Afventer straffeattest", country: "🇩🇰" },
  { id: "P-85", provider: "Schmidt GmbH", issue: "Udløbet erhvervsbevis", action: "Kontakt og bed om fornyet", country: "🇩🇪" },
];

const priorityBadge = (p: string) => {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
    high: { label: "Høj", variant: "destructive" },
    medium: { label: "Medium", variant: "default" },
    low: { label: "Lav", variant: "secondary" },
  };
  const s = map[p] || map.low;
  return <Badge variant={s.variant} className="text-xs">{s.label}</Badge>;
};

const EmployeeDashboard = () => {
  const [search, setSearch] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card min-h-screen p-4">
          <Link to="/" className="flex items-center gap-2 mb-8 px-2">
            <div className="gradient-hero rounded-xl w-8 h-8 flex items-center justify-center">
              <span className="text-primary-foreground font-heading font-bold">H</span>
            </div>
            <span className="font-heading font-bold">Support</span>
          </Link>
          <nav className="space-y-1 flex-1">
            {[
              { icon: BarChart3, label: "Mine sager", active: true },
              { icon: Users, label: "Kunder" },
              { icon: Briefcase, label: "Providere" },
              { icon: MessageCircle, label: "Beskeder" },
              { icon: AlertTriangle, label: "Eskalerede" },
              { icon: HelpCircle, label: "Vidensbase" },
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

        <main className="flex-1 p-6 md:p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-heading text-2xl font-bold">Medarbejder Dashboard</h1>
              <p className="text-sm text-muted-foreground">Hej Sarah — du har 3 åbne sager</p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søg sager, kunder..." className="pl-9 w-64" />
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid sm:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Åbne sager", value: "3", icon: AlertTriangle, color: "text-warning" },
              { label: "Løst i dag", value: "7", icon: CheckCircle2, color: "text-success" },
              { label: "Gns. responstid", value: "14 min", icon: Clock, color: "text-primary" },
              { label: "Kundetilfredshed", value: "4.8/5", icon: Users, color: "text-accent" },
            ].map((s) => (
              <div key={s.label} className="glass-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div className="font-heading text-xl font-bold">{s.value}</div>
              </div>
            ))}
          </div>

          <Tabs defaultValue="tickets">
            <TabsList>
              <TabsTrigger value="tickets">Mine sager</TabsTrigger>
              <TabsTrigger value="providers">Provider-opfølgning</TabsTrigger>
            </TabsList>

            <TabsContent value="tickets" className="space-y-3 mt-4">
              {myTickets.map((t) => (
                <div key={t.id} className="glass-card p-5 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground font-mono">{t.id}</span>
                        {priorityBadge(t.priority)}
                        <span className="text-sm">{t.country}</span>
                      </div>
                      <h3 className="font-medium">{t.issue}</h3>
                      <p className="text-sm text-muted-foreground mt-1">Kunde: {t.customer} • {t.created}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost"><Phone className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost"><Mail className="h-4 w-4" /></Button>
                      <Button size="sm">Håndter <ArrowRight className="h-3 w-3 ml-1" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="providers" className="space-y-3 mt-4">
              {providerIssues.map((p) => (
                <div key={p.id} className="glass-card p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground font-mono">{p.id}</span>
                        <span className="text-sm">{p.country}</span>
                      </div>
                      <h3 className="font-medium">{p.provider} — {p.issue}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{p.action}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">Kontakt</Button>
                      <Button size="sm">Løs</Button>
                    </div>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
