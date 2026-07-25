/**
 * AppContext — the canonical Context Engine for MyCleaner.
 *
 * Vision v1.0 mandates ONE global context that resolves every signal a
 * page might need. Do not create parallel context stores; extend this one.
 *
 * Composes (never duplicates state):
 *   - market      → ActiveMarketContext (address → profile → explicit → locale → neutral)
 *   - auth        → useAuth (user, session, profile, loading)
 *   - roles       → user_roles table via useUserRoles
 *   - category    → active service category (URL ?category= or explicit setter, persisted)
 *   - device      → viewport-derived (mobile / tablet / desktop)
 *   - time        → part-of-day + weekend flag, recomputed every minute in market timezone
 *   - campaign    → URL ?utm_campaign / ?campaign (persisted for the session)
 *   - locale      → market.locale (single source; do not read navigator.language elsewhere)
 *
 * Read-only surface. Mutations go through the owning provider
 * (setMarket, setCategory, signOut, …).
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
/* Device — coarse breakpoints; consumers should still prefer CSS media       */
/* queries for layout, and use this only for behavioural branching.           */
/* -------------------------------------------------------------------------- */

export type DeviceKind = "mobile" | "tablet" | "desktop";

function deviceFor(width: number): DeviceKind {
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/* -------------------------------------------------------------------------- */
/* Time-of-day — resolved in the active market's timezone so a Berlin visitor */
/* served from a CDN in Ireland still sees the correct greeting.              */
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
/* Context value                                                              */
/* -------------------------------------------------------------------------- */

export type AppRole = "customer" | "provider" | "employee" | "support" | "admin" | "super_admin";

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
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppContextProvider({ children }: { children: ReactNode }) {
  const { market, isNeutral } = useActiveMarket();
  const { user, session, profile, loading: authLoading } = useAuth();
  const { roles: rawRoles } = useUserRoles();
  const location = useLocation();

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

  const roles = (rawRoles ?? []) as AppRole[];
  const hasRole = useCallback((r: AppRole) => roles.includes(r), [roles]);

  const value: AppContextValue = {
    market,
    isNeutralMarket: isNeutral,

    user,
    session,
    profile,
    isAuthenticated: !!user,
    authLoading,
    roles,
    hasRole,

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
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppContext(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppContext must be used inside <AppContextProvider>");
  return v;
}
