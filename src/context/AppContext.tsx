/**
 * AppContext — the canonical Context Engine for MyCleaner.
 *
 * Vision v1.0 mandates ONE global context that resolves every signal a
 * page or future feature might need. Do NOT create parallel context
 * stores; extend this one.
 *
 * Every homepage component, booking flow, provider page, search result,
 * AI Concierge and future service category reads from `useAppContext()`.
 * No hardcoded countries, cities, currencies, copy or duplicated logic.
 *
 * Composes (never duplicates state):
 *   - market            → ActiveMarketContext (address > profile > explicit > locale > neutral)
 *   - auth              → useAuth (user, session, profile, loading)
 *   - roles / userType  → user_roles table via useUserRoles
 *   - category          → active service category (URL ?category=, persisted)
 *   - device            → viewport-derived (mobile / tablet / desktop)
 *   - time              → part-of-day + weekend flag, per market timezone, ticks every minute
 *   - campaign          → URL ?utm_campaign / ?campaign (persisted for the session)
 *   - locale            → market.locale
 *   - bookingAddress    → primary customer_addresses row (source of truth for market)
 *   - favouriteProviders→ customer_favorites for the signed-in customer
 *   - isReturningCustomer → derived from bookings count
 *   - featureFlags      → async evaluator bound to current market/user/provider
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { useActiveMarket } from "@/context/ActiveMarketContext";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { hasFlag as evaluateFlag } from "@/lib/featureFlags";
import { supabase } from "@/integrations/supabase/client";
import type { Market } from "@/lib/markets";

/* -------------------------------------------------------------------------- */
/* Service categories — configuration, not code. Add a category here and the  */
/* whole platform picks it up (router, filters, AI concierge, analytics).     */
/* -------------------------------------------------------------------------- */

export type ServiceCategoryId =
  | "cleaning"
  | "window_cleaning"
  | "moving"
  | "gardening"
  | "handyman"
  | "laundry"
  | "home_care"
  | "pet_care";

export type ServiceCategory = {
  id: ServiceCategoryId;
  slug: string;
  label: string;
  /** true when live in production; others render as "coming soon" surfaces. */
  live: boolean;
};

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  { id: "cleaning",        slug: "cleaning",        label: "Cleaning",        live: true  },
  { id: "window_cleaning", slug: "window-cleaning", label: "Window cleaning", live: false },
  { id: "moving",          slug: "moving",          label: "Moving",          live: false },
  { id: "gardening",       slug: "gardening",       label: "Gardening",       live: false },
  { id: "handyman",        slug: "handyman",        label: "Handyman",        live: false },
  { id: "laundry",         slug: "laundry",         label: "Laundry",         live: false },
  { id: "home_care",       slug: "home-care",       label: "Home care",       live: false },
  { id: "pet_care",        slug: "pet-care",        label: "Pet care",        live: false },
];

const DEFAULT_CATEGORY: ServiceCategoryId = "cleaning";
const CATEGORY_KEY = "mc.category";
const CAMPAIGN_KEY = "mc.campaign";

function categoryBySlug(slug?: string | null): ServiceCategory | null {
  if (!slug) return null;
  return SERVICE_CATEGORIES.find((c) => c.slug === slug || c.id === slug) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Device                                                                     */
/* -------------------------------------------------------------------------- */

export type DeviceKind = "mobile" | "tablet" | "desktop";

function deviceFor(width: number): DeviceKind {
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/* -------------------------------------------------------------------------- */
/* Time-of-day — resolved in the active market's timezone.                    */
/* -------------------------------------------------------------------------- */

export type PartOfDay = "morning" | "afternoon" | "evening" | "night";

function partOfDay(hour: number): PartOfDay {
  if (hour < 5)  return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

function timeInZone(tz: string): { hour: number; weekday: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = wdMap[parts.find((p) => p.type === "weekday")?.value ?? "Mon"] ?? 1;
    return { hour, weekday };
  } catch {
    const d = new Date();
    return { hour: d.getHours(), weekday: d.getDay() };
  }
}

/* -------------------------------------------------------------------------- */
/* User type — a coarse, product-facing classification derived from roles.    */
/* Guests are unauthenticated visitors. Admin covers admin + super_admin.     */
/* -------------------------------------------------------------------------- */

export type UserType = "guest" | "customer" | "provider" | "admin";
export type AppRole = "customer" | "provider" | "employee" | "support" | "admin" | "super_admin";

function classifyUser(isAuthenticated: boolean, roles: AppRole[]): UserType {
  if (!isAuthenticated) return "guest";
  if (roles.includes("admin") || roles.includes("super_admin")) return "admin";
  if (roles.includes("provider")) return "provider";
  return "customer";
}

/* -------------------------------------------------------------------------- */
/* Booking address                                                            */
/* -------------------------------------------------------------------------- */

export type BookingAddress = {
  id: string;
  formatted_address: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  address_country_code: string | null;
  lat: number | null;
  lng: number | null;
  is_primary: boolean;
};

/* -------------------------------------------------------------------------- */
/* Context value                                                              */
/* -------------------------------------------------------------------------- */

export interface AppContextValue {
  // Market
  market: Market;
  isNeutralMarket: boolean;

  // Auth
  user: ReturnType<typeof useAuth>["user"];
  session: ReturnType<typeof useAuth>["session"];
  profile: Profile | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  roles: AppRole[];
  hasRole: (role: AppRole) => boolean;
  userType: UserType;

  // Service category
  category: ServiceCategory;
  categories: ServiceCategory[];
  setCategory: (id: ServiceCategoryId) => void;

  // Device
  device: DeviceKind;
  isMobile: boolean;

  // Time (in the active market's timezone)
  now: Date;
  hour: number;
  partOfDay: PartOfDay;
  isWeekend: boolean;

  // Campaign
  campaign: string | null;

  // Locale — always derived from active market
  locale: string;

  // Booking / service address (source of truth for market)
  bookingAddress: BookingAddress | null;

  // Customer relationship
  favouriteProviderIds: string[];
  isReturningCustomer: boolean;

  // Feature flags — async evaluator bound to current context.
  // Use for gated features that need country/user targeting.
  hasFeatureFlag: (key: string) => Promise<boolean>;
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppContextProvider({ children }: { children: ReactNode }) {
  const { market, isNeutral } = useActiveMarket();
  const { user, session, profile, loading: authLoading } = useAuth();
  const { roles: rawRoles } = useUserRoles();
  const location = useLocation();

  const roles = (rawRoles ?? []) as AppRole[];
  const hasRole = useCallback((r: AppRole) => roles.includes(r), [roles]);
  const isAuthenticated = !!user;
  const userType = classifyUser(isAuthenticated, roles);

  // ---------- Category (URL query > localStorage > default) ----------
  const urlCategory = useMemo(() => {
    const p = new URLSearchParams(location.search).get("category");
    return categoryBySlug(p);
  }, [location.search]);

  const [storedCategory, setStoredCategory] = useState<ServiceCategoryId>(() => {
    if (typeof localStorage === "undefined") return DEFAULT_CATEGORY;
    const v = localStorage.getItem(CATEGORY_KEY) as ServiceCategoryId | null;
    return v && SERVICE_CATEGORIES.some((c) => c.id === v) ? v : DEFAULT_CATEGORY;
  });

  const category = urlCategory
    ?? SERVICE_CATEGORIES.find((c) => c.id === storedCategory)
    ?? SERVICE_CATEGORIES[0];

  const setCategory = useCallback((id: ServiceCategoryId) => {
    setStoredCategory(id);
    try { localStorage.setItem(CATEGORY_KEY, id); } catch { /* ignore */ }
  }, []);

  // ---------- Campaign (URL utm_campaign > session storage) ----------
  const [campaign, setCampaign] = useState<string | null>(() => {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage.getItem(CAMPAIGN_KEY);
  });
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const c = p.get("utm_campaign") ?? p.get("campaign");
    if (c) {
      setCampaign(c);
      try { sessionStorage.setItem(CAMPAIGN_KEY, c); } catch { /* ignore */ }
    }
  }, [location.search]);

  // ---------- Device ----------
  const [device, setDevice] = useState<DeviceKind>(() =>
    typeof window === "undefined" ? "desktop" : deviceFor(window.innerWidth)
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setDevice(deviceFor(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ---------- Time-of-day (recompute every minute in market timezone) ----------
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const { hour, weekday } = useMemo(
    () => timeInZone(market.timezone),
    [market.timezone, tick]
  );

  // ---------- Customer-scoped data (address, favourites, returning) ----------
  const [bookingAddress, setBookingAddress] = useState<BookingAddress | null>(null);
  const [favouriteProviderIds, setFavouriteProviderIds] = useState<string[]>([]);
  const [isReturningCustomer, setReturning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setBookingAddress(null);
      setFavouriteProviderIds([]);
      setReturning(false);
      return;
    }
    (async () => {
      const [{ data: addr }, { data: favs }, { count }] = await Promise.all([
        supabase
          .from("customer_addresses")
          .select("id,formatted_address,address_line1,postal_code,city,address_country_code,lat,lng,is_primary,updated_at")
          .eq("user_id", user.id)
          .order("is_primary", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("customer_favorites")
          .select("provider_id")
          .eq("customer_id", user.id),
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", user.id),
      ]);
      if (cancelled) return;
      setBookingAddress((addr as BookingAddress | null) ?? null);
      setFavouriteProviderIds(((favs ?? []) as { provider_id: string }[]).map((r) => r.provider_id));
      setReturning((count ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ---------- Feature flags — bound to current context ----------
  const hasFeatureFlag = useCallback(
    (key: string) =>
      evaluateFlag(key, {
        userId: user?.id,
        providerId: profile?.provider_id ?? undefined,
        countryIso: market.code === "EU" ? undefined : market.code,
      }),
    [user?.id, profile?.provider_id, market.code],
  );

  const value: AppContextValue = {
    market,
    isNeutralMarket: isNeutral,

    user,
    session,
    profile,
    isAuthenticated,
    authLoading,
    roles,
    hasRole,
    userType,

    category,
    categories: SERVICE_CATEGORIES,
    setCategory,

    device,
    isMobile: device === "mobile",

    now: new Date(),
    hour,
    partOfDay: partOfDay(hour),
    isWeekend: weekday === 0 || weekday === 6,

    campaign,

    locale: market.locale,

    bookingAddress,

    favouriteProviderIds,
    isReturningCustomer,

    hasFeatureFlag,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppContext(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppContext must be used inside <AppContextProvider>");
  return v;
}
