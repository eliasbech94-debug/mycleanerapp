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
    const { data, error } = await supabase.rpc("search_marketplace_providers_v1" as never, {
      _country_code: country || null,
      _service_category: category === "all" ? null : category,
      _min_tier: tier === "all" ? null : tier,
      _language: lang === "all" ? null : lang,
      _max_hourly_rate: maxRate ? Number(maxRate) : null,
      _search: search.trim() || null,
      _sort: sort,
      _limit: PAGE,
      _offset: page * PAGE,
    } as never);
    if (error) { toast.error(error.message); setRows([]); return; }
    const list = (data as Row[] | null) ?? [];
    setRows(list);
    setTotal(list[0]?.total_count ?? 0);
  }, [country, category, tier, lang, maxRate, search, sort, page]);

  const loadFavs = useCallback(async () => {
    if (!user) { setFavIds(new Set()); return; }
    const { data } = await supabase.rpc("list_favorite_providers_v1" as never);
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
    const { error } = await (supabase.rpc as unknown as (n: string, a: unknown) => Promise<{ error: { message: string } | null }>)(
      "toggle_favorite_by_slug_v1", { _slug: slug },
    );
    if (error) toast.error(error.message);
    await loadFavs();
  }

  const filtered = useMemo(() => {
    if (!rows) return null;
    if (!showFavOnly) return rows;
    return rows.filter((r) => favIds.has(r.provider_slug));
  }, [rows, showFavOnly, favIds]);

  return (
    <main className="min-h-screen bg-background">
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
          <Card><CardContent className="p-10 text-center text-muted-foreground">Ingen providere matcher dine filtre.</CardContent></Card>
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
    <Card className="group overflow-hidden transition-shadow hover:shadow-lg">
      <div className="relative aspect-[4/3] bg-gradient-to-br from-primary/20 to-accent/20">
        {r.avatar_url && (
          <img src={r.avatar_url} alt={r.display_name} className="h-full w-full object-cover" loading="lazy" />
        )}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onToggleFav(); }}
          className="absolute right-2 top-2 rounded-full bg-background/80 p-2 shadow backdrop-blur transition hover:bg-background"
          aria-label={isFav ? "Fjern favorit" : "Tilføj til favoritter"}
        >
          <Heart className={`h-4 w-4 ${isFav ? "fill-red-500 text-red-500" : ""}`} />
        </button>
        <div className="absolute left-2 top-2 flex gap-1">
          {r.identity_verified_badge && <Badge className="bg-green-600 text-white">Verificeret</Badge>}
          {r.provider_tier && <Badge variant="secondary" className="capitalize">{r.provider_tier}</Badge>}
        </div>
      </div>
      <CardContent className="p-4">
        <Link to={`/c/${r.provider_slug}`} className="block">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-serif text-lg leading-tight group-hover:underline">{r.display_name}</h3>
            {r.marketplace_score !== null && (
              <div className="flex items-center gap-1 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />{r.marketplace_score}
              </div>
            )}
          </div>
          {r.public_bio && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.public_bio}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {r.country_code && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{r.country_code} · {r.service_radius_km ?? 10} km</span>}
            {r.avg_response_minutes !== null && <span>Svar ~{r.avg_response_minutes} min</span>}
            {r.completed_bookings > 0 && <span>{r.completed_bookings} bookinger</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {(r.service_categories ?? []).slice(0, 3).map((c) => <Badge key={c} variant="outline" className="capitalize">{c}</Badge>)}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm">
              {r.average_rating > 0 && (
                <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />{r.average_rating.toFixed(1)} <span className="text-muted-foreground">({r.total_reviews})</span></span>
              )}
            </div>
            <div className="text-right">
              {r.price_from !== null && <div className="text-sm font-medium">fra {r.price_from} kr/t</div>}
            </div>
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
