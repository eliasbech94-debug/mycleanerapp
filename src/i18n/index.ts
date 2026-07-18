// i18n bootstrap. Custom deterministic detector — NEVER overrides an explicit
// manual choice, URL choice, or saved authenticated preference. Order enforced
// explicitly, no auto-magic behaviour from i18next-browser-languagedetector.
import i18n from "i18next";
import HttpBackend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

export const SUPPORTED_LANGUAGES = ["da", "en", "sv", "es"] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = "en";

const NAMESPACES = ["common", "booking", "finance", "admin", "legal", "provider", "customer"] as const;

const MANUAL_KEY = "mc.language.manual"; // "true" once the user picked one explicitly
const CHOICE_KEY = "mc.language.choice";

export function getStoredLanguage(): SupportedLanguage | null {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(CHOICE_KEY) : null;
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(v ?? "") ? (v as SupportedLanguage) : null;
}

export function isManualLanguage(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(MANUAL_KEY) === "true";
}

/** Explicit user choice — locks out any future auto-detection. */
export function setManualLanguage(lng: SupportedLanguage) {
  localStorage.setItem(CHOICE_KEY, lng);
  localStorage.setItem(MANUAL_KEY, "true");
  void i18n.changeLanguage(lng);
}

function browserLanguage(): SupportedLanguage | null {
  const raw = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2).toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(raw) ? (raw as SupportedLanguage) : null;
}

/** Deterministic resolver. Higher priorities win. */
export function resolveInitialLanguage(input?: {
  urlCountryDefaultLang?: SupportedLanguage | null;
  profileLanguage?: SupportedLanguage | null;
}): SupportedLanguage {
  // 1. explicit manual choice (once locked in, nothing else may override)
  if (isManualLanguage()) {
    const s = getStoredLanguage();
    if (s) return s;
  }
  // 2. saved authenticated preference (only when no manual override exists)
  if (input?.profileLanguage) return input.profileLanguage;
  // 3. country-URL default language
  if (input?.urlCountryDefaultLang) return input.urlCountryDefaultLang;
  // 4. browser locale
  const b = browserLanguage();
  if (b) return b;
  // 5. fallback
  return FALLBACK_LANGUAGE;
}

let started = false;
export async function initI18n() {
  if (started) return i18n;
  started = true;
  await i18n
    .use(HttpBackend)
    .use(initReactI18next)
    .init({
      lng: resolveInitialLanguage(),
      fallbackLng: FALLBACK_LANGUAGE,
      supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
      ns: NAMESPACES as unknown as string[],
      defaultNS: "common",
      load: "languageOnly",
      interpolation: { escapeValue: false }, // React already escapes
      react: { useSuspense: false },
      backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
      returnNull: false,
    });
  return i18n;
}

export default i18n;
