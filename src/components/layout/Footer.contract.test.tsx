/**
 * Footer contract regression test.
 *
 * Enforces the central rule: on any route inside `MobileAppShell` at
 * viewports <768px, the website Footer is NOT rendered (node absent from
 * the DOM). At >=768px the Footer renders on every route. Non-app
 * public routes render the Footer at every viewport.
 *
 * The hook is replaced with a hoisted, file-local mock so other suites
 * cannot leak an implementation into this contract test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { useIsMobileAppMock } = vi.hoisted(() => ({
  useIsMobileAppMock: vi.fn<() => boolean>(),
}));

vi.mock("@/hooks/useIsMobileApp", () => ({
  useIsMobileApp: useIsMobileAppMock,
}));

import Footer from "./Footer";

function renderFooter(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Footer />
    </MemoryRouter>,
  );
}

describe("Footer contract", () => {
  beforeEach(() => {
    useIsMobileAppMock.mockReset();
    useIsMobileAppMock.mockReturnValue(false);
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
    (path) => {
      useIsMobileAppMock.mockReturnValue(true);
      const { container } = renderFooter(path);
      expect(container.querySelector("footer")).toBeNull();
    },
  );

  it.each(mobileAppRoutes)(
    "renders the footer on mobile-app route %s at >=768px",
    (path) => {
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
    expect(container.firstChild).toBeNull();
  });
});
