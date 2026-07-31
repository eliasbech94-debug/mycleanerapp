import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Search, MapPin, Heart, ChevronLeft, ChevronRight, Star, Map as MapIcon, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { selectDemoProviders } from "@/data/demo";
import { EarlyAccessEmptyState } from "@/components/marketplace/EarlyAccessEmptyState";
import { ProviderCard as SharedProviderCard, type ProviderCardData } from "@/components/marketplace/ProviderCard";


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);

type Row = {
  provider_slug: string;
  display_name: string;
  avatar_url: string | null;
  marketplace_score: number | null;
  provider_tier: string;
  country_code: string | null;
  service_categories: string[] | null;
  languages: string[] | null;
  years_experience: number | null;
  price_from: number | null;
  service_radius_km: number | null;
  public_bio: string | null;
  equipment_badges: unknown;
  avg_response_minutes: number | null;
  approximate_service_area: { country?: string; radius_km?: number } | null;
  identity_verified_badge: boolean;
  repeat_customer_badge: boolean;
  average_rating: number;
  total_reviews: number;
  completed_bookings: number;
  years_on_platform: number;
  total_count: number;
};

const CATEGORIES = ["cleaning", "handyman", "garden", "moving"];
const TIERS = ["new", "verified", "experienced", "top_rated", "elite", "partner"];
const SORTS: Array<{ v: string; label: string }> = [
  { v: "score", label: "Bedste match" },
  { v: "price_asc", label: "Pris (lav → høj)" },
  { v: "price_desc", label: "Pris (høj → lav)" },
  { v: "rating", label: "Højeste rating" },
  { v: "response", label: "Hurtigst svar" },
];
const PAGE = 24;

export default function Marketplace() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [showFavOnly, setShowFavOnly] = useState(false);

  const [country, setCountry] = useState("DK");
  const [category, setCategory] = useState<string>("all");
  const [tier, setTier] = useState<string>("all");
  const [maxRate, setMaxRate] = useState<string>("");
  const [lang, setLang] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("score");

  const load = useCallback(async () => {
    setRows(null);
    const { data, error } = await rpc("search_marketplace_providers_v1", {
      _country_code: country || null,
      _service_category: category === "all" ? null : category,
      _min_tier: tier === "all" ? null : tier,
      _language: lang === "all" ? null : lang,
      _max_hourly_rate: maxRate ? Number(maxRate) : null,
      _search: search.trim() || null,
      _sort: sort,
      _limit: PAGE,
      _offset: page * PAGE,
    });
    const demoQuery = {
      countryCode: country || null,
      serviceCategory: category === "all" ? null : category,
      minTier: tier === "all" ? null : tier,
      language: lang === "all" ? null : lang,
      maxHourlyRate: maxRate ? Number(maxRate) : null,
      search: search.trim() || null,
      sort,
      limit: PAGE,
      offset: page * PAGE,
    };
    if (error) {
      // Development/preview only: local demo fixtures keep the list alive.
      const demo = selectDemoProviders(demoQuery) as unknown as Row[];
      if (demo.length > 0) { setRows(demo); setTotal(demo[0]?.total_count ?? demo.length); return; }
      toast.error(error.message); setRows([]); return;
    }
    let list = (data as Row[] | null) ?? [];
    if (list.length === 0) list = selectDemoProviders(demoQuery) as unknown as Row[];
    setRows(list);
    setTotal(list[0]?.total_count ?? 0);
  }, [country, category, tier, lang, maxRate, search, sort, page]);

  const loadFavs = useCallback(async () => {
    if (!user) { setFavIds(new Set()); return; }
    const { data } = await rpc("list_favorite_providers_v1");
    setFavIds(new Set(((data as { provider_slug: string }[] | null) ?? []).map((r) => r.provider_slug)));
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadFavs(); }, [loadFavs]);

  // Realtime: invalidate list when any provider profile changes.
  useEffect(() => {
    const ch = supabase.channel("marketplace-providers")
      .on("postgres_changes", { event: "*", schema: "public", table: "provider_profiles" }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  async function toggleFav(slug: string) {
    if (!user) { toast.info("Log ind for at gemme favoritter"); return; }
    // Optimistic UI update.
    setFavIds((s) => { const n = new Set(s); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
    const { error } = await rpc("toggle_favorite_by_slug_v1", { _slug: slug });
    if (error) toast.error(error.message);
    await loadFavs();
  }

  const hasActiveFilters =
    category !== "all" || tier !== "all" || lang !== "all" || maxRate !== "" ||
    search.trim() !== "" || showFavOnly;

  const filtered = useMemo(() => {
    if (!rows) return null;
    if (!showFavOnly) return rows;
    return rows.filter((r) => favIds.has(r.provider_slug));
  }, [rows, showFavOnly, favIds]);

  return (
    <main data-surface="marketplace" className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-serif tracking-tight">Find en cleaner</h1>
            <p className="text-sm text-muted-foreground">Gennemse verificerede providere. Book direkte i deres kalender.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/find-cleaner"><MapIcon className="mr-1 h-4 w-4" />Kort-visning</Link></Button>
            <Button variant={showFavOnly ? "default" : "outline"} size="sm" onClick={() => setShowFavOnly((v) => !v)}>
              <Heart className={`mr-1 h-4 w-4 ${showFavOnly ? "fill-current" : ""}`} />
              Favoritter
            </Button>
          </div>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2 relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 opacity-50" />
            <Input
              value={search}
              placeholder="Søg efter navn…"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (setPage(0), load())}
              className="pl-8"
              aria-label="Søg"
            />
          </div>
          <Select value={country} onValueChange={(v) => { setCountry(v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Land" /></SelectTrigger>
            <SelectContent>
              {["DK", "SE", "GB", "ES", "NO", "DE", "NL", "FR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => { setCategory(v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Service" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle services</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tier} onValueChange={(v) => { setTier(v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Min. tier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle tiers</SelectItem>
              {TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" placeholder="Maks. timepris" value={maxRate} onChange={(e) => { setMaxRate(e.target.value); setPage(0); }} aria-label="Maks. timepris" />
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
          <div>{rows === null ? "Indlæser…" : `${total} providere fundet`}</div>
        </div>

        {rows === null ? (
          <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered && filtered.length === 0 ? (
          hasActiveFilters ? (
            <Card><CardContent className="p-10 text-center text-muted-foreground">Ingen providere matcher dine filtre.</CardContent></Card>
          ) : (
            <EarlyAccessEmptyState />
          )
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered?.map((r) => (
              <ProviderCard key={r.provider_slug} r={r} isFav={favIds.has(r.provider_slug)} onToggleFav={() => toggleFav(r.provider_slug)} />
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between text-sm">
          <div>Side {page + 1} af {Math.max(1, Math.ceil(total / PAGE))}</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Forrige"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)} aria-label="Næste"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </main>
  );
}

function ProviderCard({ r, isFav, onToggleFav }: { r: Row; isFav: boolean; onToggleFav: () => void }) {
  return (
    <SharedProviderCard
      provider={r as unknown as ProviderCardData}
      to={`/p/${r.provider_slug}?src=marketplace_pick`}
      isFavorite={isFav}
      onToggleFavorite={onToggleFav}
    />
  );
}

