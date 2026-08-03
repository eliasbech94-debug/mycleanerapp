import { describe, expect, it } from "vitest";
import {
  DEMO_BOOKING_COUNT,
  DEMO_CONVERSATION_COUNT,
  DEMO_CUSTOMER_COUNT,
  DEMO_MODE,
  DEMO_REVIEW_COUNT,
  getDemoBookings,
  getDemoCollections,
  getDemoConversations,
  getDemoCustomers,
  getDemoNotifications,
  getDemoProviderStats,
  getDemoReviews,
  getDemoVideoIntroSlugs,
  getVisibleDemoProviders,
  setDemoScenario,
} from "@/data/demo";

/** The fixture layer must be self-contained: no network, no database, no writes. */
describe("demo dataset phase 2", () => {
  it("is enabled in the test/dev environment", () => {
    expect(DEMO_MODE).toBe(true);
  });

  it("generates the expected fixture volumes", () => {
    expect(getDemoCustomers()).toHaveLength(DEMO_CUSTOMER_COUNT);
    expect(getDemoReviews()).toHaveLength(DEMO_REVIEW_COUNT);
    expect(getDemoBookings()).toHaveLength(DEMO_BOOKING_COUNT);
    expect(getDemoConversations()).toHaveLength(DEMO_CONVERSATION_COUNT);
    expect(getDemoVideoIntroSlugs()).toHaveLength(8);
    expect(getDemoNotifications().length).toBeGreaterThan(20);
  });

  it("has no duplicate review texts", () => {
    const bodies = getDemoReviews().map((r) => r.body);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it("covers every booking status and builds full completed timelines", () => {
    const statuses = new Set(getDemoBookings().map((b) => b.status));
    ["completed", "upcoming", "accepted", "pending", "cancelled", "rescheduled"].forEach((s) =>
      expect(statuses.has(s as never)).toBe(true),
    );

    const completed = getDemoBookings().find((b) => b.status === "completed")!;
    const steps = completed.timeline.map((t) => t.step);
    ["accepted", "travelling", "arrived", "started", "completed", "customer_confirmed", "funds_released"].forEach(
      (step) => expect(steps).toContain(step),
    );
  });

  it("produces populated homepage collections and dashboard stats", () => {
    const collections = getDemoCollections();
    expect(collections).toHaveLength(7);
    collections.forEach((c) => expect(c.providers.length).toBeGreaterThan(0));

    const stats = getDemoProviderStats(getVisibleDemoProviders()[0].provider_slug);
    expect(stats?.earnings_trend).toHaveLength(6);
    expect(stats?.upcoming_bookings).toBeGreaterThanOrEqual(0);
  });

  it("reshapes the catalogue when the scenario changes", () => {
    setDemoScenario("busy");
    const busy = getVisibleDemoProviders().length;
    setDemoScenario("quiet");
    const quiet = getVisibleDemoProviders().length;
    expect(quiet).toBeLessThan(busy);

    setDemoScenario("premium");
    getVisibleDemoProviders().forEach((p) => expect(p.average_rating).toBeGreaterThanOrEqual(4.8));

    setDemoScenario("normal");
  });
});
