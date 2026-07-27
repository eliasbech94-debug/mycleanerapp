import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Lookup = { postal_code: string; city: string; country_code: string; lat?: number | null; lng?: number | null };

export function PostalCodeCityField({
  countryCode,
  postalCode,
  city,
  onResolved,
}: {
  countryCode: string;
  postalCode: string;
  city: string;
  onResolved: (place: Lookup) => void;
}) {
  const [input, setInput] = useState(postalCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);

  useEffect(() => setInput(postalCode), [postalCode]);

  useEffect(() => {
    const normalized = input.trim().toUpperCase();
    if (normalized.length < 3 || (normalized === postalCode && city)) return;
    const id = ++request.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const { data, error: invokeError } = await supabase.functions.invoke<Lookup & { error?: string }>("postal-lookup", {
        body: { country_code: countryCode, postal_code: normalized },
      });
      if (id !== request.current) return;
      setLoading(false);
      if (invokeError || !data?.city) {
        setError("Postnummeret kunne ikke findes");
        return;
      }
      onResolved(data);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [input, countryCode, postalCode, city, onResolved]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider opacity-70">Postnummer</span>
        <div className="relative">
          <input
            value={input}
            inputMode={countryCode === "UK" ? "text" : "numeric"}
            autoComplete="postal-code"
            className="min-h-11 w-full rounded-lg border bg-white px-3 py-2 pr-10 uppercase"
            onChange={(event) => {
              setInput(event.target.value);
              setError("");
            }}
            aria-invalid={!!error}
            aria-describedby="postcode-status"
          />
          {loading ? <Loader2 className="absolute right-3 top-3 h-5 w-5 animate-spin opacity-50" /> : null}
        </div>
        <span id="postcode-status" className={`mt-1 block text-xs ${error ? "text-red-700" : "opacity-60"}`} aria-live="polite">
          {error || "Byen findes automatisk"}
        </span>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider opacity-70">By</span>
        <div className="relative">
          <input
            value={city}
            readOnly
            tabIndex={-1}
            className="min-h-11 w-full rounded-lg border bg-black/[0.04] px-3 py-2 pr-10"
            placeholder="Udfyldes automatisk"
            aria-label="Valideret by"
          />
          {city ? <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-[#168a7a]" /> : <MapPin className="absolute right-3 top-3 h-5 w-5 opacity-35" />}
        </div>
      </label>
    </div>
  );
}
