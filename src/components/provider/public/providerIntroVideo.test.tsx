/**
 * Trust Engine Phase 1A — "Mød din cleaner" intro video regression tests.
 * Frontend only: no network, no Supabase, no storage.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProviderHero from "./ProviderHero";
import {
  publicIntroVideo,
  showsVerifiedBadge,
  formatVideoDuration,
  type ProviderIntroVideo,
} from "./providerIntroVideoTypes";
import {
  getRecordedIntroVideoEvents,
  resetIntroVideoEvents,
} from "./providerIntroVideoAnalytics";
import type { PublicProviderProfile } from "./types";

const base: PublicProviderProfile = {
  provider_slug: "x", display_name: "Sofia Marquez", avatar_url: null, marketplace_score: null,
  provider_tier: "new", country_code: "DK", city: null, approx_lat: null, approx_lng: null,
  service_categories: [], languages: [], years_experience: null, price_from: null,
  service_radius_km: null, public_bio: null, headline: null, equipment_badges: null,
  avg_response_minutes: null, identity_verified_badge: false, address_verified: false,
  average_rating: null, total_reviews: null, completed_bookings: 0, years_on_platform: 0,
  insurance_valid: false, services: [],
};

const approved: ProviderIntroVideo = {
  id: "v1",
  videoUrl: "https://example.test/v.mp4",
  durationSeconds: 42,
  status: "approved",
  recordedInMyCleaner: true,
  identityVerified: true,
};

const hero = (profile: PublicProviderProfile) =>
  render(
    <ProviderHero
      profile={profile}
      availabilityStatus="available"
      distanceKm={null}
      isFollowing={false}
      onFollow={() => {}}
    />,
  );

describe("intro video visibility rules", () => {
  it("returns null without a video", () => expect(publicIntroVideo(null)).toBeNull());
  it("hides non-approved statuses", () => {
    for (const status of ["draft", "pending", "rejected"] as const) {
      expect(publicIntroVideo({ ...approved, status })).toBeNull();
    }
  });
  it("exposes an approved video", () => expect(publicIntroVideo(approved)).not.toBeNull());
  it("requires approved + identityVerified for the badge", () => {
    expect(showsVerifiedBadge(approved)).toBe(true);
    expect(showsVerifiedBadge({ ...approved, identityVerified: false })).toBe(false);
    expect(showsVerifiedBadge({ ...approved, status: "pending" })).toBe(false);
  });
  it("formats duration", () => expect(formatVideoDuration(75)).toBe("1:15"));
});

describe("ProviderHero trigger", () => {
  beforeEach(() => resetIntroVideoEvents());

  it("renders no trigger when the provider has no video", () => {
    hero(base);
    expect(screen.queryByTestId("intro-video-trigger")).toBeNull();
  });

  it("renders no trigger for a pending video", () => {
    hero({ ...base, intro_video: { ...approved, status: "pending" } });
    expect(screen.queryByTestId("intro-video-trigger")).toBeNull();
  });

  it("renders an accessible trigger for an approved video", () => {
    hero({ ...base, intro_video: approved });
    const btn = screen.getByTestId("intro-video-trigger");
    expect(btn).toHaveAttribute("aria-label", "Afspil introduktionsvideo for Sofia");
    expect(screen.getByText("Mød din cleaner")).toBeTruthy();
  });

  it("keeps the follow button working alongside the trigger", () => {
    const onFollow = vi.fn();
    render(
      <ProviderHero
        profile={{ ...base, intro_video: approved }}
        availabilityStatus="available"
        distanceKm={null}
        isFollowing={false}
        onFollow={onFollow}
      />,
    );
    fireEvent.click(screen.getByTestId("provider-hero-follow"));
    expect(onFollow).toHaveBeenCalled();
  });
});

describe("intro video dialog", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    resetIntroVideoEvents();
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens on click, never autoplays and closes on Escape", async () => {
    hero({ ...base, intro_video: approved, average_rating: 4.9, completed_bookings: 241 });
    const trigger = screen.getByTestId("intro-video-trigger");
    fireEvent.click(trigger);

    const player = await screen.findByTestId("intro-video-player");
    expect(player).not.toHaveAttribute("autoplay");
    expect(player).not.toHaveAttribute("loop");
    expect(player).toHaveAttribute("controls");
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("intro-video-player")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("pauses the video when the dialog closes", async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    hero({ ...base, intro_video: approved });
    fireEvent.click(screen.getByTestId("intro-video-trigger"));
    await screen.findByTestId("intro-video-player");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(pause).toHaveBeenCalled());
    pause.mockRestore();
  });

  it("shows a safe fallback when the video URL is missing", async () => {
    hero({ ...base, intro_video: { ...approved, videoUrl: "" } });
    fireEvent.click(screen.getByTestId("intro-video-trigger"));
    expect(await screen.findByTestId("intro-video-fallback")).toBeTruthy();
    expect(screen.queryByTestId("intro-video-player")).toBeNull();
  });

  it("shows only trust datapoints that exist", async () => {
    hero({ ...base, intro_video: approved });
    fireEvent.click(screen.getByTestId("intro-video-trigger"));
    const trust = await screen.findByTestId("intro-video-trust");
    expect(trust.textContent).toContain("gennemgået før offentliggørelse");
    expect(trust.textContent).not.toContain("booker igen");
    expect(trust.textContent).not.toContain("MyCleaner anbefaler");
  });

  it("renders trust datapoints and the verified badge when data supports it", async () => {
    hero({
      ...base,
      intro_video: approved,
      average_rating: 4.9,
      completed_bookings: 241,
      repeat_booking_rate: 68,
      mycleaner_recommended: true,
    });
    fireEvent.click(screen.getByTestId("intro-video-trigger"));
    const trust = await screen.findByTestId("intro-video-trust");
    expect(trust.textContent).toContain("4.9 i bedømmelse");
    expect(trust.textContent).toContain("68 % booker igen");
    expect(trust.textContent).toContain("241 gennemførte opgaver");
    expect(trust.textContent).toContain("MyCleaner anbefaler");
    expect(screen.getByTestId("intro-video-verified-badge")).toBeTruthy();
  });

  it("hides the verified badge when identity is not verified", async () => {
    hero({ ...base, intro_video: { ...approved, identityVerified: false } });
    fireEvent.click(screen.getByTestId("intro-video-trigger"));
    await screen.findByTestId("intro-video-trust");
    expect(screen.queryByTestId("intro-video-verified-badge")).toBeNull();
  });

  it("records analytics locally without any network call", async () => {
    hero({ ...base, intro_video: approved });
    fireEvent.click(screen.getByTestId("intro-video-trigger"));
    await screen.findByTestId("intro-video-player");
    expect(getRecordedIntroVideoEvents().map((e) => e.event)).toContain(
      "provider_intro_video_opened",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
