/**
 * Footer contract regression test.
 *
 * Current (approved) contract — see the doc block in `Footer.tsx`:
 *  - The footer is NEVER rendered below 1024px (mobile + tablet), on ANY
 *    route. The node is fully removed from the DOM so no space is reserved
 *    and `MobileBottomNav` is the sole permanent bottom navigation.
 *  - At >=1024px (desktop) the footer renders on every route.
 *
 * The suite drives the real `window.innerWidth` instead of mocking a hook,
 * so it verifies the component's own breakpoint decision rather than an
 * indirection that the component no longer uses.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Footer from "./Footer";

const ORIGINAL_WIDTH = window.innerWidth;

/** Device widths from the responsive matrix under review. */
const BELOW_DESKTOP_WIDTHS = [320, 375, 390, 430, 768] as const;
const DESKTOP_WIDTHS = [1024, 1440] as const;

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

function renderFooter(path: string, width: number) {
  setViewport(width);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Footer />
    </MemoryRouter>,
  );
}

/** Routes rendered inside the mobile app shell. */
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

/** Static document routes outside the app shell. */
const publicDocumentRoutes = ["/faq", "/regler", "/privacy"];

describe("Footer contract", () => {
  afterEach(() => setViewport(ORIGINAL_WIDTH));

  describe.each(BELOW_DESKTOP_WIDTHS)("below desktop (%ipx)", (width) => {
    it.each([...mobileAppRoutes, ...publicDocumentRoutes])(
      "removes the footer from the DOM on %s",
      (path) => {
        const { container } = renderFooter(path, width);
        expect(container.querySelector("footer")).toBeNull();
      },
    );

    it("reserves no hidden height — nothing at all is rendered", () => {
      const { container } = renderFooter("/marketplace", width);
      expect(container.firstChild).toBeNull();
    });
  });

  describe.each(DESKTOP_WIDTHS)("desktop (%ipx)", (width) => {
    it.each([...mobileAppRoutes, ...publicDocumentRoutes])(
      "renders the footer on %s",
      (path) => {
        const { container } = renderFooter(path, width);
        expect(container.querySelector("footer")).not.toBeNull();
      },
    );

    it("exposes the legal and support links", () => {
      const { container } = renderFooter("/", width);
      const footer = container.querySelector("footer")!;
      const scope = within(footer);
      expect(scope.getByRole("link", { name: "Regler" })).toHaveAttribute("href", "/regler");
      expect(scope.getByRole("link", { name: "Privatlivspolitik" })).toHaveAttribute("href", "/regler");
      expect(scope.getByRole("link", { name: "Priser & regler" })).toHaveAttribute("href", "/regler");
      expect(scope.getByRole("link", { name: "Kontakt" })).toHaveAttribute(
        "href",
        "mailto:support@mycleaner.app",
      );
    });

    it("keeps every footer link reachable by keyboard", () => {
      const { container } = renderFooter("/", width);
      const footer = container.querySelector("footer")!;
      const links = Array.from(footer.querySelectorAll("a"));
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        // Anchors with href are natively focusable; a negative tabindex or a
        // missing href would silently remove them from the tab order.
        expect(link.getAttribute("href")).toBeTruthy();
        expect(link.getAttribute("tabindex")).not.toBe("-1");
      }
      const brand = within(footer).getByLabelText("MyCleaner – forside");
      expect(brand).toHaveAttribute("href", "/");
    });

    it("renders the four column headings exactly once each", () => {
      const { container } = renderFooter("/", width);
      const footer = container.querySelector("footer")!;
      const headings = Array.from(footer.querySelectorAll("h4")).map((h) => h.textContent);
      expect(headings).toEqual(["Platform", "For providere", "Support"]);
    });

    it("does not ship a parallel hidden mobile copy of the footer content", () => {
      const { container } = renderFooter("/", width);
      const footer = container.querySelector("footer")!;
      // A duplicated `hidden`/`md:hidden` mirror block would double the links.
      expect(footer.querySelectorAll('[class*="md:hidden"]')).toHaveLength(0);
      expect(footer.querySelectorAll("footer")).toHaveLength(0);
      const regler = within(footer).getAllByRole("link", { name: "Regler" });
      expect(regler).toHaveLength(1);
    });
  });
});
