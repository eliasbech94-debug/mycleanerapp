/**
 * State machine behind the Find Cleaner experience.
 *
 * Owns: the customer-selected job location, the search radius, filters,
 * results, selection/hover sync between list and map, and the
 * "Search this area" affordance. Kept UI-free so it is unit-testable.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type GeoSearchFilters,
  type JobLocation,
  type PublicProvider,
  distanceKm,
  rankProviders,
  searchProvidersAround,
  searchProvidersAcrossMarkets,
} from "@/lib/providerSearch";
import { DEMO_MODE } from "@/data/demo";
import { getProvider } from "@/lib/providers";
import { anonymizeGeoPoint, currencyForCountry, publicDisplayName } from "@/lib/providerSearch";

export type ViewMode = "list" | "map";

/** Local fixtures so the surface is never empty in preview/dev. */
function demoProviders(job: JobLocation, radiusKm: number): PublicProvider[] {
  const offsets = [
    [0.012, 0.02],
    [-0.03, 0.04],
    [0.045, -0.03],
    [-0.055, -0.05],
  ];
  return ["p_001", "p_002", "p_003", "p_004"]
    .map((id, i) => {
      const seed = getProvider(id);
      if (!seed) return null;
      const raw = { lat: job.lat + offsets[i][0], lng: job.lng + offsets[i][1] };
      const anon = anonymizeGeoPoint(raw.lat, raw.lng, id);
      const d = distanceKm(job, anon);
      return {
        slug: seed.handle ?? null,
        userId: id,
        displayName: publicDisplayName(seed.name),
        avatarUrl: seed.avatar ?? null,
        countryCode: seed.countryCode,
        publicArea: seed.city,
        publicLat: anon.lat,
        publicLng: anon.lng,
        serviceRadiusKm: seed.radiusKm ?? 10,
        distanceKm: Math.round(d * 10) / 10,
        coversLocation: d <= (seed.radiusKm ?? 10),
        priceFrom: seed.hourlyRate ?? null,
        currency: currencyForCountry(seed.countryCode),
        languages: seed.languages ?? [],
        serviceCategories: seed.categories ?? [],
        yearsExperience: null,
        avgResponseMinutes: 45,
        verified: seed.verified,
        rating: seed.rating,
        reviews: seed.reviews,
        completedBookings: seed.jobsCompleted ?? 0,
        relevance: 0,
      } satisfies PublicProvider;
    })
    .filter((p): p is PublicProvider => p !== null)
    .filter((p) => p.coversLocation || p.distanceKm <= radiusKm);
}

export type UiFilters = {
  minRating: number;
  maxHourly: number | null;
  serviceCategory: string | null;
  language: string | null;
  availableTodayOnly: boolean;
  verifiedOnly: boolean;
};

export const DEFAULT_FILTERS: UiFilters = {
  minRating: 0,
  maxHourly: null,
  serviceCategory: null,
  language: null,
  availableTodayOnly: false,
  verifiedOnly: false,
};

export function useProviderGeoSearch(
  initialJob: JobLocation | null,
  /** Server-driven ACTIVE market codes (never hardcoded) for the Europe showcase. */
  activeMarkets: string[] = [],
) {
  const [job, setJob] = useState<JobLocation | null>(initialJob);
  const [radiusKm, setRadiusKm] = useState(15);
  const [filters, setFilters] = useState<UiFilters>(DEFAULT_FILTERS);
  const [results, setResults] = useState<PublicProvider[]>([]);
  const [showcase, setShowcase] = useState<PublicProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [mapMoved, setMapMoved] = useState(false);
  // Mobile-first: with no address yet, the Europe map IS the experience.
  const [view, setView] = useState<ViewMode>(initialJob ? "list" : "map");
  const reqRef = useRef(0);
  const showcaseKey = activeMarkets.join(",");
  const showcaseLoadedRef = useRef<string | null>(null);

  // --- Default state: Europe-wide showcase, loaded once, lazily ------------
  // Only runs while the customer has NOT chosen an address, so it never
  // competes with a real search.
  useEffect(() => {
    if (job || !showcaseKey || showcaseLoadedRef.current === showcaseKey) return;
    showcaseLoadedRef.current = showcaseKey;
    let cancelled = false;
    const codes = showcaseKey.split(",");
    void (async () => {
      let rows: PublicProvider[] = [];
      try {
        rows = await searchProvidersAcrossMarkets(codes);
      } catch {
        rows = [];
      }
      if (cancelled) return;
      if (rows.length === 0 && DEMO_MODE) {
        const { europeShowcaseProviders } = await import("@/lib/europeShowcase");
        if (cancelled) return;
        rows = europeShowcaseProviders(codes);
      }
      setShowcase(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [job, showcaseKey]);


  const search = useCallback(
    async (target?: JobLocation, radius?: number) => {
      const at = target ?? job;
      if (!at) return;
      const r = radius ?? radiusKm;
      const id = ++reqRef.current;
      setLoading(true);
      setError(null);
      try {
        const rows = await searchProvidersAround(at, r, {
          serviceCategory: filters.serviceCategory,
          language: filters.language,
          maxHourlyRate: filters.maxHourly,
        });
        if (id !== reqRef.current) return;
        setResults(rows.length > 0 ? rows : demoProviders(at, r));
      } catch (e) {
        if (id !== reqRef.current) return;
        const fallback = DEMO_MODE ? demoProviders(at, r) : [];
        if (fallback.length > 0) setResults(fallback);
        else {
          setResults([]);
          setError("search_failed");
        }
      } finally {
        if (id === reqRef.current) {
          setLoading(false);
          setMapMoved(false);
        }
      }
    },
    [job, radiusKm, filters.serviceCategory, filters.language, filters.maxHourly],
  );

  // Re-run whenever the job location, radius or server-side filters change.
  // Map panning never triggers a search — the customer presses "Search this area".
  useEffect(() => {
    if (!job) return;
    void search(job, radiusKm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.lat, job?.lng, radiusKm, filters.serviceCategory, filters.language, filters.maxHourly]);

  /** Client-side refinements that don't need a round-trip. */
  const visible = useMemo(() => {
    const list = results.filter((p) => {
      if (filters.minRating > 0 && p.rating < filters.minRating) return false;
      if (filters.verifiedOnly && !p.verified) return false;
      return true;
    });
    return rankProviders(list, radiusKm);
  }, [results, filters.minRating, filters.verifiedOnly, radiusKm]);

  /** Showcase (pre-search) state: the map paints all active markets at once. */
  const isShowcase = !job;
  const mapProviders = isShowcase ? showcase : visible;

  const selected = useMemo(
    () => mapProviders.find((p) => p.userId === selectedId) ?? null,
    [mapProviders, selectedId],
  );


  /** Customer moved the map — offer "Search this area" instead of auto-refreshing. */
  const notifyMapMoved = useCallback(() => setMapMoved(true), []);

  /** Search the area the customer is currently looking at; filters are kept. */
  const searchThisArea = useCallback(
    (center: JobLocation) => {
      setJob({ ...center, label: center.label ?? job?.label });
      setMapMoved(false);
    },
    [job?.label],
  );

  return {
    job,
    setJob,
    radiusKm,
    setRadiusKm,
    filters,
    setFilters,
    results,
    visible,
    showcase,
    mapProviders,
    isShowcase,
    loading,
    error,
    selectedId,
    setSelectedId,
    selected,
    hoverId,
    setHoverId,
    mapMoved,
    notifyMapMoved,
    searchThisArea,
    view,
    setView,
    refresh: search,
  };
}
