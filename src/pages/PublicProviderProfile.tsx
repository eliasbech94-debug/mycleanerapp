import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, MapPin, Sparkles, Heart, CalendarCheck, ShieldCheck, Clock, BellRing, CalendarPlus, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useAppContext, type AcquisitionSource } from "@/context/AppContext";
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
  average_rating: number | null;
  total_reviews: number | null;
  completed_bookings: number;
  years_on_platform: number;
  insurance_valid: boolean;
};

type Slot = { slot_date: string; slot_hour: number };

const KNOWN_SOURCES: AcquisitionSource[] = [
  "provider_direct_link",
  "provider_qr_code",
  "provider_social_share",
  "provider_embedded_widget",
  "marketplace_pick",
];


function parseSource(v: string | null): AcquisitionSource {
  if (v && (KNOWN_SOURCES as string[]).includes(v)) return v as AcquisitionSource;
  return "provider_direct_link";
}

export default function PublicProviderProfile() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { setProviderLock, setProviderHint, clearProviderLock, campaign } = useAppContext();

  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [isFav, setIsFav] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [nextSlot, setNextSlot] = useState<Slot | null>(null);
  const [notifyRequested, setNotifyRequested] = useState(false);
  const [showAltDialog, setShowAltDialog] = useState(false);

  const search = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const source = parseSource(search.get("src"));
  const ref = search.get("ref");

  // Attribution capture the moment we land on a /p/:slug URL.
  useEffect(() => {
    if (!slug) return;
    setProviderLock({
      slug,
      source,
      ref,
      campaign,
      landingUrl: window.location.href,
      firstSeenAt: new Date().toISOString(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data, error } = await rpc("get_public_provider_profile_v1", { _slug: slug });
      if (error) { toast.error(error.message); setProfile(null); return; }
      const p = ((data as Profile[] | null) ?? [])[0] ?? null;
      setProfile(p);
      // Server-side slug resolution succeeded — store the display name as a
      // UI-only hint. Never a real provider UUID, never authoritative.
      if (p) setProviderHint(slug, p.display_name);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);


  useEffect(() => {
    if (!user || !slug) return;
    (async () => {
      const { data } = await rpc("list_favorite_providers_v1");
      const set = new Set(((data as { provider_slug: string }[] | null) ?? []).map((r) => r.provider_slug));
      setIsFav(set.has(slug));
    })();
  }, [user, slug]);

  // Availability — only bookable slots, next 14 days.
  useEffect(() => {
    if (!slug) return;
    (async () => {
      const today = new Date();
      const to = new Date(today.getTime() + 14 * 86400000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const { data, error } = await rpc("list_provider_bookable_slots_v1", {
        _slug: slug, _from: iso(today), _to: iso(to),
      });
      if (error) { setSlots([]); return; }
      const rows = ((data as Slot[] | null) ?? []).slice(0, 60);
      setSlots(rows);
      // No slots in the 14-day window → look ahead 60 days for the next single
      // bookable slot so the fallback UI can show "next available".
      if (rows.length === 0) {
        const far = new Date(today.getTime() + 60 * 86400000);
        const { data: farData } = await rpc("list_provider_bookable_slots_v1", {
          _slug: slug, _from: iso(today), _to: iso(far),
        });
        const first = ((farData as Slot[] | null) ?? [])[0] ?? null;
        setNextSlot(first);
      } else {
        setNextSlot(null);
      }
    })();
  }, [slug]);

  async function toggleFav() {
    if (!user) { toast.info("Log ind for at gemme favoritter"); return; }
    setIsFav((v) => !v);
    const { error } = await rpc("toggle_favorite_by_slug_v1", { _slug: slug });
    if (error) toast.error(error.message);
  }

  function bookDirect(prefillDate?: string, prefillSlot?: string) {
    if (!slug) return;
    const qs = new URLSearchParams({
      provider: slug,
      src: source,
    });
    if (prefillDate) qs.set("date", prefillDate);
    if (prefillSlot) qs.set("slot", prefillSlot);
    // Lock is already set. Booking flow will re-derive provider server-side.
    navigate(`/book?${qs.toString()}`);
  }

  function requestNotification() {
    setNotifyRequested(true);
    toast.success("Vi giver besked, når der åbner en ny tid.");
  }

  function confirmSeeAlternatives() {
    clearProviderLock();
    setShowAltDialog(false);
    navigate("/find-cleaner");
  }


  if (profile === undefined) {
    return <main className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></main>;
  }
  if (profile === null) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-serif">Provider ikke fundet</h1>
          <p className="mt-2 text-muted-foreground">Profilen findes ikke, eller er ikke offentlig.</p>
          <Button asChild className="mt-4"><Link to="/marketplace">Tilbage til marketplace</Link></Button>
        </div>
      </main>
    );
  }

  // Group slots by day for a compact 14-day view.
  const slotsByDay = new Map<string, number[]>();
  (slots ?? []).forEach((s) => {
    const arr = slotsByDay.get(s.slot_date) ?? [];
    arr.push(s.slot_hour);
    slotsByDay.set(s.slot_date, arr);
  });

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4"><BackButton /></div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Card className="overflow-hidden">
              <div className="relative aspect-[16/9] bg-gradient-to-br from-primary/20 to-accent/20">
                {profile.avatar_url && <img src={profile.avatar_url} alt={profile.display_name} className="h-full w-full object-cover" />}
                <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                  {profile.identity_verified_badge && <Badge className="bg-green-600 text-white">Verificeret</Badge>}
                  {profile.insurance_valid && <Badge className="bg-blue-600 text-white inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Forsikret</Badge>}
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
                  {profile.country_code && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-4 w-4" />{profile.country_code} · dækker {profile.service_radius_km ?? 10} km
                    </span>
                  )}
                  {profile.avg_response_minutes !== null && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-4 w-4" />Svarer typisk inden for {profile.avg_response_minutes} min
                    </span>
                  )}
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

            {/* Bookable availability — only free slots, never other bookings or blocked events. */}
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-serif text-xl">Ledige tider</h2>
                {slots === null && <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Henter ledige tider…</div>}

                {/* No-slot fallback: next-slot suggestion + request time + notify placeholder + alternatives (secondary) */}
                {slots !== null && slotsByDay.size === 0 && (
                  <div className="space-y-4" data-testid="no-slot-fallback">
                    <p className="text-sm text-muted-foreground">
                      {profile.display_name} har ingen ledige tider de næste 14 dage.
                    </p>

                    {nextSlot && (
                      <div className="rounded-lg border p-3">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Næste ledige tid</div>
                        <div className="mt-1 text-base font-medium">
                          {new Date(nextSlot.slot_date).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" })}
                          {" kl. "}
                          {String(nextSlot.slot_hour).padStart(2, "0")}:00
                        </div>
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() => bookDirect(nextSlot.slot_date, `${String(nextSlot.slot_hour).padStart(2, "0")}:00`)}
                        >
                          <CalendarCheck className="mr-2 h-4 w-4" />Book denne tid
                        </Button>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => bookDirect()}>
                        <CalendarPlus className="mr-2 h-4 w-4" />Anmod om en anden tid
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={requestNotification}
                        disabled={notifyRequested}
                      >
                        <BellRing className="mr-2 h-4 w-4" />
                        {notifyRequested ? "Vi giver besked" : "Giv besked ved ny tid"}
                      </Button>
                    </div>

                    <div className="border-t pt-3">
                      <button
                        type="button"
                        onClick={() => setShowAltDialog(true)}
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        <Search className="mr-1 inline h-3 w-3" />
                        Se andre cleaners i stedet
                      </button>
                    </div>
                  </div>
                )}

                {slotsByDay.size > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from(slotsByDay.entries()).slice(0, 6).map(([day, hours]) => (
                      <div key={day} className="rounded-lg border p-3">
                        <div className="mb-2 text-sm font-medium">
                          {new Date(day).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" })}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {hours.slice(0, 6).map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => bookDirect(day, `${String(h).padStart(2, "0")}:00`)}
                              className="rounded-md border px-2 py-1 text-xs hover:bg-primary hover:text-primary-foreground transition"
                            >
                              {String(h).padStart(2, "0")}:00
                            </button>
                          ))}
                          {hours.length > 6 && <span className="text-xs text-muted-foreground self-center">+{hours.length - 6}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground">Timepris fra</div>
                <div className="text-3xl font-serif">{profile.price_from ? `${profile.price_from} kr` : "—"}</div>
                <Button className="mt-4 w-full" size="lg" onClick={() => bookDirect()}>
                  <CalendarCheck className="mr-2 h-4 w-4" />Book denne cleaner
                </Button>
                <Button variant="outline" className="mt-2 w-full" onClick={toggleFav}>
                  <Heart className={`mr-2 h-4 w-4 ${isFav ? "fill-red-500 text-red-500" : ""}`} />
                  {isFav ? "Fjern favorit" : "Gem som favorit"}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowAltDialog(true)}
                  className="mt-3 w-full text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  data-testid="see-alternatives-btn"
                >
                  Se andre cleaners
                </button>
                <p className="mt-3 text-xs text-muted-foreground">
                  Sikker betaling gennem MyCleaner. Ingen adresser, telefonnumre eller e-mails deles udenfor platformen.
                </p>
              </CardContent>
            </Card>



            {/* Only show numbers we can prove. Ratings hidden until backed by real reviews. */}
            <Card>
              <CardContent className="p-6 text-sm">
                <h3 className="mb-2 font-medium">Om denne cleaner</h3>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Bookinger gennemført</dt>
                    <dd>{profile.completed_bookings > 0 ? profile.completed_bookings : "—"}</dd>
                  </div>
                  {profile.years_experience != null && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Års erfaring (selvangivet)</dt>
                      <dd>{profile.years_experience}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Identitet verificeret</dt>
                    <dd>{profile.identity_verified_badge ? "Ja" : "Nej"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Forsikring</dt>
                    <dd>{profile.insurance_valid ? "Aktiv" : "—"}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      <AlertDialog open={showAltDialog} onOpenChange={setShowAltDialog}>
        <AlertDialogContent data-testid="see-alternatives-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Skift til andre cleaners?</AlertDialogTitle>
            <AlertDialogDescription>
              Du er ved at booke <strong>{profile.display_name}</strong>. Vil du se andre cleaners i stedet?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bliv hos {profile.display_name.split(" ")[0]}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSeeAlternatives} data-testid="see-alternatives-confirm">
              Ja, vis andre cleaners
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

