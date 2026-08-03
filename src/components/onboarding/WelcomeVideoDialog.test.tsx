import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import WelcomeVideoDialog from "./WelcomeVideoDialog";

const tracked: string[] = [];
vi.mock("@/lib/analytics", () => ({
  trackEvent: (event: string) => { tracked.push(event); },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

beforeEach(() => {
  tracked.length = 0;
  cleanup();
  // jsdom has no media playback
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
});

describe("WelcomeVideoDialog", () => {
  it("renders an accessible dialog with title, body and CTAs", () => {
    render(<WelcomeVideoDialog open audience="customer" onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByText("Velkommen til MyCleaner 🎉")).toBeTruthy();
    expect(screen.getByText("welcome_video.cta_customer")).toBeTruthy();
    expect(screen.getByText("Spring over")).toBeTruthy();
    expect(tracked).toContain("welcome_video_opened");
  });

  it("shows provider copy for providers", () => {
    render(<WelcomeVideoDialog open audience="provider" onClose={vi.fn()} />);
    expect(screen.getByText("welcome_video.cta_provider")).toBeTruthy();
  });

  it("autoplays muted and playsInline", () => {
    render(<WelcomeVideoDialog open audience="customer" onClose={vi.fn()} />);
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.getAttribute("playsinline")).not.toBeNull();
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.hasAttribute("loop")).toBe(false);
    expect(video.getAttribute("poster")).toContain("mycleaner-welcome-poster");
  });

  it("reports the close reason for X, skip and CTA", () => {
    const onClose = vi.fn();
    render(<WelcomeVideoDialog open audience="customer" onClose={onClose} />);
    fireEvent.click(screen.getByText("Spring over"));
    expect(onClose).toHaveBeenCalledWith("skip");
    expect(tracked).toContain("welcome_video_skipped");

    onClose.mockClear();
    fireEvent.click(screen.getByText("welcome_video.cta_customer"));
    expect(onClose).toHaveBeenCalledWith("cta");
    expect(tracked).toContain("welcome_video_cta_clicked");

    onClose.mockClear();
    fireEvent.click(screen.getByLabelText("Luk"));
    expect(onClose).toHaveBeenCalledWith("close");
    expect(tracked).toContain("welcome_video_closed");
  });

  it("toggles sound and offers replay after the video ends", () => {
    render(<WelcomeVideoDialog open audience="customer" onClose={vi.fn()} />);
    const video = document.querySelector("video") as HTMLVideoElement;
    fireEvent.click(screen.getByLabelText("Slå lyd til"));
    expect(video.muted).toBe(false);

    expect(screen.queryByText("Se igen")).toBeNull();
    fireEvent.playing(video!);
    fireEvent.ended(video!);
    expect(tracked).toContain("welcome_video_started");
    expect(tracked).toContain("welcome_video_completed");
    expect(screen.getByText("Se igen")).toBeTruthy();
  });

  it("keeps title, body and CTA usable when the video fails to load", () => {
    render(<WelcomeVideoDialog open audience="customer" onClose={vi.fn()} />);
    fireEvent.error(document.querySelector("video") as HTMLVideoElement);
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByText("Velkommen til MyCleaner 🎉")).toBeTruthy();
    expect(screen.getByText("welcome_video.cta_customer")).toBeTruthy();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<WelcomeVideoDialog open audience="customer" onClose={onClose} />);
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledWith("close");
  });
});
