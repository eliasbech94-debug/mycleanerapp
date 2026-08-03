/**
 * Find Cleaner — Airbnb-style split search.
 *
 * PRIVACY CONTRACT
 * ----------------
 * The map never receives a provider's exact residential coordinates. The
 * server RPC `search_providers_public_geo_v1` returns anonymised area points
 * (coarse grid + deterministic per-provider offset) plus a public area label
 * (city/district). This page renders exactly what the server returns and
 * cannot zoom tighter than the anonymisation grid.
 *
 * The only precise point on the map is the CUSTOMER's chosen cleaning location.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { List, Loader2, Map as MapIcon, RotateCw, SlidersHorizontal, Star, X } from "lucide-react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { ProviderMap } from "@/components/findcleaner/ProviderMap";
import { ProviderResultCard } from "@/components/findcleaner/ProviderResultCard";
import { ProviderMapPreview } from "@/components/findcleaner/ProviderMapPreview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarketSeo } from "@/components/seo/MarketSeo";
import { useLocation } from "@/context/LocationContext";
import { serviceCategories } from "@/lib/countries";
import { DEFAULT_FILTERS, useProviderGeoSearch } from "@/hooks/useProviderGeoSearch";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import type { JobLocation } from "@/lib/providerSearch";
import { useProviderLiveStatuses } from "@/hooks/useProviderLiveStatus";


// Deterministic marketplace attributes (until the DB carries them).
// Same provider id always resolves to the same flags across renders/sessions.
const hashSeed = (s: string) => s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
export const isAvailableToday = (id: string) => hashSeed(id) % 3 !== 0; // ~66% available
export const isInstantBook = (id: string) => hashSeed(id) % 2 === 0; // ~50% instant
export const yearsExperience = (id: string) => 2 + (hashSeed(id) % 12); // 2-13 yrs

const RADIUS_STEPS = [5, 10, 15, 25, 50];
const LANGUAGES = ["Dansk", "English", "Deutsch", "Svenska", "Español"];

export default function FindCleaner() {
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const { location: userLocation } = useLocation();
  // Active markets are SERVER-DRIVEN (public.market_launch_status).
  const { activeCodes, comingSoonCodes } = useMarketStatus();
  // Markets painted on the Europe showcase map: every market the server knows
  // about (live + launching), never a second hardcoded list.
  const marketCodes = useMemo(
    () => Array.from(new Set([...activeCodes, ...comingSoonCodes])),
    [activeCodes, comingSoonCodes],
  );

  // Address lookup is allowed anywhere MyCleaner operates, with the visitor's
  // own market first so it ranks highest. Same server-driven source as above.
  const searchCountries = useMemo(() => {
    const own = (userLocation?.countryCode ?? "").toLowerCase();
    const rest = marketCodes.map((c) => c.toLowerCase()).filter((c) => c !== own);
    return (own ? [own, ...rest] : rest.length ? rest : ["dk"]);
  }, [userLocation?.countryCode, marketCodes]);



  const initialJob = useMemo<JobLocation | null>(() => {
    if (userLocation?.lat != null && userLocation?.lng != null) {
      return { lat: userLocation.lat, lng: userLocation.lng, label: userLocation.city ?? undefined };
    }
    return null;
  }, [userLocation?.lat, userLocation?.lng, userLocation?.city]);

  const s = useProviderGeoSearch(initialJob, marketCodes);
  const [address, setAddress] = useState(userLocation?.city ?? "");
  const [filterOpen, setFilterOpen] = useState(false);
  // Tracks whether the text in the search box is a server-validated place, so
  // the field stops showing the "pick from the list" hint after a valid pick.
  const [addressValid, setAddressValid] = useState(false);
  const [mapCenter, setMapCenter] = useState<JobLocation | null>(initialJob);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Adopt the resolved user location once it arrives.
  useEffect(() => {
    if (!s.job && initialJob) s.setJob(initialJob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJob]);

  // Keep the selected card visible in the list when the map drives selection.
  useEffect(() => {
    if (!s.selectedId) return;
    cardRefs.current.get(s.selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [s.selectedId]);

  const handleAddressSelect = useCallback(
    (place: { address: string; lat?: number; lng?: number }) => {
      setAddress(place.address);
      setAddressValid(place.lat != null && place.lng != null);
      if (place.lat != null && place.lng != null) {
        s.setSelectedId(null);
        s.setJob({ lat: place.lat, lng: place.lng, label: place.address });
        s.setView("list");
      }
    },
    [s],
  );

  const openProfile = useCallback(
    (slug: string | null, userId: string) => {
      const handle = slug ?? userId;
      navigate(`/p/${handle}?src=marketplace_pick`);
    },
    [navigate],
  );

  const activeFilterCount =
    (s.filters.minRating > 0 ? 1 : 0) +
    (s.filters.maxHourly !== null ? 1 : 0) +
    (s.filters.serviceCategory ? 1 : 0) +
    (s.filters.language ? 1 : 0) +
    (s.filters.availableTodayOnly ? 1 : 0) +
    (s.filters.verifiedOnly ? 1 : 0);

  const serviceOptions = useMemo(
    () => serviceCategories.find((c) => c.id === "cleaning")?.subcategories ?? [],
    [],
  );

  // One batched live-status lookup for the visible result list.
  const visibleIds = useMemo(() => s.visible.map((p) => p.userId), [s.visible]);
  const { get: getStatus } = useProviderLiveStatuses({ userIds: visibleIds });

  const resultsLabel = s.isShowcase
    ? "MyCleaner i Europa"
    : s.loading
    ? "Søger…"
    : `${s.visible.length} ${s.visible.length === 1 ? "cleaner" : "cleaners"} i området`;

  return (
    <>
      <MarketSeo
        titleKey="seo.findCleaner.title"
        descriptionKey="seo.findCleaner.description"
      />
      <div className="flex h-[calc(100dvh-4rem)] flex-col">
        {/* ---- Search bar -------------------------------------------------- */}
        <div className="z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
            <div className="min-w-[240px] flex-1">
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                onSelect={handleAddressSelect}
                placeholder="Hvor skal der gøres rent?"
                scope="broad"
                isValid={addressValid}
                onValidityChange={setAddressValid}
                countries={searchCountries}
              />

            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="radius" className="text-xs text-muted-foreground">
                Radius
              </label>
              <Select
                value={String(s.radiusKm)}
                onValueChange={(v) => {
                  s.setSelectedId(null);
                  s.setRadiusKm(Number(v));
                }}
              >
                <SelectTrigger id="radius" className="w-[110px]" data-testid="radius-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RADIUS_STEPS.map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r} km
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={() => setFilterOpen(true)}
              data-testid="open-filters"
              className="gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filtre
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>

            {/* Mobile list/map switch */}
            <div className="ml-auto lg:hidden">
              <Button
                variant="secondary"
                size="sm"
                className="gap-2"
                data-testid="toggle-view"
                onClick={() => s.setView(s.view === "list" ? "map" : "list")}
              >
                {s.view === "list" ? (
                  <>
                    <MapIcon className="h-4 w-4" aria-hidden="true" /> Kort
                  </>
                ) : (
                  <>
                    <List className="h-4 w-4" aria-hidden="true" /> Liste
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* ---- Split view --------------------------------------------------- */}
        <div className="flex min-h-0 flex-1">
          {/* List */}
          <aside
            data-testid="results-list"
            className={`min-h-0 w-full overflow-y-auto border-r border-border lg:block lg:w-[46%] xl:w-[42%] ${
              s.view === "map" ? "hidden" : "block"
            }`}
          >
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h1 className="text-sm font-semibold" aria-live="polite">
                  {resultsLabel}
                </h1>
                {s.loading && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                )}
              </div>

              {s.isShowcase && (
                <div className="rounded-2xl border border-border bg-muted/40 p-6 text-center">
                  <p className="text-2xl" aria-hidden="true">🌍</p>
                  <h2 className="mt-2 text-base font-semibold">
                    Find betroede cleaners i hele Europa
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Indtast din adresse og find med det samme betroede cleaners tæt på dig.
                  </p>
                  {s.showcase.length > 0 && (
                    <p className="mt-3 text-xs font-medium text-muted-foreground">
                      {s.showcase.length}+ cleaners på kortet i {marketCodes.length} lande
                    </p>
                  )}
                </div>
              )}

              {s.error && (
                <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
                  Søgningen fejlede.{" "}
                  <button className="underline" onClick={() => void s.refresh()} type="button">
                    Prøv igen
                  </button>
                </p>
              )}

              {s.job && !s.loading && s.visible.length === 0 && !s.error && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Ingen cleaners dækker dette område endnu. Prøv en større radius.
                </p>
              )}

              {s.visible.map((p) => (
                <ProviderResultCard
                  key={p.userId}
                  ref={(el) => {
                    if (el) cardRefs.current.set(p.userId, el);
                    else cardRefs.current.delete(p.userId);
                  }}
                  provider={p}
                  liveStatus={getStatus(p.userId)}
                  selected={s.selectedId === p.userId}
                  hovered={s.hoverId === p.userId}
                  onHover={(h) => s.setHoverId(h ? p.userId : null)}
                  onSelect={() => s.setSelectedId(s.selectedId === p.userId ? null : p.userId)}
                />
              ))}
            </div>
          </aside>

          {/* Map */}
          <div
            data-testid="map-pane"
            className={`relative min-h-0 flex-1 lg:block ${s.view === "map" ? "block" : "hidden"}`}
          >
            <ProviderMap
              job={s.job}
              radiusKm={s.radiusKm}
              providers={s.mapProviders}
              activeMarkets={marketCodes}
              showcase={s.isShowcase}
              selectedId={s.selectedId}
              hoverId={s.hoverId}

              onSelect={(id) => s.setSelectedId(id)}
              onHover={s.setHoverId}
              onJobChange={(j) => {
                s.setSelectedId(null);
                // Keep the address field untouched: a map pin is a coordinate,
                // not a validated address.
                s.setJob(j);
              }}
              onMapMoved={(center) => {
                setMapCenter(center);
                s.notifyMapMoved();
              }}
            />

            {s.isShowcase && !s.selected && (
              <div
                data-testid="map-showcase-overlay"
                className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4"
              >
                <div className="animate-fade-in max-w-md rounded-2xl border border-border bg-background/85 px-5 py-4 text-center shadow-xl backdrop-blur-md">
                  <p className="text-sm font-semibold">
                    <span aria-hidden="true">🌍</span> Find betroede cleaners i hele Europa
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Indtast din adresse og find med det samme betroede cleaners tæt på dig.
                  </p>
                </div>
              </div>
            )}

            {s.mapMoved && !s.isShowcase && (
              <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
                <Button
                  data-testid="search-this-area"
                  className="pointer-events-auto gap-2 rounded-full shadow-lg"
                  onClick={() => mapCenter && s.searchThisArea(mapCenter)}
                >
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                  Søg i dette område
                </Button>
              </div>
            )}

            {s.selected && (
              <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
                <ProviderMapPreview
                  provider={s.selected}
                  nextAvailable={
                    isAvailableToday(s.selected.userId) ? "Ledig i dag" : "Ledig denne uge"
                  }
                  onClose={() => s.setSelectedId(null)}
                  onViewProfile={() => openProfile(s.selected!.slug, s.selected!.userId)}
                  onRequestBooking={() => openProfile(s.selected!.slug, s.selected!.userId)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Filters -------------------------------------------------------- */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Filtre</SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto py-4">
            <div>
              <p className="mb-2 text-sm font-medium">Minimum bedømmelse</p>
              <div className="flex gap-2">
                {[0, 4, 4.5, 4.8].map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant={s.filters.minRating === r ? "default" : "outline"}
                    onClick={() => s.setFilters((f) => ({ ...f, minRating: r }))}
                    className="gap-1"
                  >
                    {r === 0 ? "Alle" : <>
                      <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                      {r}+
                    </>}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">
                Maks. timepris {s.filters.maxHourly ? `${s.filters.maxHourly}` : "— alle"}
              </p>
              <Slider
                value={[s.filters.maxHourly ?? 600]}
                min={150}
                max={600}
                step={25}
                onValueChange={([v]) =>
                  s.setFilters((f) => ({ ...f, maxHourly: v >= 600 ? null : v }))
                }
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Ydelse</p>
              <Select
                value={s.filters.serviceCategory ?? "all"}
                onValueChange={(v) =>
                  s.setFilters((f) => ({ ...f, serviceCategory: v === "all" ? null : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle ydelser</SelectItem>
                  {serviceOptions.map((sub) => (
                    <SelectItem key={sub} value={sub}>
                      {sub}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Sprog</p>
              <Select
                value={s.filters.language ?? "all"}
                onValueChange={(v) =>
                  s.setFilters((f) => ({ ...f, language: v === "all" ? null : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle sprog</SelectItem>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={s.filters.verifiedOnly}
                onCheckedChange={(c) => s.setFilters((f) => ({ ...f, verifiedOnly: c === true }))}
              />
              Kun verificerede cleaners
            </label>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={s.filters.availableTodayOnly}
                onCheckedChange={(c) =>
                  s.setFilters((f) => ({ ...f, availableTodayOnly: c === true }))
                }
              />
              Ledig i dag
            </label>
          </div>

          <SheetFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => s.setFilters(DEFAULT_FILTERS)} className="gap-1">
              <X className="h-4 w-4" aria-hidden="true" /> Nulstil
            </Button>
            <Button onClick={() => setFilterOpen(false)}>Vis {s.visible.length} resultater</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
