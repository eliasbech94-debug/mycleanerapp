/**
 * AddressAutocomplete tests — DAWA-first, Mapbox for everything else.
 *
 * Denmark keeps DAWA as the authoritative provider; all other markets (and the
 * DK fallback when DAWA is down) now use the Mapbox Search Box API instead of
 * Google Places.
 *
 * Covered:
 *   - DK uses DAWA and does NOT call Mapbox on the happy path.
 *   - DK falls back to Mapbox when DAWA throws DawaUnavailableError.
 *   - Non-DK countries (SE, DE) go straight to Mapbox with the right country
 *     restriction.
 *   - Booking gate: unvalidated text stays blocked; picking a validated
 *     suggestion unlocks the Next button; editing after a pick re-locks it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useState } from "react";
import AddressAutocomplete from "./AddressAutocomplete";
import { dawaProvider, DawaUnavailableError } from "@/lib/address/dawa";
import { suggestAddresses } from "@/lib/mapbox";

// ---- Mocks ----------------------------------------------------------------

vi.mock("@/lib/mapbox", () => ({
  createSessionToken: () => "test-session-token",
  MAPBOX_STYLE: "mapbox://styles/mapbox/streets-v12",
  getMapboxToken: () => "pk.test",
  SUGGEST_TYPES: { strict: "address", broad: "address,street,postcode,place,locality" },
  suggestAddresses: vi.fn(),
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
const mapboxSpy = vi.mocked(suggestAddresses);

const suggestionForCountry: Record<string, unknown[]> = {
  se: [{ mapbox_id: "se-1", name: "Kungsgatan 1", place_formatted: "111 43 Stockholm, Sverige" }],
  de: [{ mapbox_id: "de-1", name: "Alexanderplatz 1", place_formatted: "10178 Berlin, Deutschland" }],
  // Used only by the DAWA→Mapbox fallback test.
  dk: [{ mapbox_id: "dk-fallback-1", name: "Nørrebrogade 1", place_formatted: "2200 København N, Danmark" }],
};

beforeEach(() => {
  dawaSpy.mockReset();
  mapboxSpy.mockReset();
  mapboxSpy.mockImplementation(async (args: any) => {
    const country = (args.countries?.[0] || "dk").toLowerCase();
    return (suggestionForCountry[country] ?? []) as any;
  });
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

/**
 * findByText can't match text that the `<mark>` highlight splits into sibling
 * nodes ("Alex</mark>anderplatz 1"). Match on the option's combined textContent
 * instead so both DAWA and Mapbox paths pass with the same assertion.
 */
async function findOptionByText(needle: string): Promise<HTMLElement> {
  return await waitFor(() => {
    const options = screen.getAllByRole("option");
    const hit = options.find((o) => (o.textContent || "").includes(needle));
    if (!hit) throw new Error(`option containing "${needle}" not found`);
    // The clickable element is the <button> inside the <li role="option">.
    const btn = hit.querySelector("button");
    return (btn ?? hit) as HTMLElement;
  });
}
function queryOptionByText(needle: string): HTMLElement | null {
  const options = screen.queryAllByRole("option");
  return options.find((o) => (o.textContent || "").includes(needle)) ?? null;
}

// ---- Tests ----------------------------------------------------------------

describe("AddressAutocomplete — DK uses DAWA (primary)", () => {
  it("calls DAWA and does NOT call Mapbox on the DK happy path", async () => {
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
    expect(mapboxSpy).not.toHaveBeenCalled();
    expect(await findOptionByText("Nørrebrogade 1")).toBeInTheDocument();
  });

  it("falls back to Mapbox when DAWA is unavailable", async () => {
    dawaSpy.mockRejectedValueOnce(
      new DawaUnavailableError("dawa_fallback_503", "server_error", 503),
    );
    render(<AddressAutocomplete value="" onChange={() => {}} countries={["dk"]} />);
    await typeAddress("FallbackStreet");
    await waitFor(() => expect(mapboxSpy).toHaveBeenCalled());
    expect(mapboxSpy.mock.calls[0][0].countries).toEqual(["dk"]);
    expect(await findOptionByText("Nørrebrogade 1")).toBeInTheDocument();
  });
});

describe("AddressAutocomplete — non-DK countries use Mapbox", () => {
  it("passes countries=['se'] to Mapbox for Swedish users", async () => {
    render(<AddressAutocomplete value="" onChange={() => {}} countries={["se"]} />);
    await typeAddress("Kungs");
    await waitFor(() => expect(mapboxSpy).toHaveBeenCalled());
    expect(mapboxSpy.mock.calls[0][0].countries).toEqual(["se"]);
    expect(dawaSpy).not.toHaveBeenCalled();
    expect(await findOptionByText("Kungsgatan 1")).toBeInTheDocument();
  });

  it("passes countries=['de'] to Mapbox for German users", async () => {
    render(<AddressAutocomplete value="" onChange={() => {}} countries={["de"]} />);
    await typeAddress("Alex");
    await waitFor(() => expect(mapboxSpy).toHaveBeenCalled());
    expect(mapboxSpy.mock.calls.at(-1)![0].countries).toEqual(["de"]);
    expect(await findOptionByText("Alexanderplatz 1")).toBeInTheDocument();
    expect(queryOptionByText("Kungsgatan 1")).not.toBeInTheDocument();
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
      { source: "dawa", ref: "dawa-pick", primary: "Amagerbrogade 7", secondary: "2300 København S" },
    ]);
    render(<BookingGateHarness />);
    const next = screen.getByTestId("next") as HTMLButtonElement;
    await typeAddress("Amagerbro");
    const suggestion = await findOptionByText("Amagerbrogade 7");
    expect(next).toBeDisabled();
    await act(async () => {
      fireEvent.click(suggestion);
    });
    await waitFor(() => expect(next).not.toBeDisabled());
  });

  it("re-locks Next if the user edits the address after picking", async () => {
    dawaSpy.mockResolvedValue([
      { source: "dawa", ref: "dawa-relock", primary: "Frederiksberg Allé 5", secondary: "1820 Frederiksberg C" },
    ]);
    render(<BookingGateHarness />);
    const next = screen.getByTestId("next") as HTMLButtonElement;
    await typeAddress("Frederiksberg Al");
    const suggestion = await findOptionByText("Frederiksberg Allé 5");
    await act(async () => {
      fireEvent.click(suggestion);
    });
    await waitFor(() => expect(next).not.toBeDisabled());
    fireEvent.change(screen.getByPlaceholderText(/Indtast adresse/i), {
      target: { value: "Frederiksberg Allé 5 (etage 3)" },
    });
    expect(next).toBeDisabled();
  });
});
