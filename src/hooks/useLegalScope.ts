// Resolves the country/language scope used for legal document lookups.
import { useTranslation } from "react-i18next";
import { useCountry } from "@/i18n/CountryContext";

export function useLegalScope(): { country: string; language: string } {
  const { i18n } = useTranslation();
  let iso = "DK";
  try {
    const { country } = useCountry();
    iso = (country as { iso?: string } | null)?.iso ?? "DK";
  } catch {
    iso = "DK";
  }
  return { country: iso, language: (i18n.language || "da").slice(0, 2).toLowerCase() };
}
