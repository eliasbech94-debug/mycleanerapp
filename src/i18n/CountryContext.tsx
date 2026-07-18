// Country context. Deterministic resolver, valid URL controls current browse
// context; unknown URL country → controlled redirect (never silently falls
// back to a different country). Marketplace country is separate from UI
// language — a user may browse SE in EN or DK in ES.
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import i18n, { getStoredLanguage, isManualLanguage, SupportedLanguage } from "./index";

export const SUPPORTED_COUNTRIES = ["DK", "GB", "SE", "ES"] as const;
export type CountryISO = typeof SUPPORTED_COUNTRIES[number];

export function isValidCountryParam(p?: string): p is Lowercase<CountryISO> {
  return !!p && (SUPPORTED_COUNTRIES as readonly string[]).includes(p.toUpperCase());
}

export interface CountryPublic {
  iso: CountryISO;
  active: boolean;
  launch_status: "development" | "beta" | "launch_ready" | "active";
  default_language: SupportedLanguage;
  supported_languages: SupportedLanguage[];
  currency: string;
  timezone: string;
  booking_public: Record<string, unknown>;
  payment_methods_public: string[];
  contact_public: Record<string, string>;
  feature_availability_public: Record<string, boolean>;
  legal_references_public: string[];
}

interface CountryContextValue {
  country: CountryPublic | null;
  countries: CountryPublic[];
  loading: boolean;
  setCountryManual: (iso: CountryISO) => void;
}

const Ctx = createContext<CountryContextValue | null>(null);

const COUNTRY_MANUAL_KEY = "mc.country.manual";
const COUNTRY_CHOICE_KEY = "mc.country.choice";

function getStoredCountry(): CountryISO | null {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(COUNTRY_CHOICE_KEY) : null;
  return (SUPPORTED_COUNTRIES as readonly string[]).includes(v ?? "") ? (v as CountryISO) : null;
}
function isCountryManual() {
  return typeof localStorage !== "undefined" && localStorage.getItem(COUNTRY_MANUAL_KEY) === "true";
}

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const [countries, setCountries] = useState<CountryPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const { country: urlCountry } = useParams<{ country?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("country_configs_public").select("*");
      if (!error && data) setCountries(data as unknown as CountryPublic[]);
      setLoading(false);
    })();
  }, []);

  // Determine active country by deterministic priority
  const country = useMemo<CountryPublic | null>(() => {
    if (countries.length === 0) return null;
    const byIso = (iso?: string | null) =>
      iso ? countries.find(c => c.iso === iso.toUpperCase()) ?? null : null;

    // 1. Manual explicit country choice — but URL may still override for this page
    if (urlCountry && isValidCountryParam(urlCountry)) {
      return byIso(urlCountry);
    }
    // 2. Manual saved preference
    if (isCountryManual()) {
      const m = byIso(getStoredCountry());
      if (m) return m;
    }
    // 3. Fallback: DK (default marketplace)
    return byIso("DK");
  }, [countries, urlCountry]);

  // Unknown country in URL → controlled 404 redirect (never silent fallback)
  useEffect(() => {
    if (loading) return;
    if (urlCountry && !isValidCountryParam(urlCountry)) {
      navigate("/not-found", { replace: true });
    }
  }, [urlCountry, loading, navigate]);

  // Apply country's default language ONLY when no manual language exists AND no stored preference
  useEffect(() => {
    if (!country) return;
    if (isManualLanguage()) return;
    if (getStoredLanguage()) return;
    if (i18n.language !== country.default_language) {
      void i18n.changeLanguage(country.default_language);
    }
  }, [country]);

  const setCountryManual = (iso: CountryISO) => {
    localStorage.setItem(COUNTRY_CHOICE_KEY, iso);
    localStorage.setItem(COUNTRY_MANUAL_KEY, "true");
    // Navigate to the same route under the new country prefix
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] && isValidCountryParam(parts[0])) parts[0] = iso.toLowerCase();
    else parts.unshift(iso.toLowerCase());
    navigate("/" + parts.join("/"), { replace: true });
  };

  return (
    <Ctx.Provider value={{ country, countries, loading, setCountryManual }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCountry() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCountry must be used inside <CountryProvider>");
  return v;
}
