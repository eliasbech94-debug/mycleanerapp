import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StagingBanner } from "./StagingBanner";

/**
 * <StagingBanner /> must appear ONLY when VITE_APP_ENV==="staging".
 * These tests stub import.meta.env for each render.
 */

function withEnv(value: string | undefined, fn: () => void) {
  const meta = import.meta as any;
  const prev = meta.env?.VITE_APP_ENV;
  meta.env = { ...(meta.env ?? {}), VITE_APP_ENV: value };
  try { fn(); } finally { meta.env.VITE_APP_ENV = prev; }
}

describe("<StagingBanner />", () => {
  afterEach(() => cleanup());

  it("renders when VITE_APP_ENV === 'staging'", () => {
    withEnv("staging", () => {
      render(<StagingBanner />);
      const el = screen.getByTestId("staging-banner");
      expect(el).toBeTruthy();
      expect(el.getAttribute("role")).toBe("status");
      expect(el.textContent).toMatch(/STAGING/i);
    });
  });

  it("does NOT render in production (VITE_APP_ENV === 'production')", () => {
    withEnv("production", () => {
      const { container } = render(<StagingBanner />);
      expect(container.innerHTML).toBe("");
      expect(screen.queryByTestId("staging-banner")).toBeNull();
    });
  });

  it("does NOT render when VITE_APP_ENV is undefined (default prod build)", () => {
    withEnv(undefined, () => {
      const { container } = render(<StagingBanner />);
      expect(container.innerHTML).toBe("");
    });
  });

  it("does NOT render for dev/test/preview values (only exact match wins)", () => {
    for (const v of ["development", "test", "preview", "STAGING", "stg", " staging "]) {
      withEnv(v, () => {
        const { container, unmount } = render(<StagingBanner />);
        expect(container.innerHTML).toBe("");
        unmount();
      });
    }
  });
});
