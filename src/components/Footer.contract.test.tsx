/**
 * Footer contract regression test.
 *
 * Verifies the real useIsMobileApp hook against route and viewport changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Footer from "./Footer";

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

function installMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: window.innerWidth < 768,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderFooter(path: string, width: number) {
  setViewport(width);
  installMatchMedia();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Footer />
    </MemoryRouter>,
  );
}

describe("Footer contract", () => {
  beforeEach(() => {
    setViewport(1024);
    installMatchMedia();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mobileAppRoutes = [
    "/",
    "/marketplace",
    "/mine-bookinger",
    "/customer/bookings",
    "/inbox",
    "/inbox/abc-123",
    "/profil",
    "/founding-cleaner",
    "/p/some-slug",
    "/find-cleaner",
    "/dk/marketplace",
    "/gb/inbox",
    "/se/profil",
    "/es/founding-cleaner",
  ];

  it.each(mobileAppRoutes)(
    "removes the footer from the DOM on mobile-app route %s (<768px)",
    async (path) => {
      const { container } = renderFooter(path, 390);
      await waitFor(() => expect(container.querySelector("footer")).toBeNull());
    },
  );

  it.each(mobileAppRoutes)(
    "renders the footer on mobile-app route %s at >=768px",
    async (path) => {
      const { container } = renderFooter(path, 1024);
      await waitFor(() => expect(container.querySelector("footer")).not.toBeNull());
    },
  );

  it("renders the footer on non-app public routes at every viewport", async () => {
    for (const path of ["/faq", "/regler", "/privacy"]) {
      const { container, unmount } = renderFooter(path, 390);
      await waitFor(() => expect(container.querySelector("footer")).not.toBeNull());
      unmount();
    }
  });

  it("does not reserve any hidden footer height when suppressed", async () => {
    const { container } = renderFooter("/marketplace", 390);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
