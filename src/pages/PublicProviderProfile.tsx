import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Star, Sparkles, Heart, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import BackButton from "@/components/BackButton";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);

type Profile = {
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
  average_rating: number;
  total_reviews: number;
  completed_bookings: number;
  years_on_platform: number;
};

export default function PublicProviderProfile() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data, error } = await rpc("get_public_provider_profile_v1", { _slug: slug });
      if (error) { toast.error(error.message); setProfile(null); return; }
      const p = ((data as Profile[] | null) ?? [])[0] ?? null;
      setProfile(p);
    })();
  }, [slug]);

  useEffect(() => {
    if (!user || !slug) return;
    (async () => {
      const { data } = await rpc("list_favorite_providers_v1");
      const set = new Set(((data as { provider_slug: string }[] | null) ?? []).map((r) => r.provider_slug));
      setIsFav(set.has(slug));
    })();
  }, [user, slug]);

  async function toggleFav() {
    if (!user) { toast.info("Log ind for at gemme favoritter"); return; }
    setIsFav((v) => !v);
    const { error } = await rpc("toggle_favorite_by_slug_v1", { _slug: slug });
    if (error) toast.error(error.message);
  }

  if (profile === undefined) {
    return <main className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></main>;
  }
  if (profile === null) {
    return <main className="grid min-h-screen place-items-center p-6 text-center">
      <div><h1 className="text-2xl font-serif">Provider ikke fundet</h1><p className="mt-2 text-muted-foreground">Profilen findes ikke, eller er ikke offentlig.</p><Button asChild className="mt-4"><Link to="/marketplace">Tilbage til marketplace</Link></Button></div>
    </main>;
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4"><BackButton /></div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Card className="overflow-hidden">
              <div className="relative aspect-[16/9] bg-gradient-to-br from-primary/20 to-accent/20">
                {profile.avatar_url && <img src={profile.avatar_url} alt={profile.display_name} className="h-full w-full object-cover" />}
                <div className="absolute left-3 top-3 flex gap-2">
                  {profile.identity_verified_badge && <Badge className="bg-green-600 text-white">Verificeret</Badge>}
                  <Badge variant="secondary" className="capitalize">{profile.provider_tier}</Badge>
                </div>
                <button type="button" onClick={toggleFav} className="absolute right-3 top-3 rounded-full bg-background/80 p-2 shadow backdrop-blur" aria-label={isFav ? "Fjern favorit" : "Tilføj favorit"}>
                  <Heart className={`h-5 w-5 ${isFav ? "fill-red-500 text-red-500" : ""}`} />
                </button>
              </div>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-2">
                  <h1 className="text-3xl font-serif">{profile.display_name}</h1>
                  {profile.marketplace_score !== null && (
                    <div className="flex items-center gap-1 text-lg font-medium">
                      <Sparkles className="h-5 w-5 text-primary" />{profile.marketplace_score}
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {profile.country_code && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{profile.country_code} · dækker {profile.service_radius_km ?? 10} km</span>}
                  {profile.avg_response_minutes !== null && <span>Svarer typisk inden for {profile.avg_response_minutes} min</span>}
                  {profile.years_on_platform > 0 && <span>{profile.years_on_platform} år på platformen</span>}
                </div>
                {profile.public_bio && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{profile.public_bio}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-serif text-xl">Services</h2>
                <div className="flex flex-wrap gap-2">
                  {(profile.service_categories ?? []).map((c) => <Badge key={c} variant="outline" className="capitalize">{c}</Badge>)}
                  {(!profile.service_categories || profile.service_categories.length === 0) && <span className="text-sm text-muted-foreground">Ingen kategorier angivet.</span>}
                </div>

                {(profile.languages ?? []).length > 0 && (
                  <>
                    <h3 className="mt-6 mb-2 font-medium">Sprog</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.languages!.map((l) => <Badge key={l} variant="secondary">{l}</Badge>)}
                    </div>
                  </>
                )}

                {Array.isArray(profile.equipment_badges) && (profile.equipment_badges as unknown[]).length > 0 && (
                  <>
                    <h3 className="mt-6 mb-2 font-medium">Udstyr</h3>
                    <div className="flex flex-wrap gap-2">
                      {(profile.equipment_badges as string[]).map((b) => <Badge key={b} variant="outline">{b}</Badge>)}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground">Timepris fra</div>
                <div className="text-3xl font-serif">{profile.price_from ? `${profile.price_from} kr` : "—"}</div>
                <Button asChild className="mt-4 w-full" size="lg">
                  <Link to={`/booking/new?provider=${profile.provider_slug}`}><CalendarCheck className="mr-2 h-4 w-4" />Book denne cleaner</Link>
                </Button>
                <Button variant="outline" className="mt-2 w-full" onClick={toggleFav}>
                  <Heart className={`mr-2 h-4 w-4 ${isFav ? "fill-red-500 text-red-500" : ""}`} />
                  {isFav ? "Fjern favorit" : "Gem som favorit"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-sm">
                <h3 className="mb-2 font-medium">Statistik</h3>
                <dl className="space-y-1">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Bookinger gennemført</dt><dd>{profile.completed_bookings}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Års erfaring</dt><dd>{profile.years_experience ?? "—"}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Rating</dt><dd className="inline-flex items-center gap-1">{profile.average_rating > 0 ? (<><Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />{profile.average_rating.toFixed(1)} ({profile.total_reviews})</>) : "—"}</dd></div>
                </dl>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
