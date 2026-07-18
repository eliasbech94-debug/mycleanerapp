// Country + language selector. Two independent controls: changing language
// never changes marketplace country, and vice versa. Country change during
// checkout is guarded by an in-context confirm dialog handled by the caller.
import { useCountry, SUPPORTED_COUNTRIES, type CountryISO } from "@/i18n/CountryContext";
import { setManualLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CountryLanguageSelector({ onCountryChange }: { onCountryChange?: (iso: CountryISO) => void }) {
  const { country, setCountryManual } = useCountry();
  const { t, i18n } = useTranslation("common");

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="country-select">{t("country.label")}</label>
      <Select
        value={country?.iso ?? "DK"}
        onValueChange={(v) => {
          const iso = v as CountryISO;
          if (onCountryChange) onCountryChange(iso);
          else setCountryManual(iso);
        }}
      >
        <SelectTrigger id="country-select" aria-label={t("country.label")} className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_COUNTRIES.map((iso) => (
            <SelectItem key={iso} value={iso}>{t(`country.${iso}`)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="sr-only" htmlFor="lang-select">{t("language.label")}</label>
      <Select
        value={(i18n.language?.slice(0, 2) as SupportedLanguage) ?? "en"}
        onValueChange={(v) => setManualLanguage(v as SupportedLanguage)}
      >
        <SelectTrigger id="lang-select" aria-label={t("language.label")} className="w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LANGUAGES.map((l) => (
            <SelectItem key={l} value={l}>{t(`language.${l}`)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
