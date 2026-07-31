import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FirstJobCelebrationDialog from "./FirstJobCelebrationDialog";
import {
  parseFirstJobPopupState,
  shouldShowFirstJobPopup,
} from "./firstJobPopupState";

const tracked: string[] = [];
vi.mock("@/lib/analytics", () => ({
  trackEvent: (event: string) => {
    tracked.push(event);
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

beforeEach(() => {
  tracked.length = 0;
  cleanup();
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
});

describe("firstJobPopupState", () => {
  it("only shows for providers with an eligible, unseen state", () => {
    const state = parseFirstJobPopupState({ eligible: true, booking_id: "b1", seen_at: null });
    expect(shouldShowFirstJobPopup(state, true)).toBe(true);
    expect(shouldShowFirstJobPopup(state, false)).toBe(false);
  });

  it("never shows again once seen (other device / after login)", () => {
    const seen = parseFirstJobPopupState({ eligible: false, seen_at: "2026-07-31T10:00:00Z" });
    expect(shouldShowFirstJobPopup(seen, true)).toBe(false);
  });

  it("does not show without a completed paid booking", () => {
    expect(shouldShowFirstJobPopup(parseFirstJobPopupState({ eligible: false }), true)).toBe(false);
    expect(shouldShowFirstJobPopup(parseFirstJobPopupState(null), true)).toBe(false);
    expect(shouldShowFirstJobPopup(parseFirstJobPopupState({ eligible: true }), true)).toBe(false);
  });
});

describe("FirstJobCelebrationDialog", () => {
  it("renders an accessible dialog with celebration copy and both CTAs", () => {
    render(<FirstJobCelebrationDialog open bookingId="b1" onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("🎉 Tillykke!")).toBeTruthy();
    expect(screen.getByText("Fortsæt til dashboard")).toBeTruthy();
    expect(tracked).toContain("first_job_popup_opened");
  });

  it("plays muted, inline, without loop and with metadata preload", () => {
    render(<FirstJobCelebrationDialog open onClose={vi.fn()} />);
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.loop).toBe(false);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.getAttribute("src")).toContain("mycleaner-first-job.mp4");
  });

  it("shows a replay button after the video ends and tracks completion", () => {
    render(<FirstJobCelebrationDialog open onClose={vi.fn()} />);
    const video = document.querySelector("video") as HTMLVideoElement;
    fireEvent.ended(video);
    expect(tracked).toContain("first_job_video_completed");
    expect(screen.getByText("Se igen")).toBeTruthy();
  });

  it("still renders the popup when the video fails to load", () => {
    render(<FirstJobCelebrationDialog open onClose={vi.fn()} />);
    fireEvent.error(document.querySelector("video") as HTMLVideoElement);
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByText("Fortsæt til dashboard")).toBeTruthy();
  });

  it("tracks and reports the dashboard CTA", () => {
    const onClose = vi.fn();
    render(<FirstJobCelebrationDialog open onClose={onClose} />);
    fireEvent.click(screen.getByText("Fortsæt til dashboard"));
    expect(onClose).toHaveBeenCalledWith("dashboard");
    expect(tracked).toContain("first_job_dashboard_clicked");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<FirstJobCelebrationDialog open onClose={onClose} />);
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledWith("close");
    expect(tracked).toContain("first_job_popup_closed");
  });
});
