/**
 * AddressAutocomplete tests — updated for the DAWA-first architecture.
 *
 * Why the previous six assertions were stale:
 *   1. "passes countries=['dk'] to Google Places (Danish user)":
 *      Denmark no longer uses Google at all on the happy path — DAWA is the
 *      primary provider for DK, so `fetchAutocompleteSuggestions` is never
 *      called. The correct DK assertion is that DAWA is hit and Google is not.
 *   2. "does not leak results from other countries when switching country_code"
 *      relied on Google returning the DK suggestion; after the rewrite the DK
 *      leg goes through DAWA, so the mocked Google spy is silent on the DK
 *      re-render and the old cross-country assertion becomes meaningless.
 *   3. "keeps the Next button disabled while user only types" (DK harness) —
 *      typing "Nørrebrogade 1" now issues a DAWA fetch, not a Google fetch,
 *      so waiting on the Google spy timed out even though the component
 *      behaved correctly.
 *   4. "enables the Next button only after picking a suggestion" — same root
 *      cause: the fake suggestion list was seeded via the Google mock, but
 *      DAWA delivers the DK list now, so the dropdown never rendered.
 *   5. "re-locks the Next button if the user edits after picking" — same DK
 *      pathway; the pick step never happened because the mocked Google list
 *      was never rendered.
 *   6. The old suite had zero coverage for the automatic DAWA→Google fallback
 *      that ships in the current component, so a regression there would go
 *      unnoticed.
 *
 * The new suite covers:
 *   - DK uses DAWA and does NOT call Google on the happy path.
 *   - DK falls back to Google when DAWA throws DawaUnavailableError.
 *   - Non-DK countries (SE, DE) go straight to Google with the correct
 *     `includedRegionCodes` restriction.
 *   - Booking gate: unvalidated text stays blocked; picking a validated
 *     suggestion unlocks the Next button; editing after a pick re-locks it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useState } from "react";
import AddressAutocomplete from "./AddressAutocomplete";
import { dawaProvider, DawaUnavailableError } from "@/lib/address/dawa";

// ---- Mocks ----------------------------------------------------------------

vi.mock("@/lib/googleMaps", () => ({
  loadGoogleMaps: vi.fn(() => Promise.resolve()),
}));

// Stub the Supabase edge-function invoke so pick() resolves without a network
// round-trip. Every pick is treated as a successfully validated address.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async () => ({
        data: {
          ok: true,
          formatted_address: "Nørrebrogade 1, 2200 København N",
          country_code: "DK",
          country_matches_profile: true,
          lat: 55.6944,
          lng: 12.5522,
        },
        error: null,
      })),
    },
  },
}));

// Spy on DAWA calls so we can assert DK is DAWA-first.
const dawaSpy = vi.spyOn(dawaProvider, "suggest");

// Google Places mock — tracks whether it was invoked so DK-happy-path tests
// can prove Google was NOT called.
const fetchSuggestionsSpy = vi.fn();
const suggestionForCountry: Record<string, unknown[]> = {
  se: [
    {
      placePrediction: {
        placeId: "se-1",
        mainText: { text: "Kungsgatan 1" },
        secondaryText: { text: "111 43 Stockholm, Sverige" },
      },
    },
  ],
  de: [
    {
      placePrediction: {
        placeId: "de-1",
        mainText: { text: "Alexanderplatz 1" },
        secondaryText: { text: "10178 Berlin, Deutschland" },
      },
    },
  ],
  // Used only by the DAWA→Google fallback test.
  dk: [
    {
      placePrediction: {
        placeId: "dk-google-fallback-1",
        mainText: { text: "Nørrebrogade 1" },
        secondaryText: { text: "2200 København N, Danmark" },
      },
    },
  ],
};

class FakeSessionToken {}
class FakePlace {
  id: string;
  formattedAddress = "Nørrebrogade 1, 2200 København N, Danmark";
  location = { lat: () => 55.6944, lng: () => 12.5522 };
  constructor(opts: { id: string }) {
    this.id = opts.id;
  }
  async fetchFields() {
    /* no-op */
  }
}

beforeEach(() => {
  dawaSpy.mockReset();
  fetchSuggestionsSpy.mockReset();
  const g = {
    maps: {
      importLibrary: vi.fn(async () => ({
        AutocompleteSessionToken: FakeSessionToken,
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: (args: { includedRegionCodes?: string[] }) => {
            fetchSuggestionsSpy(args);
            const country = (args.includedRegionCodes?.[0] || "dk").toLowerCase();
            return Promise.resolve({
              suggestions: suggestionForCountry[country] ?? [],
            });
          },
        },
        Place: FakePlace,
      })),
    },
  };
  (globalThis as unknown as { google: unknown }).google = g;
  (window as unknown as { google: unknown }).google = g;
});

async function flushReady() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}
async function typeAddress(value: string) {
  await flushReady();
  const input = screen.getByPlaceholderText(/Indtast adresse/i);
  fireEvent.change(input, { target: { value } });
  return input;
}

// ---- Tests ----------------------------------------------------------------

describe("AddressAutocomplete — DK uses DAWA (primary)", () => {
  it("calls DAWA and does NOT call Google on the DK happy path", async () => {
    dawaSpy.mockResolvedValueOnce([
      {
        source: "dawa",
        ref: "dawa-1",
        primary: "Nørrebrogade 1",
        secondary: "2200 København N",
      },
    ]);
    render(<AddressAutocomplete value="" onChange={() => {}} countries={["dk"]} />);
    await typeAddress("Nørrebro");
    await waitFor(() => expect(dawaSpy).toHaveBeenCalled());
    expect(fetchSuggestionsSpy).not.toHaveBeenCalled();
    expect(await screen.findByText("Nørrebrogade 1")).toBeInTheDocument();
  });

  it("falls back to Google Places when DAWA is unavailable", async () => {
    dawaSpy.mockRejectedValueOnce(
      new DawaUnavailableError("dawa_503", "server_error", 503),
    );
    render(<AddressAutocomplete value="" onChange={() => {}} countries={["dk"]} />);
    await typeAddress("Nørrebro");
    await waitFor(() => expect(fetchSuggestionsSpy).toHaveBeenCalled());
    expect(fetchSuggestionsSpy.mock.calls[0][0].includedRegionCodes).toEqual([
      "dk",
    ]);
    expect(await screen.findByText("Nørrebrogade 1")).toBeInTheDocument();
  });
});

describe("AddressAutocomplete — non-DK countries use Google", () => {
  it("passes countries=['se'] to Google Places for Swedish users", async () => {
    render(<AddressAutocomplete value="" onChange={() => {}} countries={["se"]} />);
    await typeAddress("Kungs");
    await waitFor(() => expect(fetchSuggestionsSpy).toHaveBeenCalled());
    expect(fetchSuggestionsSpy.mock.calls[0][0].includedRegionCodes).toEqual([
      "se",
    ]);
    expect(dawaSpy).not.toHaveBeenCalled();
    expect(await screen.findByText("Kungsgatan 1")).toBeInTheDocument();
  });

  it("passes countries=['de'] to Google Places for German users", async () => {
    render(<AddressAutocomplete value="" onChange={() => {}} countries={["de"]} />);
    await typeAddress("Alex");
    await waitFor(() => expect(fetchSuggestionsSpy).toHaveBeenCalled());
    expect(fetchSuggestionsSpy.mock.calls.at(-1)![0].includedRegionCodes).toEqual([
      "de",
    ]);
    expect(await screen.findByText("Alexanderplatz 1")).toBeInTheDocument();
    expect(screen.queryByText("Kungsgatan 1")).not.toBeInTheDocument();
  });
});

/**
 * Mini-harness that mirrors the booking flow gate: "Næste" is disabled until
 * the address is server-validated. Uses DK (DAWA) as the primary path.
 */
function BookingGateHarness() {
  const [address, setAddress] = useState("");
  const [addressValid, setAddressValid] = useState(false);
  return (
    <div>
      <AddressAutocomplete
        value={address}
        onChange={(v) => {
          setAddress(v);
          setAddressValid(false);
        }}
        onSelect={() => setAddressValid(true)}
        onValidityChange={setAddressValid}
        isValid={addressValid}
        countries={["dk"]}
      />
      <button type="button" disabled={!addressValid} data-testid="next">
        Næste
      </button>
    </div>
  );
}

describe("Booking flow gate — DAWA validation is required", () => {
  it("keeps Next disabled while the user only types free text", async () => {
    dawaSpy.mockResolvedValueOnce([
      { source: "dawa", ref: "dawa-1", primary: "Nørrebrogade 1", secondary: "2200 København N" },
    ]);
    render(<BookingGateHarness />);
    const next = screen.getByTestId("next") as HTMLButtonElement;
    expect(next).toBeDisabled();
    await typeAddress("Nørrebrogade 1");
    await waitFor(() => expect(dawaSpy).toHaveBeenCalled());
    expect(next).toBeDisabled();
  });

  it("enables Next only after picking a validated DAWA suggestion", async () => {
    dawaSpy.mockResolvedValueOnce([
      { source: "dawa", ref: "dawa-1", primary: "Nørrebrogade 1", secondary: "2200 København N" },
    ]);
    render(<BookingGateHarness />);
    const next = screen.getByTestId("next") as HTMLButtonElement;
    await typeAddress("Nørrebrogade");
    const suggestion = await screen.findByText("Nørrebrogade 1");
    expect(next).toBeDisabled();
    await act(async () => {
      fireEvent.click(suggestion);
    });
    await waitFor(() => expect(next).not.toBeDisabled());
  });

  it("re-locks Next if the user edits the address after picking", async () => {
    dawaSpy.mockResolvedValue([
      { source: "dawa", ref: "dawa-1", primary: "Nørrebrogade 1", secondary: "2200 København N" },
    ]);
    render(<BookingGateHarness />);
    const next = screen.getByTestId("next") as HTMLButtonElement;
    await typeAddress("Nørrebrogade");
    const suggestion = await screen.findByText("Nørrebrogade 1");
    await act(async () => {
      fireEvent.click(suggestion);
    });
    await waitFor(() => expect(next).not.toBeDisabled());
    fireEvent.change(screen.getByPlaceholderText(/Indtast adresse/i), {
      target: { value: "Nørrebrogade 1 (etage 3)" },
    });
    expect(next).toBeDisabled();
  });
});
