import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StagingBanner } from "./StagingBanner";

/**
 * <StagingBanner /> must appear ONLY when VITE_APP_ENV==="staging".
 * Vite replaces import.meta.env.* at transform time, so we use
 * vi.stubEnv which vitest hooks into that same replacement.
 */
describe("<StagingBanner />", () => {
  afterEach(() => { vi.unstubAllEnvs(); cleanup(); });

  it("renders when VITE_APP_ENV === 'staging'", () => {
    vi.stubEnv("VITE_APP_ENV", "staging");
    render(<StagingBanner />);
    const el = screen.getByTestId("staging-banner");
    expect(el).toBeTruthy();
    expect(el.getAttribute("role")).toBe("status");
    expect(el.textContent).toMatch(/STAGING/i);
  });

  it("does NOT render in production", () => {
    vi.stubEnv("VITE_APP_ENV", "production");
    const { container } = render(<StagingBanner />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByTestId("staging-banner")).toBeNull();
  });

  it("does NOT render when VITE_APP_ENV is undefined (default prod build)", () => {
    vi.stubEnv("VITE_APP_ENV", "");
    const { container } = render(<StagingBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("does NOT render for dev/test/preview/near-miss values (only exact match wins)", () => {
    for (const v of ["development", "test", "preview", "STAGING", "stg", " staging "]) {
      vi.stubEnv("VITE_APP_ENV", v);
      const { container, unmount } = render(<StagingBanner />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });
});
