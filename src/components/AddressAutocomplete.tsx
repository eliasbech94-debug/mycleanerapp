import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { loadGoogleMaps } from "@/lib/googleMaps";

type Suggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (place: { address: string; placeId: string; lat?: number; lng?: number }) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** ISO country codes to bias the autocomplete (e.g. ["dk"]). */
  countries?: string[];
};

export default function AddressAutocomplete({
  value, onChange, onSelect, placeholder, autoFocus, countries = ["dk"],
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadGoogleMaps()
      .then(async () => {
        await google.maps.importLibrary("places");
        const { AutocompleteSessionToken } = (await google.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        sessionRef.current = new AutocompleteSessionToken();
        setReady(true);
      })
      .catch((e) => console.warn("[AddressAutocomplete] load failed:", e));
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function fetchSuggestions(input: string) {
    if (!ready || input.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        setLoading(true);
        const { AutocompleteSuggestion } = (await google.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        const { suggestions: res } =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            sessionToken: sessionRef.current!,
            includedRegionCodes: countries,
            language: "da",
          });
        const items: Suggestion[] = (res || [])
          .map((s) => s.placePrediction)
          .filter(Boolean)
          .map((p: any) => ({
            placeId: p.placeId,
            primary: p.mainText?.text ?? p.text?.text ?? "",
            secondary: p.secondaryText?.text ?? "",
          }));
        setSuggestions(items);
        setOpen(true);
      } catch (e) {
        console.warn("[AddressAutocomplete] suggest failed:", e);
      } finally {
        setLoading(false);
      }
    }, 200);
  }

  async function pick(s: Suggestion) {
    const full = [s.primary, s.secondary].filter(Boolean).join(", ");
    onChange(full);
    setOpen(false);
    setSuggestions([]);
    try {
      const { Place } = (await google.maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      const place = new Place({ id: s.placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      onSelect?.({
        address: place.formattedAddress || full,
        placeId: s.placeId,
        lat: place.location?.lat(),
        lng: place.location?.lng(),
      });
      // Start a fresh session after a selection
      const { AutocompleteSessionToken } = (await google.maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      sessionRef.current = new AutocompleteSessionToken();
    } catch (e) {
      onSelect?.({ address: full, placeId: s.placeId });
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 opacity-60" />
        <input
          autoFocus={autoFocus}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            fetchSuggestions(e.target.value);
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder || "Indtast adresse"}
          className="w-full bg-transparent text-base focus:outline-none"
          autoComplete="off"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin opacity-60" />}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border-2 bg-white py-1 shadow-[6px_6px_0_rgba(10,61,58,0.15)]"
          style={{ borderColor: "#0a3d3a" }}
        >
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-[#f5f0e0]"
              >
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 opacity-50" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold" style={{ color: "#0a3d3a" }}>
                    {s.primary}
                  </div>
                  {s.secondary && (
                    <div className="truncate text-xs opacity-60">{s.secondary}</div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
