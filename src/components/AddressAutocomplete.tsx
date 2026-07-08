/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { supabase } from "@/integrations/supabase/client";

type Suggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (place: { address: string; placeId: string; lat?: number; lng?: number }) => void;
  onValidityChange?: (valid: boolean) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** ISO country codes to bias the autocomplete (e.g. ["dk"]). */
  countries?: string[];
  /** Visuel valideringsstatus. */
  isValid?: boolean;
};

export default function AddressAutocomplete({
  value, onChange, onSelect, onValidityChange, placeholder, autoFocus, countries = ["dk"], isValid,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [noMatch, setNoMatch] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const prevInputRef = useRef<string>("");

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
      setNoMatch(false);
      return;
    }
    setNoMatch(false);
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
        setOpen(items.length > 0);
        setNoMatch(items.length === 0);
      } catch (e) {
        console.warn("[AddressAutocomplete] suggest failed:", e);
        setNoMatch(true);
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
    setNoMatch(false);
    setServerError(null);
    // Optimistically mark valid; the server call below is the source of truth
    // and will flip validity back to false on country mismatch or error.
    onValidityChange?.(true);

    // Kick off the client-side Places details fetch (for immediate lat/lng)
    // and the server-side validation in parallel.
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
      const { AutocompleteSessionToken } = (await google.maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      sessionRef.current = new AutocompleteSessionToken();
    } catch (e) {
      onSelect?.({ address: full, placeId: s.placeId });
    }

    // Server-side validation: registers a place_validations row so the DB
    // trigger will accept the save, and confirms the country matches the
    // user's profile country_code. On mismatch the address is locked out.
    try {
      const { data, error } = await supabase.functions.invoke("place-validate", {
        body: { place_id: s.placeId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "validation_failed");
      if (data.country_matches_profile === false) {
        setServerError(
          `Denne adresse ligger i ${data.country_code}, men din profil er sat til ${data.profile_country_code || "et andet land"}. Vælg en adresse i dit land, eller opdater dit land i profilen.`,
        );
        onValidityChange?.(false);
        return;
      }
      // Server returned the authoritative address — apply it.
      onSelect?.({
        address: data.formatted_address,
        placeId: s.placeId,
        lat: data.lat ?? undefined,
        lng: data.lng ?? undefined,
      });
    } catch (e: any) {
      setServerError(
        "Kunne ikke validere adressen på serveren. Prøv igen om lidt.",
      );
      onValidityChange?.(false);
    }
  }

  const borderColor = noMatch || (value.length > 3 && !isValid)
    ? "#c2412c"   // rød
    : isValid
    ? "#168a7a"   // teal
    : "#0a3d3a";  // ink

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 transition-colors"
        style={{ borderColor }}
      >
        <MapPin className="h-4 w-4 opacity-60" style={{ color: borderColor }} />
        <input
          autoFocus={autoFocus}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onValidityChange?.(false);
            setServerError(null);
            fetchSuggestions(e.target.value);
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder || "Indtast adresse"}
          className="w-full bg-transparent text-base focus:outline-none"
          autoComplete="off"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin opacity-60" />}
        {!loading && isValid && (
          <CheckCircle2 className="h-4 w-4" style={{ color: "#168a7a" }} />
        )}
      </div>

      {noMatch && value.trim().length >= 3 && (
        <div className="mt-2 flex items-start gap-2 text-sm" style={{ color: "#c2412c" }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <span className="font-bold">Vi kunne ikke genkende denne adresse.</span>
            <div className="opacity-80">
              Vælg en adresse fra listen, så vi sikrer at den kan findes af din cleaner.
            </div>
          </div>
        </div>
      )}

      {serverError && (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 text-sm"
          style={{ color: "#c2412c" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <span className="font-bold">Adressen kunne ikke godkendes.</span>
            <div className="opacity-80">{serverError}</div>
          </div>
        </div>
      )}

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
