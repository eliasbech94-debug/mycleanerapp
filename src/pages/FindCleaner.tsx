import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Search, X, ChevronUp, Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/countries";
import { getProvider, getCountry, deriveHourlyRate } from "@/lib/providers";
import type { ProviderProfileData } from "@/lib/providers";

type MapProvider = {
  id: string;
  profileId: string;
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
  const color = "hsl(168 65% 38%)";
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

export default function FindCleaner() {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const googleRef = useRef<typeof window.google | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<MapProvider[]>([]);
  const [visibleProviders, setVisibleProviders] = useState<MapProvider[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchAreaVisible, setSearchAreaVisible] = useState(false);
  const [lastSearchBounds, setLastSearchBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [mapMoved, setMapMoved] = useState(false);

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
            return {
              id: p.provider_id,
              profileId: p.id,
              name: p.full_name || seed?.name || "Cleaner",
              providerId: p.provider_id,
              lat: Number(p.lat),
              lng: Number(p.lng),
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
            name: seed.name,
            providerId: seed.id,
            lat: coords.lat,
            lng: coords.lng,
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
    const visible = providers.filter((p) => bounds.contains(new google.maps.LatLng(p.lat, p.lng)));
    setVisibleProviders(visible);

    if (lastSearchBounds && !bounds.equals(lastSearchBounds)) {
      setSearchAreaVisible(true);
    } else {
      setSearchAreaVisible(false);
    }
  }, [providers, lastSearchBounds]);

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
      mapInstance.current = null;
    };
  }, [providers.length, updateVisibleProviders, fetchProviders]);

  useEffect(() => {
    if (!mapInstance.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    providers.forEach((provider) => {
      const marker = createMarker(
        googleRef.current!,
        provider,
        selectedId === provider.id,
        () => {
          setSelectedId(provider.id);
          setDrawerOpen(true);
          mapInstance.current?.panTo({ lat: provider.lat, lng: provider.lng });
        },
      );
      marker.setMap(mapInstance.current);
      markersRef.current.push(marker);
    });

    updateVisibleProviders();
  }, [providers, selectedId, updateVisibleProviders]);

  const handleSearchThisArea = useCallback(() => {
    const bounds = mapInstance.current?.getBounds();
    if (bounds) {
      setLastSearchBounds(bounds);
      setSearchAreaVisible(false);
      setMapMoved(false);
      updateVisibleProviders();
    }
  }, [updateVisibleProviders]);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedId) || visibleProviders[0],
    [providers, selectedId, visibleProviders],
  );

  return (
    <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden bg-muted">
      {/* Header overlay */}
      <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-3 bg-background/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground font-heading text-lg font-bold">
            M
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Find din cleaner</h1>
            <p className="text-[10px] text-muted-foreground">{providers.length} providere i dit område</p>
          </div>
        </div>
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
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate font-semibold">{provider.name}</h3>
                      {provider.verified && (
                        <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                          Verificeret
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
                onClick={() => navigate(`/provider/${selectedProvider.id}`)}
              >
                Se profil
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => navigate(`/book/${selectedProvider.id}`)}
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
