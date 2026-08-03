import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Early Access — financial action guard.
 *
 * Verifies that `guardFinancialAction()` stops every money-moving handler
 * BEFORE any network request / Supabase RPC / edge-function call, and that
 * the same handlers run normally when Early Access is turned off.
 */

let earlyAccess = true;

vi.mock("@/config/launch", () => ({
  EARLY_ACCESS_COPY: {
    bannerTitle: "MyCleaner Early Access",
    bannerBody: "",
    lockedTitle: "Bookinger åbner snart",
    lockedBody: "",
    lockedCta: "Bookinger åbner snart",
  },
  get EARLY_ACCESS_MODE() {
    return earlyAccess;
  },
  isBookingLocked: () => earlyAccess,
  canPerformFinancialAction: () => !earlyAccess,
}));

const { guardFinancialAction } = await import("./BookingsOpenSoonDialog");

/** Stand-ins for the real backend clients — must never be called when locked. */
const invoke = vi.fn();
const rpc = vi.fn();

/** Handler factory mirroring the real wiring: guard first, then network. */
function makeHandler(run: () => void) {
  const onBlocked = vi.fn();
  const handler = () => {
    if (guardFinancialAction(onBlocked)) return;
    run();
  };
  return { handler, onBlocked };
}

const HANDLERS = {
  "provider accepterer booking": () => rpc("claim_booking_offer_v1"),
  "kunde bekræfter checkout/betaling": () => invoke("payment-create-intent"),
  "refundering": () => invoke("conversation-request-refund"),
  "payout / transfer": () => invoke("funds-release"),
  "frigivelse ved afsluttet opgave": () => invoke("booking-decide"),
} as const;

beforeEach(() => {
  invoke.mockClear();
  rpc.mockClear();
});

describe("Early Access ON — financial actions are blocked", () => {
  beforeEach(() => {
    earlyAccess = true;
  });

  for (const [name, run] of Object.entries(HANDLERS)) {
    it(`blokerer: ${name}`, () => {
      const { handler, onBlocked } = makeHandler(run);
      handler();
      expect(onBlocked).toHaveBeenCalledTimes(1);
      expect(invoke).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });
  }

  it("kalder hverken RPC eller edge function ved nogen blokeret handling", () => {
    for (const run of Object.values(HANDLERS)) makeHandler(run).handler();
    expect(invoke).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("guardFinancialAction returnerer true når låst", () => {
    expect(guardFinancialAction(() => {})).toBe(true);
  });
});

describe("Early Access OFF — normal funktionalitet bevares", () => {
  beforeEach(() => {
    earlyAccess = false;
  });

  for (const [name, run] of Object.entries(HANDLERS)) {
    it(`tillader: ${name}`, () => {
      const { handler, onBlocked } = makeHandler(run);
      handler();
      expect(onBlocked).not.toHaveBeenCalled();
      expect(invoke.mock.calls.length + rpc.mock.calls.length).toBe(1);
    });
  }

  it("guardFinancialAction returnerer false når åben", () => {
    expect(guardFinancialAction(() => {})).toBe(false);
  });
});
