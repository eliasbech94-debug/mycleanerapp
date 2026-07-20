/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState, useCallback, KeyboardEvent } from "react";
import { MapPin, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { supabase } from "@/integrations/supabase/client";
import { dawaProvider, DawaUnavailableError } from "@/lib/address/dawa";
import { LruCache } from "@/lib/address/cache";
import { normalizeAddress, matchSpan } from "@/lib/address/normalize";
import type { AddressSuggestion, AddressSource } from "@/lib/address/types";


/**
 * Shared session-wide LRU cache. Keyed by "<source>::<normalized-query>" so
 * DAWA and Google never collide, and the same normalization used by the
 * server dedupe check is used here — "sonder boulevard 18" and
 * "Sønder Boulevard 18" produce a single network call.
 */
const suggestionCache = new LruCache<AddressSuggestion[]>(200, 10 * 60 * 1000);

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (place: { address: string; placeId: string; lat?: number; lng?: number }) => void;
  onValidityChange?: (valid: boolean) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** ISO country codes to bias the autocomplete. First entry decides provider (DK → DAWA). */
  countries?: string[];
  isValid?: boolean;
};

export default function AddressAutocomplete({
  value, onChange, onSelect, onValidityChange, placeholder, autoFocus, countries = ["dk"], isValid,
}: Props) {
  const primaryCountry = (countries[0] || "dk").toLowerCase();
  const source: AddressSource = primaryCountry === "dk" ? "dawa" : "google";

  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(source === "dawa"); // DAWA needs no boot
  const [noMatch, setNoMatch] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const googleSessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listboxId = useMemo(() => `addr-listbox-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    if (source !== "google") return;
    loadGoogleMaps()
      .then(async () => {
        const { AutocompleteSessionToken } = (await google.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        googleSessionRef.current = new AutocompleteSessionToken();
        setReady(true);
      })
      .catch((e) => console.warn("[AddressAutocomplete] google load failed:", e));
  }, [source]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const runSuggest = useCallback(
    async (input: string) => {
      const q = input.trim();
      if (!ready || q.length < 2) {
        setSuggestions([]);
        setNoMatch(false);
        setOpen(false);
        return;
      }
      const cacheKey = `${source}::${normalizeAddress(q)}`;
      const cached = suggestionCache.get(cacheKey);
      if (cached) {
        setSuggestions(cached);
        setNoMatch(cached.length === 0);
        setOpen(cached.length > 0);
        setHighlight(0);
        return;
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setNoMatch(false);
      try {
        let items: AddressSuggestion[] = [];
        if (source === "dawa") {
          items = await dawaProvider.suggest(q, ctrl.signal);
        } else {
          const { AutocompleteSuggestion } = (await google.maps.importLibrary(
            "places",
          )) as google.maps.PlacesLibrary;
          const { suggestions: res } =
            await AutocompleteSuggestion.fetchAutocompleteSuggestions({
              input: q,
              sessionToken: googleSessionRef.current!,
              includedRegionCodes: countries,
              language: primaryCountry,
            });
          items = (res || [])
            .map((s) => s.placePrediction)
            .filter(Boolean)
            .map((p: any) => {
              const primary = p.mainText?.text ?? p.text?.text ?? "";
              const secondary = p.secondaryText?.text ?? "";
              return {
                source: "google" as const,
                ref: p.placeId,
                primary,
                secondary,
                match: matchSpan(primary, q) ?? undefined,
              };
            });
        }
        if (ctrl.signal.aborted) return;
        suggestionCache.set(cacheKey, items);
        setSuggestions(items);
        setNoMatch(items.length === 0);
        setOpen(items.length > 0);
        setHighlight(0);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        console.warn("[AddressAutocomplete] suggest failed:", e);
        setNoMatch(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [ready, source, countries, primaryCountry],
  );

  function onInputChange(next: string) {
    onChange(next);
    onValidityChange?.(false);
    setServerError(null);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    // 200 ms debounce per plan.
    debounceRef.current = window.setTimeout(() => runSuggest(next), 200);
  }

  async function pick(s: AddressSuggestion) {
    const full = [s.primary, s.secondary].filter(Boolean).join(", ");
    onChange(full);
    setOpen(false);
    setSuggestions([]);
    setNoMatch(false);
    setServerError(null);
    onValidityChange?.(true);

    // Optimistic client-side coordinates (Google path only — DAWA gets them
    // authoritatively from the server round-trip below).
    if (s.source === "google") {
      try {
        const { Place } = (await google.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        const place = new Place({ id: s.ref });
        await place.fetchFields({ fields: ["location", "formattedAddress"] });
        onSelect?.({
          address: place.formattedAddress || full,
          placeId: s.ref,
          lat: place.location?.lat(),
          lng: place.location?.lng(),
        });
        const { AutocompleteSessionToken } = (await google.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        googleSessionRef.current = new AutocompleteSessionToken();
      } catch {
        onSelect?.({ address: full, placeId: s.ref });
      }
    }

    // Server-side validation is the source of truth: it re-fetches from the
    // provider, stores a place_validations row, and confirms the country
    // matches the user's profile so the DB trigger will accept the save.
    try {
      const { data, error } = await supabase.functions.invoke("place-validate", {
        body: { place_id: s.ref, source: s.source },
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
      onSelect?.({
        address: data.formatted_address,
        placeId: s.ref,
        lat: data.lat ?? undefined,
        lng: data.lng ?? undefined,
      });
    } catch {
      setServerError("Kunne ikke validere adressen på serveren. Prøv igen om lidt.");
      onValidityChange?.(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = suggestions[highlight];
      if (s) pick(s);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const borderColor = noMatch || (value.length > 3 && !isValid)
    ? "#c2412c"
    : isValid
    ? "#168a7a"
    : "#0a3d3a";

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
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && suggestions[highlight] ? `${listboxId}-opt-${highlight}` : undefined
          }
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder || "Indtast adresse"}
          className="w-full bg-transparent text-base focus:outline-none"
          autoComplete="off"
          inputMode="text"
          enterKeyHint="search"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin opacity-60" aria-label="Søger" />}
        {!loading && isValid && (
          <CheckCircle2 className="h-4 w-4" style={{ color: "#168a7a" }} aria-label="Godkendt" />
        )}
      </div>

      {noMatch && value.trim().length >= 2 && (
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
        <div role="alert" className="mt-2 flex items-start gap-2 text-sm" style={{ color: "#c2412c" }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <span className="font-bold">Adressen kunne ikke godkendes.</span>
            <div className="opacity-80">{serverError}</div>
          </div>
        </div>
      )}

      {!isValid && !noMatch && !serverError && !loading && value.trim().length >= 2 && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 flex items-start gap-2 text-sm"
          style={{ color: "#c2412c" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <span className="font-bold">Vælg en adresse fra listen.</span>
            <div className="opacity-80">
              Adressen er først gyldig, når du vælger et af forslagene.
            </div>
          </div>
        </div>
      )}

      {open && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border-2 bg-white py-1 shadow-[6px_6px_0_rgba(10,61,58,0.15)]"
          style={{ borderColor: "#0a3d3a" }}
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.source}-${s.ref}`}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === highlight}
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(s)}
                className={`flex w-full items-start gap-2 px-4 py-2.5 text-left ${
                  i === highlight ? "bg-[#f5f0e0]" : "hover:bg-[#f5f0e0]"
                }`}
              >
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 opacity-50" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold" style={{ color: "#0a3d3a" }}>
                    {renderHighlighted(s.primary, s.match)}
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

function renderHighlighted(text: string, span?: [number, number]) {
  if (!span) return text;
  const [a, b] = span;
  return (
    <>
      {text.slice(0, a)}
      <mark className="bg-transparent underline decoration-2 underline-offset-2">
        {text.slice(a, b)}
      </mark>
      {text.slice(b)}
    </>
  );
}
