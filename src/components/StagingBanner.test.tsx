import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mockable env accessor — swapped per test.
vi.mock("@/lib/appEnv", () => ({ getAppEnv: vi.fn(() => undefined) }));
import { getAppEnv } from "@/lib/appEnv";
import { StagingBanner } from "./StagingBanner";

/**
 * <StagingBanner /> must appear ONLY when VITE_APP_ENV==="staging".
 */
describe("<StagingBanner />", () => {
  afterEach(() => { cleanup(); vi.mocked(getAppEnv).mockReset(); });

  it("renders when VITE_APP_ENV === 'staging'", () => {
    vi.mocked(getAppEnv).mockReturnValue("staging");
    render(<StagingBanner />);
    const el = screen.getByTestId("staging-banner");
    expect(el).toBeTruthy();
    expect(el.getAttribute("role")).toBe("status");
    expect(el.textContent).toMatch(/STAGING/i);
  });

  it("does NOT render in production", () => {
    vi.mocked(getAppEnv).mockReturnValue("production");
    const { container } = render(<StagingBanner />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByTestId("staging-banner")).toBeNull();
  });

  it("does NOT render when VITE_APP_ENV is undefined (default prod build)", () => {
    vi.mocked(getAppEnv).mockReturnValue(undefined);
    const { container } = render(<StagingBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("does NOT render for dev/test/preview/near-miss values (only exact match wins)", () => {
    for (const v of ["development", "test", "preview", "STAGING", "stg", " staging "]) {
      vi.mocked(getAppEnv).mockReturnValue(v);
      const { container, unmount } = render(<StagingBanner />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });
});
