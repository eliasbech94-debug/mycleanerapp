/**
 * Footer contract regression test.
 *
 * Enforces the central rule: on any route inside `MobileAppShell` at
 * viewports <768px, the website Footer is NOT rendered (node absent from
 * the DOM). At >=768px the Footer renders on every route. Non-app
 * public routes render the Footer at every viewport.
 *
 * This suite deliberately mocks `useIsMobileApp` — the hook itself has
 * dedicated unit tests. Here we assert the Footer component honours the
 * hook's decision without any per-page CSS hack.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Footer from "./Footer";

vi.mock("@/hooks/useIsMobileApp", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useIsMobileApp")>(
    "@/hooks/useIsMobileApp",
  );
  return { ...actual, useIsMobileApp: vi.fn() };
});
import { useIsMobileApp } from "@/hooks/useIsMobileApp";

const useIsMobileAppMock = useIsMobileApp as unknown as ReturnType<typeof vi.fn>;

function renderFooter(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Footer />
    </MemoryRouter>,
  );
}

describe("Footer contract", () => {
  beforeEach(() => useIsMobileAppMock.mockReset());

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
    // country-prefixed variants
    "/dk/marketplace",
    "/gb/inbox",
    "/se/profil",
    "/es/founding-cleaner",
  ];

  it.each(mobileAppRoutes)(
    "removes the footer from the DOM on mobile-app route %s (<768px)",
    (path) => {
      useIsMobileAppMock.mockReturnValue(true);
      const { container } = renderFooter(path);
      expect(container.querySelector("footer")).toBeNull();
    },
  );

  it.each(mobileAppRoutes)(
    "renders the footer on mobile-app route %s at >=768px",
    (path) => {
      // >=768px viewports never trigger useIsMobileApp → false
      useIsMobileAppMock.mockReturnValue(false);
      const { container } = renderFooter(path);
      expect(container.querySelector("footer")).not.toBeNull();
    },
  );

  it("renders the footer on non-app public routes at every viewport", () => {
    useIsMobileAppMock.mockReturnValue(false);
    for (const path of ["/faq", "/regler", "/privacy"]) {
      const { container, unmount } = renderFooter(path);
      expect(container.querySelector("footer")).not.toBeNull();
      unmount();
    }
  });

  it("does not reserve any hidden footer height when suppressed", () => {
    useIsMobileAppMock.mockReturnValue(true);
    const { container } = renderFooter("/marketplace");
    // Nothing rendered at all — no wrapper divs, no hidden node.
    expect(container.firstChild).toBeNull();
  });
});
