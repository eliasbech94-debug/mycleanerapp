import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Search, X, ChevronUp, Loader2, SlidersHorizontal, Zap, CalendarCheck } from "lucide-react";
import { formatPrice, countries, serviceCategories } from "@/lib/countries";
import { getProvider, getCountry, deriveHourlyRate } from "@/lib/providers";
import type { ProviderProfileData } from "@/lib/providers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarketSeo } from "@/components/seo/MarketSeo";

// Deterministic marketplace attributes (until the DB carries them).
// Same provider id always resolves to the same flags across renders/sessions.
const hashSeed = (s: string) => s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
export const isAvailableToday = (id: string) => hashSeed(id) % 3 !== 0;      // ~66% available
export const isInstantBook = (id: string) => hashSeed(id) % 2 === 0;         // ~50% instant
export const yearsExperience = (id: string) => 2 + (hashSeed(id) % 12);      // 2-13 yrs

type MapProvider = {
  id: string;
  profileId: string;
  slug: string | null;
  name: string;
  providerId: string;
  lat: number;
  lng: number;
  address: string | null;
  countryCode: string;
  avatar: string | null;
  rating: number;
  reviews: number;
  verified: boolean;
  topRated: boolean;
  tagline: string;
  hourlyRate: number;
  currency: string;
};


const DEFAULT_CENTER = { lat: 55.6761, lng: 12.5683 }; // Copenhagen
const DEFAULT_ZOOM = 11;
const COVERAGE_RADIUS_M = 2200; // ~2.2km coverage area shown instead of exact location
// Brand colors (MyCleaner)
const BRAND_TEAL = "#168a7a";
const BRAND_ORANGE = "#ff6b35";

// Deterministically obfuscate exact address: snap to ~1km grid + tiny per-provider offset
function obfuscate(lat: number, lng: number, seed: string) {
  const grid = 0.01; // ~1.1 km latitude
  const s = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const jitLat = ((s % 7) - 3) * 0.0009;
  const jitLng = (((s * 13) % 7) - 3) * 0.0009;
  return {
    lat: Math.round(lat / grid) * grid + jitLat,
    lng: Math.round(lng / grid) * grid + jitLng,
  };
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function pinSvg(initials: string, isSelected: boolean) {
  const size = isSelected ? 52 : 44;
  const circle = size * 0.38;
  const cx = size / 2;
  const cy = size * 0.42;
  const color = BRAND_TEAL;
  const textColor = "white";
  const fontSize = isSelected ? 16 : 14;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <filter id="s" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.25)"/>
        </filter>
      </defs>
      <path d="M${cx},${size} L${cx - 8},${cy + circle * 0.6} A${circle},${circle} 0 1,1 ${cx + 8},${cy + circle * 0.6} Z" fill="${color}" filter="url(#s)"/>
      <circle cx="${cx}" cy="${cy}" r="${circle - 2}" fill="${textColor}" fill-opacity="0.15"/>
      <text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="middle" fill="${textColor}" font-family="Space Grotesk, sans-serif" font-size="${fontSize}" font-weight="700">${initials}</text>
    </svg>`
  )}`;
}

function createMarker(
  google: typeof window.google,
  provider: MapProvider,
  isSelected: boolean,
  onClick: () => void,
): google.maps.Marker {
  const marker = new google.maps.Marker({
    position: { lat: provider.lat, lng: provider.lng },
    icon: {
      url: pinSvg(getInitials(provider.name), isSelected),
      scaledSize: new google.maps.Size(isSelected ? 52 : 44, isSelected ? 52 : 44),
      anchor: new google.maps.Point(isSelected ? 26 : 22, isSelected ? 50 : 42),
    },
    animation: isSelected ? google.maps.Animation.BOUNCE : null,
  });
  marker.addListener("click", onClick);
  return marker;
}
// Padding used when framing a coverage area on screen. Header + drawer take vertical space.
const FIT_PADDING = { top: 140, right: 40, bottom: 240, left: 40 } as const;

// Smooth fit: pan to the target center, then step zoom toward the level fitBounds would use.
function smoothFitBounds(
  map: google.maps.Map,
  bounds: google.maps.LatLngBounds,
  padding: google.maps.Padding = FIT_PADDING,
) {
  const currentZoom = map.getZoom() ?? DEFAULT_ZOOM;
  // Trick: fitBounds sets the target zoom instantly — read it, then restore and animate.
  map.fitBounds(bounds, padding);
  const targetZoom = map.getZoom() ?? currentZoom;
  map.setZoom(currentZoom);
  map.panTo(bounds.getCenter());

  const diff = targetZoom - currentZoom;
  if (Math.abs(diff) < 0.01) return;
  const step = diff > 0 ? 1 : -1;
  const steps = Math.min(6, Math.abs(Math.round(diff)));
  let i = 0;
  const tick = () => {
    i += 1;
    if (i > steps) return;
    map.setZoom(currentZoom + step * i);
    if (i < steps) window.setTimeout(tick, 90);
  };
  window.setTimeout(tick, 120);
}


export default function FindCleaner() {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const googleRef = useRef<typeof window.google | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const hoverCircleRef = useRef<google.maps.Circle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<MapProvider[]>([]);
  const [visibleProviders, setVisibleProviders] = useState<MapProvider[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchAreaVisible, setSearchAreaVisible] = useState(false);
  const [lastSearchBounds, setLastSearchBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [mapMoved, setMapMoved] = useState(false);
  // Empty set = show all countries. Otherwise providers must match at least one selected code.
  const [countryFilter, setCountryFilter] = useState<Set<string>>(() => new Set());

  // Marketplace filters
  const [minRating, setMinRating] = useState(0);           // 0 = any
  const [maxHourly, setMaxHourly] = useState<number | null>(null); // in local currency; null = any
  const [minExperience, setMinExperience] = useState(0);   // years
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [availableTodayOnly, setAvailableTodayOnly] = useState(false);
  const [instantBookOnly, setInstantBookOnly] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const languageOptions = useMemo(() => {
    const set = new Set<string>();
    providers.forEach((p) => {
      const seed = getProvider(p.providerId);
      seed?.languages.forEach((l) => set.add(l));
    });
    if (set.size === 0) ["Dansk", "English", "Deutsch", "Svenska", "Español"].forEach((l) => set.add(l));
    return Array.from(set).sort();
  }, [providers]);

  const serviceOptions = useMemo(() => {
    return serviceCategories.find((c) => c.id === "cleaning")?.subcategories ?? [];
  }, []);

  const filteredProviders = useMemo(() => {
    return providers.filter((p) => {
      if (countryFilter.size > 0 && !countryFilter.has(p.countryCode)) return false;
      if (minRating > 0 && p.rating < minRating) return false;
      if (maxHourly !== null && p.hourlyRate > maxHourly) return false;
      if (minExperience > 0 && yearsExperience(p.id) < minExperience) return false;
      if (availableTodayOnly && !isAvailableToday(p.id)) return false;
      if (instantBookOnly && !isInstantBook(p.id)) return false;
      const seed = getProvider(p.providerId);
      if (selectedLanguages.size > 0) {
        const langs = seed?.languages ?? [];
        if (!langs.some((l) => selectedLanguages.has(l))) return false;
      }
      if (selectedServices.size > 0) {
        const subs = seed?.subcategories ?? [];
        if (!subs.some((s) => selectedServices.has(s))) return false;
      }
      return true;
    });
  }, [
    providers, countryFilter, minRating, maxHourly, minExperience,
    availableTodayOnly, instantBookOnly, selectedLanguages, selectedServices,
  ]);

  const activeFilterCount =
    (minRating > 0 ? 1 : 0) +
    (maxHourly !== null ? 1 : 0) +
    (minExperience > 0 ? 1 : 0) +
    (availableTodayOnly ? 1 : 0) +
    (instantBookOnly ? 1 : 0) +
    selectedLanguages.size +
    selectedServices.size;

  const clearAllFilters = () => {
    setMinRating(0);
    setMaxHourly(null);
    setMinExperience(0);
    setSelectedLanguages(new Set());
    setSelectedServices(new Set());
    setAvailableTodayOnly(false);
    setInstantBookOnly(false);
  };


  const availableCountries = useMemo(() => {
    const codes = new Set(providers.map((p) => p.countryCode));
    return countries.filter((c) => codes.has(c.code));
  }, [providers]);

  const toggleCountry = useCallback((code: string) => {
    setSelectedId(null);
    setCountryFilter((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const fetchProviders = useCallback(async (bounds?: google.maps.LatLngBounds) => {
    setLoading(true);
    setError(null);
    try {
      let dbProviders: MapProvider[] = [];

      if (bounds) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const { data, error: rpcError } = await supabase.rpc("get_providers_in_bounds", {
          sw_lat: sw.lat(),
          sw_lng: sw.lng(),
          ne_lat: ne.lat(),
          ne_lng: ne.lng(),
        });

        if (rpcError) throw rpcError;

        dbProviders = (data || [])
          .filter((p: any) => p.provider_id && p.lat && p.lng)
          .map((p: any) => {
            const seed = getProvider(p.provider_id);
            const country = getCountry(p.country_code || "DK");
            const obf = obfuscate(Number(p.lat), Number(p.lng), p.provider_id);
            return {
              id: p.provider_id,
              profileId: p.id,
              slug: (p as { provider_slug?: string | null }).provider_slug ?? null,
              name: p.full_name || seed?.name || "Cleaner",
              providerId: p.provider_id,
              lat: obf.lat,
              lng: obf.lng,
              address: p.address || seed?.city || null,
              countryCode: p.country_code || seed?.countryCode || "DK",
              avatar: seed?.avatar || null,
              rating: seed?.rating || 4.8,
              reviews: seed?.reviews || 0,
              verified: seed?.verified ?? true,
              topRated: seed?.topRated ?? false,
              tagline: seed?.tagline || "Professionel rengøring",
              hourlyRate: seed?.hourlyRate ?? deriveHourlyRate(country),
              currency: country.currency,
            };
          });

      }

      if (dbProviders.length > 0) {
        setProviders(dbProviders);
        return;
      }

      // Demo fallback: seed providers placed around Copenhagen
      const demoCoordinates: Record<string, { lat: number; lng: number }> = {
        p_001: { lat: 55.6761, lng: 12.5683 },
        p_002: { lat: 55.703, lng: 12.55 },
        p_003: { lat: 55.66, lng: 12.59 },
        p_004: { lat: 55.72, lng: 12.57 },
      };

      const fallback: MapProvider[] = ["p_001", "p_002", "p_003", "p_004"]
        .map((pid) => {
          const seed = getProvider(pid);
          if (!seed) return null;
          const coords = demoCoordinates[pid];
          const country = getCountry(seed.countryCode);
          return {
            id: seed.id,
            profileId: "",
            slug: null,
            name: seed.name,
            providerId: seed.id,
            lat: obfuscate(coords.lat, coords.lng, seed.id).lat,
            lng: obfuscate(coords.lat, coords.lng, seed.id).lng,
            address: seed.city,
            countryCode: seed.countryCode,
            avatar: seed.avatar,
            rating: seed.rating,
            reviews: seed.reviews,
            verified: seed.verified,
            topRated: seed.topRated,
            tagline: seed.tagline,
            hourlyRate: seed.hourlyRate ?? deriveHourlyRate(country),
            currency: country.currency,
          };
        })

        .filter((p): p is MapProvider => p !== null);

      setProviders(fallback);
    } catch (err: any) {
      setError(err.message || "Kunne ikke hente providere");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: fetch without bounds so the page works even before map is ready.
  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const updateVisibleProviders = useCallback(() => {
    const map = mapInstance.current;
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const visible = filteredProviders.filter((p) => bounds.contains(new google.maps.LatLng(p.lat, p.lng)));
    setVisibleProviders(visible);

    if (lastSearchBounds && !bounds.equals(lastSearchBounds)) {
      setSearchAreaVisible(true);
    } else {
      setSearchAreaVisible(false);
    }
  }, [filteredProviders, lastSearchBounds]);

  useEffect(() => {
    if (!mapRef.current || providers.length === 0) return;

    let cleanup = () => {};

    loadGoogleMaps()
      .then((google) => {
        googleRef.current = google;
        const map = new google.maps.Map(mapRef.current!, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
        });
        mapInstance.current = map;

        const idleListener = map.addListener("idle", () => {
          updateVisibleProviders();
        });

        const dragStartListener = map.addListener("dragstart", () => {
          setMapMoved(true);
        });

        const zoomChangedListener = map.addListener("zoom_changed", () => {
          setMapMoved(true);
        });

        const bounds = map.getBounds();
        if (bounds) {
          setLastSearchBounds(bounds);
          fetchProviders(bounds);
        }

        cleanup = () => {
          google.maps.event.removeListener(idleListener);
          google.maps.event.removeListener(dragStartListener);
          google.maps.event.removeListener(zoomChangedListener);
        };
      })
      .catch((err) => {
        setError(err.message || "Kunne ikke indlæse kortet");
        setLoading(false);
      });

    return () => {
      cleanup();
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      circlesRef.current.forEach((c) => c.setMap(null));
      circlesRef.current = [];
      mapInstance.current = null;
    };
  }, [providers.length, updateVisibleProviders, fetchProviders]);

  useEffect(() => {
    if (!mapInstance.current || !googleRef.current) return;
    const google = googleRef.current;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    circlesRef.current.forEach((c) => c.setMap(null));
    circlesRef.current = [];

    // Shared hover UI: one InfoWindow + one preview circle re-used across markers.
    if (!infoWindowRef.current) {
      infoWindowRef.current = new google.maps.InfoWindow({ disableAutoPan: true });
    }
    const closeHover = () => {
      infoWindowRef.current?.close();
      hoverCircleRef.current?.setMap(null);
      hoverCircleRef.current = null;
    };

    filteredProviders.forEach((provider) => {
      const isSelected = selectedId === provider.id;

      // Only render the full coverage area for the currently selected provider.
      if (isSelected) {
        const circle = new google.maps.Circle({
          strokeColor: BRAND_ORANGE,
          strokeOpacity: 0.9,
          strokeWeight: 2.5,
          fillColor: BRAND_ORANGE,
          fillOpacity: 0.18,
          map: mapInstance.current!,
          center: { lat: provider.lat, lng: provider.lng },
          radius: COVERAGE_RADIUS_M,
          clickable: false,
        });
        circlesRef.current.push(circle);
        const bounds = circle.getBounds();
        if (bounds) {
          smoothFitBounds(mapInstance.current!, bounds);
        }
      }

      const marker = createMarker(google, provider, isSelected, () => {
        closeHover();
        setSelectedId(provider.id);
        setDrawerOpen(true);
        mapInstance.current?.panTo({ lat: provider.lat, lng: provider.lng });
      });
      // Native browser tooltip (a11y + fast).
      marker.setTitle(`${provider.name} — dækker ~${Math.round(COVERAGE_RADIUS_M / 1000)} km omkring ${provider.address || getCountry(provider.countryCode).name}`);

      // Rich hover tooltip with a preview of the coverage area.
      const country = getCountry(provider.countryCode);
      const html = `
        <div style="font-family: 'Fira Sans', system-ui, sans-serif; min-width: 180px; padding: 2px 4px;">
          <div style="display:flex; align-items:center; gap:6px; font-weight:600; font-size:13px; color:#0a3d3a;">
            <span>${country.flag}</span>
            <span>${provider.name.replace(/</g, "&lt;")}</span>
          </div>
          <div style="margin-top:2px; font-size:11px; color:#4b5563;">
            ${provider.address ? provider.address.replace(/</g, "&lt;") + " · " : ""}${country.name}
          </div>
          <div style="margin-top:6px; display:flex; align-items:center; gap:6px; font-size:11px; color:#168a7a; font-weight:600;">
            <span style="display:inline-block; width:10px; height:10px; border-radius:9999px; background:#168a7a; opacity:0.35;"></span>
            Dækker ~${Math.round(COVERAGE_RADIUS_M / 1000)} km serviceområde
          </div>
          <div style="margin-top:4px; font-size:10px; color:#6b7280;">Klik for at åbne profil</div>
        </div>`;

      marker.addListener("mouseover", () => {
        if (isSelected) return; // Selected already shows the full circle + card.
        infoWindowRef.current?.setContent(html);
        infoWindowRef.current?.open({ map: mapInstance.current!, anchor: marker });
        hoverCircleRef.current?.setMap(null);
        hoverCircleRef.current = new google.maps.Circle({
          strokeColor: BRAND_TEAL,
          strokeOpacity: 0.7,
          strokeWeight: 1.5,
          fillColor: BRAND_TEAL,
          fillOpacity: 0.1,
          map: mapInstance.current!,
          center: { lat: provider.lat, lng: provider.lng },
          radius: COVERAGE_RADIUS_M,
          clickable: false,
        });
      });
      marker.addListener("mouseout", closeHover);

      marker.setMap(mapInstance.current);
      markersRef.current.push(marker);
    });

    updateVisibleProviders();

    return () => {
      closeHover();
    };
  }, [filteredProviders, selectedId, updateVisibleProviders]);

  // When filter changes and no provider is selected, fit map to filtered providers.
  useEffect(() => {
    const map = mapInstance.current;
    const google = googleRef.current;
    if (!map || !google || filteredProviders.length === 0) return;
    if (selectedId && filteredProviders.some((p) => p.id === selectedId)) return;
    const bounds = new google.maps.LatLngBounds();
    filteredProviders.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    smoothFitBounds(map, bounds);
  }, [countryFilter, filteredProviders, selectedId]);


  const handleSearchThisArea = useCallback(() => {
    const bounds = mapInstance.current?.getBounds();
    if (bounds) {
      setLastSearchBounds(bounds);
      setSearchAreaVisible(false);
      setMapMoved(false);
      fetchProviders(bounds);
    }
  }, [fetchProviders]);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedId) || visibleProviders[0],
    [providers, selectedId, visibleProviders],
  );

  return (
    <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden bg-muted">
      <MarketSeo titleKey="seo.findCleaner.title" descriptionKey="seo.findCleaner.description" />
      {/* Header overlay */}

      <div className="absolute left-0 right-0 top-0 z-20 flex flex-col gap-2 bg-background/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground font-heading text-lg font-bold">
              M
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Find din cleaner</h1>
              <p className="text-[10px] text-muted-foreground">
                {filteredProviders.length} providere
                {countryFilter.size > 0 &&
                  ` i ${Array.from(countryFilter)
                    .map((c) => getCountry(c).name)
                    .join(", ")}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs relative">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtre
                  {activeFilterCount > 0 && (
                    <span className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 font-bold leading-none">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filtrér cleaners</SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-6 pb-6">
                  {/* Quick toggles */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAvailableTodayOnly((v) => !v)}
                      aria-pressed={availableTodayOnly}
                      className={`rounded-xl border p-3 text-left transition ${
                        availableTodayOnly ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                      }`}
                    >
                      <CalendarCheck className="h-4 w-4 mb-1 text-primary" />
                      <div className="text-xs font-semibold">Ledig i dag</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInstantBookOnly((v) => !v)}
                      aria-pressed={instantBookOnly}
                      className={`rounded-xl border p-3 text-left transition ${
                        instantBookOnly ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                      }`}
                    >
                      <Zap className="h-4 w-4 mb-1 text-primary" />
                      <div className="text-xs font-semibold">Instant Book</div>
                    </button>
                  </div>

                  {/* Rating */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-semibold">Min. rating</label>
                      <span className="text-xs text-muted-foreground">
                        {minRating > 0 ? `${minRating.toFixed(1)}★+` : "Alle"}
                      </span>
                    </div>
                    <Slider
                      value={[minRating]}
                      onValueChange={([v]) => setMinRating(v)}
                      min={0}
                      max={5}
                      step={0.5}
                    />
                  </div>

                  {/* Max hourly */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-semibold">Maks. timepris</label>
                      <span className="text-xs text-muted-foreground">
                        {maxHourly !== null ? `${maxHourly} kr/t` : "Alle"}
                      </span>
                    </div>
                    <Slider
                      value={[maxHourly ?? 800]}
                      onValueChange={([v]) => setMaxHourly(v >= 800 ? null : v)}
                      min={150}
                      max={800}
                      step={25}
                    />
                  </div>

                  {/* Experience */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-semibold">Min. års erfaring</label>
                      <span className="text-xs text-muted-foreground">
                        {minExperience > 0 ? `${minExperience}+ år` : "Alle"}
                      </span>
                    </div>
                    <Slider
                      value={[minExperience]}
                      onValueChange={([v]) => setMinExperience(v)}
                      min={0}
                      max={15}
                      step={1}
                    />
                  </div>

                  {/* Languages */}
                  <div>
                    <div className="text-sm font-semibold mb-2">Sprog</div>
                    <div className="flex flex-wrap gap-2">
                      {languageOptions.map((lang) => {
                        const active = selectedLanguages.has(lang);
                        return (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => setSelectedLanguages((prev) => {
                              const next = new Set(prev);
                              if (next.has(lang)) next.delete(lang); else next.add(lang);
                              return next;
                            })}
                            aria-pressed={active}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                              active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                            }`}
                          >
                            {lang}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Services */}
                  <div>
                    <div className="text-sm font-semibold mb-2">Services</div>
                    <div className="space-y-2">
                      {serviceOptions.map((svc) => (
                        <label key={svc} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={selectedServices.has(svc)}
                            onCheckedChange={(checked) => setSelectedServices((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(svc); else next.delete(svc);
                              return next;
                            })}
                          />
                          {svc}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <SheetFooter className="sticky bottom-0 bg-background border-t pt-3 flex-row gap-2">
                  <Button variant="outline" className="flex-1" onClick={clearAllFilters}>
                    Nulstil
                  </Button>
                  <Button className="flex-1" onClick={() => setFilterSheetOpen(false)}>
                    Vis {filteredProviders.length} cleaners
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => setDrawerOpen(true)}
            >
              <ChevronUp className="h-4 w-4" />
              Se liste
            </Button>
          </div>
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Filtrér efter serviceområde (vælg flere)"
        >
          <button
            type="button"
            onClick={() => {
              setCountryFilter(new Set());
              setSelectedId(null);
            }}
            aria-pressed={countryFilter.size === 0}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              countryFilter.size === 0
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            🌍 Alle ({providers.length})
          </button>
          {availableCountries.map((c) => {
            const count = providers.filter((p) => p.countryCode === c.code).length;
            const active = countryFilter.has(c.code);
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => toggleCountry(c.code)}
                aria-pressed={active}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                {c.flag} {c.name} ({count})
              </button>
            );
          })}
        </div>
      </div>



      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Henter providere…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute left-4 right-4 top-20 z-30 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive backdrop-blur-md">
          <div className="flex items-start gap-2">
            <X className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">Der gik noget galt</p>
              <p className="text-destructive/80">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <div ref={mapRef} className="h-full w-full" />

      {/* Search this area button */}
      {searchAreaVisible && (
        <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2">
          <Button
            size="sm"
            onClick={handleSearchThisArea}
            className="h-10 gap-2 rounded-full bg-background px-5 text-xs font-semibold text-foreground shadow-lg hover:bg-background/90"
          >
            <Search className="h-3.5 w-3.5" />
            Søg i dette område
          </Button>
        </div>
      )}

      {/* Drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[70vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-left text-lg">
              {visibleProviders.length} providere i området
            </DrawerTitle>
          </DrawerHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-6">
            {visibleProviders.length === 0 && !loading && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <MapPin className="mx-auto mb-2 h-8 w-8 opacity-40" />
                <p>Flyt kortet eller zoom ud for at se providere.</p>
              </div>
            )}
            {visibleProviders.map((provider) => (
              <button
                key={provider.id}
                onClick={() => {
                  setSelectedId(provider.id);
                  mapInstance.current?.panTo({ lat: provider.lat, lng: provider.lng });
                  mapInstance.current?.setZoom(14);
                }}
                className={`w-full rounded-2xl border bg-card p-4 text-left transition-all hover:shadow-md ${
                  selectedId === provider.id ? "border-primary ring-1 ring-primary" : "border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 border border-border">
                    <AvatarImage src={provider.avatar || undefined} alt={provider.name} />
                    <AvatarFallback className="bg-primary text-primary-foreground font-heading text-sm">
                      {getInitials(provider.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="truncate font-semibold">{provider.name}</h3>
                      {provider.verified && (
                        <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                          Verificeret
                        </Badge>
                      )}
                      {isInstantBook(provider.id) && (
                        <Badge className="h-4 px-1 text-[9px] bg-primary/10 text-primary border-0 gap-0.5">
                          <Zap className="h-2.5 w-2.5" /> Instant
                        </Badge>
                      )}
                      {isAvailableToday(provider.id) && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] border-success/40 text-success gap-0.5">
                          <CalendarCheck className="h-2.5 w-2.5" /> I dag
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{provider.tagline}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="flex items-center gap-0.5 font-medium">
                        <Star className="h-3 w-3 fill-accent text-accent" />
                        {provider.rating}
                      </span>
                      <span className="text-muted-foreground">({provider.reviews})</span>
                      <span className="text-muted-foreground">·</span>
                    <span className="font-medium text-primary">
                      {formatPrice(provider.hourlyRate, getCountry(provider.countryCode))}/t
                    </span>
                    </div>
                    {provider.address && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {provider.address}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Selected provider card */}
      {selectedProvider && !drawerOpen && (
        <div className="absolute bottom-6 left-4 right-4 z-20">
          <div className="rounded-2xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-start gap-3">
              <Avatar className="h-14 w-14 border border-border">
                <AvatarImage src={selectedProvider.avatar || undefined} alt={selectedProvider.name} />
                <AvatarFallback className="bg-primary text-primary-foreground font-heading">
                  {getInitials(selectedProvider.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate font-semibold">{selectedProvider.name}</h3>
                  {selectedProvider.verified && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                      Verificeret
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{selectedProvider.tagline}</p>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-0.5 font-medium">
                    <Star className="h-3 w-3 fill-accent text-accent" />
                    {selectedProvider.rating}
                  </span>
                  <span className="text-muted-foreground">({selectedProvider.reviews})</span>
                  <span className="font-medium text-primary">
                    {formatPrice(selectedProvider.hourlyRate, getCountry(selectedProvider.countryCode))}/t
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  if (selectedProvider.slug) navigate(`/p/${selectedProvider.slug}?src=marketplace_pick`);
                  else navigate(`/provider/${selectedProvider.id}`);
                }}
              >
                Se profil
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  if (selectedProvider.slug) navigate(`/p/${selectedProvider.slug}?src=marketplace_pick`);
                  else navigate(`/book/${selectedProvider.id}`);
                }}
              >
                Book nu
              </Button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
