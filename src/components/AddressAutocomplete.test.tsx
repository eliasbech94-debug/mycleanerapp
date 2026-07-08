import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useState } from "react";
import AddressAutocomplete from "./AddressAutocomplete";

async function flushReady() {
  // Let the component's useEffect run loadGoogleMaps() → importLibrary() → setReady(true)
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

// --- Mock the Google Maps loader ---
vi.mock("@/lib/googleMaps", () => ({
  loadGoogleMaps: vi.fn(() => Promise.resolve()),
}));

// --- Track calls to the Places API ---
const fetchSuggestionsSpy = vi.fn();

const suggestionForCountry: Record<string, any[]> = {
  dk: [
    {
      placePrediction: {
        placeId: "dk-1",
        mainText: { text: "Nørrebrogade 1" },
        secondaryText: { text: "2200 København N, Danmark" },
      },
    },
  ],
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
  fetchSuggestionsSpy.mockReset();
  const g: any = {
    maps: {
      importLibrary: vi.fn(async () => ({
        AutocompleteSessionToken: FakeSessionToken,
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: (args: any) => {
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
  (globalThis as any).google = g;
  (window as any).google = g;
});

describe("AddressAutocomplete — country restriction", () => {
  it("passes countries=['dk'] to Google Places (Danish user)", async () => {
    render(
      <AddressAutocomplete value="" onChange={() => {}} countries={["dk"]} />,
    );
    const input = screen.getByPlaceholderText(/Indtast adresse/i);
    fireEvent.change(input, { target: { value: "Nørrebro" } });
    await waitFor(() => expect(fetchSuggestionsSpy).toHaveBeenCalled());
    expect(fetchSuggestionsSpy.mock.calls[0][0].includedRegionCodes).toEqual([
      "dk",
    ]);
    expect(await screen.findByText("Nørrebrogade 1")).toBeInTheDocument();
  });

  it("passes countries=['se'] when user's country_code is SE", async () => {
    render(
      <AddressAutocomplete value="" onChange={() => {}} countries={["se"]} />,
    );
    const input = screen.getByPlaceholderText(/Indtast adresse/i);
    fireEvent.change(input, { target: { value: "Kungs" } });
    await waitFor(() => expect(fetchSuggestionsSpy).toHaveBeenCalled());
    expect(fetchSuggestionsSpy.mock.calls[0][0].includedRegionCodes).toEqual([
      "se",
    ]);
    // Only Swedish results — no Danish leak
    expect(await screen.findByText("Kungsgatan 1")).toBeInTheDocument();
    expect(screen.queryByText("Nørrebrogade 1")).not.toBeInTheDocument();
  });

  it("does not leak results from other countries when switching country_code", async () => {
    const { rerender } = render(
      <AddressAutocomplete value="" onChange={() => {}} countries={["de"]} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Indtast adresse/i), {
      target: { value: "Alex" },
    });
    await waitFor(() => expect(fetchSuggestionsSpy).toHaveBeenCalled());
    expect(fetchSuggestionsSpy.mock.calls.at(-1)![0].includedRegionCodes).toEqual([
      "de",
    ]);
    expect(await screen.findByText("Alexanderplatz 1")).toBeInTheDocument();
    expect(screen.queryByText("Nørrebrogade 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Kungsgatan 1")).not.toBeInTheDocument();

    rerender(
      <AddressAutocomplete value="" onChange={() => {}} countries={["dk"]} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Indtast adresse/i), {
      target: { value: "Nørrebro" },
    });
    await waitFor(() =>
      expect(fetchSuggestionsSpy.mock.calls.at(-1)![0].includedRegionCodes).toEqual([
        "dk",
      ]),
    );
    expect(await screen.findByText("Nørrebrogade 1")).toBeInTheDocument();
    expect(screen.queryByText("Alexanderplatz 1")).not.toBeInTheDocument();
  });
});

/**
 * Mini-harness that mirrors the booking flow gate:
 * `canNext = addressValid`. The "Næste" button is disabled until the user
 * picks a suggestion from the dropdown.
 */
function BookingGateHarness({ country = "dk" }: { country?: string }) {
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
        countries={[country]}
      />
      <button type="button" disabled={!addressValid} data-testid="next">
        Næste
      </button>
    </div>
  );
}

describe("Booking flow gate — cannot continue without a picked suggestion", () => {
  it("keeps the Next button disabled while user only types", async () => {
    render(<BookingGateHarness />);
    const next = screen.getByTestId("next") as HTMLButtonElement;
    expect(next).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Indtast adresse/i), {
      target: { value: "Nørrebrogade 1" },
    });
    await waitFor(() => expect(fetchSuggestionsSpy).toHaveBeenCalled());
    // Just typing must not unlock the button — only picking a suggestion does.
    expect(next).toBeDisabled();
  });

  it("enables the Next button only after picking a suggestion from the dropdown", async () => {
    render(<BookingGateHarness />);
    const next = screen.getByTestId("next") as HTMLButtonElement;

    fireEvent.change(screen.getByPlaceholderText(/Indtast adresse/i), {
      target: { value: "Nørrebrogade" },
    });
    const suggestion = await screen.findByText("Nørrebrogade 1");
    expect(next).toBeDisabled();

    await act(async () => {
      fireEvent.click(suggestion);
    });

    await waitFor(() => expect(next).not.toBeDisabled());
  });

  it("re-locks the Next button if the user edits the address after picking", async () => {
    render(<BookingGateHarness />);
    const next = screen.getByTestId("next") as HTMLButtonElement;

    fireEvent.change(screen.getByPlaceholderText(/Indtast adresse/i), {
      target: { value: "Nørrebrogade" },
    });
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
