import { useMemo } from "react";
import {
  DEMO_MODE,
  getDemoBookings,
  getDemoCollections,
  getDemoConversations,
  getDemoCustomers,
  getDemoNotificationsFor,
  getDemoProviderStats,
  getDemoReviews,
  getDemoTrendingServices,
  getVisibleDemoProviders,
} from "@/data/demo";
import { useDemoScenario } from "./useDemoScenario";

/**
 * Scenario-aware access to the demo dataset. Every value is derived from local
 * fixtures — no network requests, no Supabase, no writes. Outside DEMO_MODE all
 * collections are empty and the helpers are no-ops.
 */
export function useDemoMarketplace(collectionLimit = 8) {
  const { scenarioId, scenario, enabled } = useDemoScenario();

  return useMemo(() => {
    if (!DEMO_MODE) {
      return {
        enabled: false,
        scenario,
        providers: [],
        collections: [],
        trendingServices: [],
        reviews: [],
        bookings: [],
        conversations: [],
        customers: [],
      };
    }
    const multiplier = scenario.activityMultiplier;
    const scale = <T,>(rows: T[]) => rows.slice(0, Math.max(1, Math.round(rows.length * Math.min(1, multiplier))));

    return {
      enabled,
      scenario,
      providers: getVisibleDemoProviders(),
      collections: getDemoCollections(collectionLimit),
      trendingServices: getDemoTrendingServices(),
      reviews: scale(getDemoReviews()),
      bookings: scale(getDemoBookings()),
      conversations: scale(getDemoConversations()),
      customers: getDemoCustomers(),
    };
    // scenarioId is the reactive key: fixtures themselves are immutable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, collectionLimit, enabled]);
}

export function useDemoProviderDashboard(slug: string | null | undefined) {
  const { scenarioId } = useDemoScenario();
  return useMemo(() => {
    if (!DEMO_MODE || !slug) return null;
    return {
      stats: getDemoProviderStats(slug),
      notifications: getDemoNotificationsFor("provider"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, scenarioId]);
}
