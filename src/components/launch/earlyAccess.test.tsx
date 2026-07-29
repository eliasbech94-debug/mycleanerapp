import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EARLY_ACCESS_MODE, isBookingLocked, canPerformFinancialAction } from "@/config/launch";
import EarlyAccessBanner from "@/components/launch/EarlyAccessBanner";
import EarlyAccessRouteGuard from "@/components/launch/EarlyAccessRouteGuard";

describe("Early Access mode", () => {
  it("is enabled for the 1. august launch", () => {
    expect(EARLY_ACCESS_MODE).toBe(true);
    expect(isBookingLocked()).toBe(true);
  });

  it("disables all financial actions", () => {
    expect(canPerformFinancialAction()).toBe(false);
  });

  it("renders the Early Access banner with the approved copy", () => {
    render(<EarlyAccessBanner />);
    expect(screen.getByTestId("early-access-banner")).toBeTruthy();
    expect(screen.getByText("MyCleaner Early Access")).toBeTruthy();
    expect(
      screen.getByText(
        "Opret din profil og bliv en af de første på platformen. Bookinger åbner snart.",
      ),
    ).toBeTruthy();
  });

  it("never calls the platform 'beta'", () => {
    render(<EarlyAccessBanner />);
    expect(screen.getByTestId("early-access-banner").textContent?.toLowerCase()).not.toContain("beta");
  });

  it("blocks direct navigation to checkout and never mounts the payment flow", () => {
    const paymentIntent = vi.fn();
    function FakeCheckout() {
      paymentIntent();
      return <div data-testid="checkout" />;
    }

    render(
      <MemoryRouter>
        <EarlyAccessRouteGuard>
          <FakeCheckout />
        </EarlyAccessRouteGuard>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("early-access-blocked")).toBeTruthy();
    expect(screen.getByText("Bookinger åbner snart")).toBeTruthy();
    expect(screen.queryByTestId("checkout")).toBeNull();
    expect(paymentIntent).not.toHaveBeenCalled();
  });
});

describe("Booking CTA guard", () => {
  beforeEach(() => vi.resetModules());

  it("shows the dialog instead of starting checkout while locked", async () => {
    const { useBookingLockDialog, BookingsOpenSoonDialog } = await import(
      "@/components/launch/BookingsOpenSoonDialog"
    );
    const action = vi.fn();

    function Cta() {
      const { open, setOpen, guard } = useBookingLockDialog();
      return (
        <>
          <button type="button" onClick={() => guard(action)}>
            Book nu
          </button>
          <BookingsOpenSoonDialog open={open} onOpenChange={setOpen} />
        </>
      );
    }

    render(<Cta />);
    fireEvent.click(screen.getByText("Book nu"));
    expect(action).not.toHaveBeenCalled();
    expect(await screen.findByTestId("bookings-open-soon-dialog")).toBeTruthy();
  });

  it("keeps normal booking behaviour when Early Access is disabled", async () => {
    vi.doMock("@/config/launch", () => ({
      EARLY_ACCESS_MODE: false,
      EARLY_ACCESS_COPY: {
        bannerTitle: "MyCleaner Early Access",
        bannerBody: "…",
        lockedTitle: "Bookinger åbner snart",
        lockedBody: "…",
        lockedCta: "Bookinger åbner snart",
      },
      isBookingLocked: () => false,
      canPerformFinancialAction: () => true,
    }));

    const { useBookingLockDialog } = await import("@/components/launch/BookingsOpenSoonDialog");
    const { EarlyAccessRouteGuard: Guard } = await import(
      "@/components/launch/EarlyAccessRouteGuard"
    );
    const action = vi.fn();

    function Cta() {
      const { guard } = useBookingLockDialog();
      return (
        <button type="button" onClick={() => guard(action)}>
          Book nu
        </button>
      );
    }

    render(
      <MemoryRouter>
        <Guard>
          <div data-testid="checkout" />
        </Guard>
        <Cta />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("Book nu"));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("checkout")).toBeTruthy();
    vi.doUnmock("@/config/launch");
  });
});

describe("Signup and onboarding stay open in Early Access", () => {
  it("does not guard signup, login or provider onboarding routes", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/App.tsx", "utf8"),
    );
    const guarded = src
      .split("\n")
      .filter((l) => l.includes("EarlyAccessRouteGuard") && l.includes("<Route"));

    // Only the money routes are guarded.
    expect(guarded.length).toBe(2);
    expect(guarded.every((l) => l.includes('path="/book'))).toBe(true);

    for (const open of ["/login", "/bliv-cleaner", "/customer/register", "/provider/profile"]) {
      const line = src.split("\n").find((l) => l.includes(`path="${open}"`));
      expect(line, `route ${open} must exist`).toBeTruthy();
      expect(line).not.toContain("EarlyAccessRouteGuard");
    }
  });
});
