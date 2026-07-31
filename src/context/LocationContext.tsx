/**
 * LocationContext — the single source of truth for "where the user is
 * shopping". Components MUST read location from here; no component may
 * re-implement geolocation, city guessing or radius logic.
 *
 * Three separate axes (never conflated):
 *   language  → i18n            (what they read)
 *   market    → ActiveMarket    (country + currency + legal rules)
 *   location  → this context    (city / municipality / postcode / radius)
 *
 * Resolution ladder (highest → lowest):
 *   1. Booking location override (set by the booking flow — wins outright)
 *   2. Authenticated user's saved profile location
 *   3. Manual selection persisted in localStorage
 *   4. Consented browser geolocation (coarsened to ~1 km, mapped to a city)
 *   5. Country-level fallback from the active market / locale (precision:
 *      "country" — we show a country, never a made-up city)
 *
 * Privacy: consent is asked before precise geolocation, the raw fix never
 * leaves the browser un-coarsened, and only city/postcode/radius/rounded
 * coordinates are persisted.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveMarket } from "@/context/ActiveMarketContext";
import {
  coarsen,
  fetchMarketPlaces,
  findPlaceByName,
  findPlaceByPostcode,
  findPlaceBySlug,
  nearestPlace,
  placeToLocation,
  placesForCountry,
} from "@/lib/location/places";
import {
  DEFAULT_RADIUS_KM,
  UNKNOWN_LOCATION,
  type MarketPlace,
  type ResolvedLocation,
} from "@/lib/location/types";

const MANUAL_KEY = "mc.location.manual";      // { country, slug, postcode?, radiusKm? }
const CONSENT_KEY = "mc.location.consent";    // "granted" | "declined"
const PROMPT_KEY = "mc.location.prompted";    // "1" once the soft prompt was shown

type ConsentState = "unknown" | "granted" | "declined";

interface ManualChoice {
  country: string;
  slug: string;
  postcode?: string | null;
  radiusKm?: number;
}

interface LocationContextValue {
  /** The location every surface should render from. */
  location: ResolvedLocation;
  /** Curated places for the active market — for pickers and empty states. */
  places: MarketPlace[];
  placesForActiveMarket: MarketPlace[];
  loading: boolean;
  consent: ConsentState;
  /** True on a first visit when we may show the soft pre-prompt. */
  shouldPrompt: boolean;
  dismissPrompt: () => void;
  /** Ask the browser for a precise fix (only after explicit user consent). */
  requestGeolocation: () => Promise<ResolvedLocation | null>;
  declineGeolocation: () => void;
  /** Manual change — always available, persisted (and saved to the profile). */
  setPlace: (place: MarketPlace, opts?: { postcode?: string | null; radiusKm?: number }) => void;
  setRadiusKm: (km: number) => void;
  clearManual: () => void;
  /** Booking flows call this so the service address wins over device location. */
  setBookingLocation: (loc: Partial<ResolvedLocation> | null) => void;
}

const Ctx = createContext<LocationContextValue | null>(null);

function readManual(): ManualChoice | null {
  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ManualChoice;
    return parsed && parsed.slug && parsed.country ? parsed : null;
  } catch {
    return null;
  }
}

function readConsent(): ConsentState {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "declined" ? v : "unknown";
  } catch {
    return "unknown";
  }
}

interface ProfileLocationRow {
  location_city: string | null;
  location_postcode: string | null;
  location_radius_km: number | null;
  location_precision: string | null;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { market, isNeutral } = useActiveMarket();

  const [places, setPlaces] = useState<MarketPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileRow, setProfileRow] = useState<ProfileLocationRow | null>(null);
  const [manual, setManual] = useState<ManualChoice | null>(() => readManual());
  const [consent, setConsent] = useState<ConsentState>(() => readConsent());
  const [promptDismissed, setPromptDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(PROMPT_KEY) === "1"; } catch { return true; }
  });
  const [geo, setGeo] = useState<ResolvedLocation | null>(null);
  const [booking, setBooking] = useState<Partial<ResolvedLocation> | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void fetchMarketPlaces().then((p) => {
      if (!cancelled) { setPlaces(p); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, []);

  // Saved profile location (authenticated users only).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setProfileRow(null); return; }
      const { data } = await supabase
        .from("profiles")
        .select("location_city,location_postcode,location_radius_km,location_precision,country_code,lat,lng")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) setProfileRow((data as ProfileLocationRow | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const location = useMemo<ResolvedLocation>(() => {
    const marketCountry = isNeutral ? null : market.code;

    // 1. Booking / service address wins during a booking flow.
    if (booking && (booking.city || booking.postcode || booking.countryCode)) {
      return {
        ...UNKNOWN_LOCATION,
        radiusKm: booking.radiusKm ?? DEFAULT_RADIUS_KM,
        ...booking,
        precision: booking.precision ?? "city",
        source: "booking",
      } as ResolvedLocation;
    }

    // 2. Saved profile location.
    if (profileRow?.location_city || profileRow?.location_postcode) {
      const country = profileRow.country_code?.toUpperCase() ?? marketCountry;
      const place =
        findPlaceByName(places, country, profileRow.location_city) ??
        findPlaceByPostcode(places, country, profileRow.location_postcode);
      const base = place
        ? placeToLocation(place, "profile")
        : { ...UNKNOWN_LOCATION, countryCode: country, city: profileRow.location_city };
      return {
        ...base,
        postcode: profileRow.location_postcode,
        radiusKm: profileRow.location_radius_km ?? base.radiusKm ?? DEFAULT_RADIUS_KM,
        precision: (profileRow.location_precision as ResolvedLocation["precision"]) ?? "city",
        source: "profile",
      };
    }

    // 3. Manual selection.
    if (manual) {
      const place = findPlaceBySlug(places, manual.country, manual.slug);
      if (place) {
        return placeToLocation(place, "manual", {
          postcode: manual.postcode ?? null,
          radiusKm: manual.radiusKm ?? place.defaultRadiusKm,
        });
      }
    }

    // 4. Consented geolocation.
    if (geo) return geo;

    // 5. Country-level fallback — no invented city.
    return {
      ...UNKNOWN_LOCATION,
      countryCode: marketCountry,
      precision: "country",
      source: marketCountry ? "locale" : "unknown",
    };
  }, [booking, profileRow, manual, geo, places, market.code, isNeutral]);

  const persistToProfile = useCallback(
    async (loc: ResolvedLocation) => {
      if (!user || saving.current) return;
      saving.current = true;
      try {
        await supabase
          .from("profiles")
          .update({
            location_city: loc.city,
            location_postcode: loc.postcode,
            location_radius_km: loc.radiusKm,
            location_precision: loc.precision,
            location_updated_at: new Date().toISOString(),
            ...(loc.source === "geolocation" ? { location_consent_at: new Date().toISOString() } : {}),
          })
          .eq("id", user.id);
        setProfileRow((prev) => ({
          location_city: loc.city,
          location_postcode: loc.postcode,
          location_radius_km: loc.radiusKm,
          location_precision: loc.precision,
          country_code: loc.countryCode ?? prev?.country_code ?? null,
          lat: prev?.lat ?? null,
          lng: prev?.lng ?? null,
        }));
      } finally {
        saving.current = false;
      }
    },
    [user],
  );

  const setPlace = useCallback<LocationContextValue["setPlace"]>(
    (place, opts) => {
      const choice: ManualChoice = {
        country: place.countryCode,
        slug: place.slug,
        postcode: opts?.postcode ?? null,
        radiusKm: opts?.radiusKm ?? place.defaultRadiusKm,
      };
      try { localStorage.setItem(MANUAL_KEY, JSON.stringify(choice)); } catch { /* ignore */ }
      setManual(choice);
      setGeo(null);
      void persistToProfile(
        placeToLocation(place, "manual", {
          postcode: choice.postcode,
          radiusKm: choice.radiusKm,
        }),
      );
    },
    [persistToProfile],
  );

  const setRadiusKm = useCallback(
    (km: number) => {
      const clamped = Math.min(200, Math.max(1, Math.round(km)));
      setManual((prev) => {
        const next = prev
          ? { ...prev, radiusKm: clamped }
          : location.citySlug && location.countryCode
            ? { country: location.countryCode, slug: location.citySlug, radiusKm: clamped }
            : null;
        if (next) {
          try { localStorage.setItem(MANUAL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        }
        return next;
      });
      void persistToProfile({ ...location, radiusKm: clamped });
    },
    [location, persistToProfile],
  );

  const clearManual = useCallback(() => {
    try { localStorage.removeItem(MANUAL_KEY); } catch { /* ignore */ }
    setManual(null);
  }, []);

  const dismissPrompt = useCallback(() => {
    try { localStorage.setItem(PROMPT_KEY, "1"); } catch { /* ignore */ }
    setPromptDismissed(true);
  }, []);

  const declineGeolocation = useCallback(() => {
    try {
      localStorage.setItem(CONSENT_KEY, "declined");
      localStorage.setItem(PROMPT_KEY, "1");
    } catch { /* ignore */ }
    setConsent("declined");
    setPromptDismissed(true);
  }, []);

  const requestGeolocation = useCallback(async (): Promise<ResolvedLocation | null> => {
    dismissPrompt();
    if (typeof navigator === "undefined" || !navigator.geolocation) return null;
    const pos = await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600_000 },
      );
    });
    if (!pos) {
      declineGeolocation();
      return null;
    }
    try { localStorage.setItem(CONSENT_KEY, "granted"); } catch { /* ignore */ }
    setConsent("granted");

    const rough = coarsen(pos.coords.latitude, pos.coords.longitude);
    const all = places.length ? places : await fetchMarketPlaces();
    const near = nearestPlace(all, rough);
    // Only accept the match when the fix is plausibly inside that area.
    const resolved: ResolvedLocation =
      near && near.km <= Math.max(60, near.place.defaultRadiusKm * 2)
        ? placeToLocation(near.place, "geolocation", { lat: rough.lat, lng: rough.lng })
        : { ...UNKNOWN_LOCATION, lat: rough.lat, lng: rough.lng, precision: "city", source: "geolocation" };
    setGeo(resolved);
    void persistToProfile(resolved);
    return resolved;
  }, [places, dismissPrompt, declineGeolocation, persistToProfile]);

  const setBookingLocation = useCallback((loc: Partial<ResolvedLocation> | null) => {
    setBooking(loc);
  }, []);

  const value: LocationContextValue = {
    location,
    places,
    placesForActiveMarket: placesForCountry(places, location.countryCode ?? market.code),
    loading,
    consent,
    shouldPrompt:
      !promptDismissed &&
      consent === "unknown" &&
      !manual &&
      !profileRow?.location_city &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.geolocation),
    dismissPrompt,
    requestGeolocation,
    declineGeolocation,
    setPlace,
    setRadiusKm,
    clearManual,
    setBookingLocation,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocation(): LocationContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLocation must be used inside <LocationProvider>");
  return v;
}

/** Safe variant for components that may render outside the provider (tests). */
export function useOptionalLocation(): LocationContextValue | null {
  return useContext(Ctx);
}
