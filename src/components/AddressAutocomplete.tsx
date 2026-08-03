import { useEffect, useMemo, useRef, useState, useCallback, KeyboardEvent } from "react";
import { MapPin, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  createSessionToken,
  suggestAddresses,
  SUGGEST_TYPES,
} from "@/lib/mapbox";
import { supabase } from "@/integrations/supabase/client";
import { dawaProvider, DawaUnavailableError } from "@/lib/address/dawa";
import { LruCache } from "@/lib/address/cache";
import { normalizeAddress, matchSpan } from "@/lib/address/normalize";
import type { AddressSuggestion, AddressSource } from "@/lib/address/types";
import { useTranslation } from "react-i18next";



/**
 * Shared session-wide LRU cache. Keyed by "<source>::<normalized-query>" so
 * DAWA and Google never collide, and the same normalization used by the
 * server dedupe check is used here — "sonder boulevard 18" and
 * "Sønder Boulevard 18" produce a single network call.
 */
const suggestionCache = new LruCache<AddressSuggestion[]>(200, 10 * 60 * 1000);

/** Known backend error codes → i18n key suffix. Anything else is generic. */
const ERROR_KEYS: Record<string, string> = {
  mapbox_unavailable: "unavailable",
  mapbox_retrieve_failed: "unavailable",
  mapbox_token_missing: "misconfigured",
  google_key_missing: "misconfigured",
  dawa_invalid_response: "unavailable",
  dawa_not_found: "notFound",
  invalid_place_id: "notFound",
  place_missing_country: "notFound",
};

function errorKey(code: string): string {
  return ERROR_KEYS[code] ?? "generic";
}

/**
 * `functions.invoke` collapses every non-2xx into the same opaque message, so
 * the real error code has to be read from the response body when present.
 */
async function readInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: { text?: () => Promise<string> } })?.context;
  if (ctx?.text) {
    try {
      const body = JSON.parse(await ctx.text());
      if (body?.error) return String(body.error);
    } catch {
      /* fall through to the generic code below */
    }
  }
  return (error as Error)?.message || "validation_failed";
}


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
  /**
   * `strict` (default) = house-level addresses only, required for a booking.
   * `broad` = also postcode / city / locality, used by the public search where
   * "2100" or "Berlin" is a perfectly good starting point.
   */
  scope?: "strict" | "broad";
};

export default function AddressAutocomplete({
  value, onChange, onSelect, onValidityChange, placeholder, autoFocus, countries = ["dk"], isValid,
  scope = "strict",
}: Props) {
  const { t } = useTranslation("common");
  const primaryCountry = (countries[0] || "dk").toLowerCase();
  // DAWA only knows Danish house-level addresses, so broad (postcode/city)
  // lookups always go through Mapbox — including in Denmark.
  const source: AddressSource =
    primaryCountry === "dk" && scope === "strict" ? "dawa" : "mapbox";

  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [noMatch, setNoMatch] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  /** Mapbox Search Box session: groups suggest calls with the final retrieve. */
  const sessionRef = useRef<string>(createSessionToken());
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listboxId = useMemo(() => `addr-listbox-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);


  const suggestViaMapbox = useCallback(
    async (q: string, signal?: AbortSignal): Promise<AddressSuggestion[]> => {
      const res = await suggestAddresses({
        query: q,
        sessionToken: sessionRef.current,
        countries,
        language: primaryCountry,
        types: scope === "broad" ? SUGGEST_TYPES.broad : SUGGEST_TYPES.strict,
        signal,
      });

      return res.map((s) => {
        const primary = s.name;
        const secondary = s.place_formatted ?? "";
        return {
          source: "mapbox" as const,
          ref: s.mapbox_id,
          primary,
          secondary,
          match: matchSpan(primary, q) ?? undefined,
        };
      });
    },
    [countries, primaryCountry, scope],
  );

  const runSuggest = useCallback(
    async (input: string) => {
      const q = input.trim();
      if (q.length < 2) {
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
          try {
            items = await dawaProvider.suggest(q, ctrl.signal);
          } catch (e: any) {
            if (e?.name === "AbortError" || ctrl.signal.aborted) return;
            if (e instanceof DawaUnavailableError) {
              // Automatic transparent fallback to Mapbox for this single
              // lookup. Next keystroke retries DAWA — we never mark the
              // provider as "sticky broken" so recovery is instant.
              console.warn(
                `[AddressAutocomplete] DAWA unavailable (${e.reason}${
                  e.status ? ` ${e.status}` : ""
                }) — falling back to Mapbox for query: ${q}`,
              );
              items = await suggestViaMapbox(q, ctrl.signal);
            } else {
              throw e;
            }
          }
        } else {
          items = await suggestViaMapbox(q, ctrl.signal);
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
        // A missing token or an unreachable Mapbox must not look like
        // "address not found" — tell the user the lookup service is down.
        if (e?.name === "MapboxConfigError") {
          setServerError(t("ui.addressAutocomplete.errors.misconfigured"));
        } else if (e?.name === "MapboxUnavailableError") {
          setServerError(t("ui.addressAutocomplete.errors.unavailable"));
        } else {
          setNoMatch(true);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [source, suggestViaMapbox, t],
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

    // Server-side validation is the source of truth: it re-fetches the address
    // from the provider (DAWA or Mapbox Search Box retrieve), stores a
    // place_validations row for signed-in users, and confirms the country
    // matches the profile so the DB trigger will accept the save. Guests get
    // the same coordinates back with `country_matches_profile === null`.
    try {
      const { data, error } = await supabase.functions.invoke("place-validate", {
        body: { place_id: s.ref, source: s.source, session_token: sessionRef.current },
      });

      const payloadError =
        (error ? await readInvokeError(error) : null) ??
        (data && data.ok !== true ? String(data.error ?? "validation_failed") : null);

      if (payloadError) {
        setServerError(t(`ui.addressAutocomplete.errors.${errorKey(payloadError)}`));
        onValidityChange?.(false);
        return;
      }

      if (data.country_matches_profile === false) {
        setServerError(
          t("ui.addressAutocomplete.errors.countryMismatch", {
            addressCountry: data.country_code,
            profileCountry: data.profile_country_code || "—",
          }),
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
      // A retrieve closes the Search Box session; start a fresh one.
      sessionRef.current = createSessionToken();

    } catch (e) {
      console.error("[AddressAutocomplete] place-validate failed", e);
      setServerError(t("ui.addressAutocomplete.errors.unavailable"));
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
        {loading && <Loader2 className="h-4 w-4 animate-spin opacity-60" aria-label={t("ui.addressAutocomplete.searching")} />}
        {!loading && isValid && (
          <CheckCircle2 className="h-4 w-4" style={{ color: "#168a7a" }} aria-label="Godkendt" />
        )}
      </div>

      {noMatch && value.trim().length >= 2 && (
        <div className="mt-2 flex items-start gap-2 text-sm" style={{ color: "#c2412c" }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <span className="font-bold">{t("ui.addressAutocomplete.notRecognized")}</span>
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
            <span className="font-bold">{t("ui.addressAutocomplete.notApproved")}</span>
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
            <span className="font-bold">{t("ui.addressAutocomplete.pickFromList")}</span>
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
