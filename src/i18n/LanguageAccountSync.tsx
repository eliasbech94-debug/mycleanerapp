/**
 * Account-level language persistence.
 *
 * Resolution order (documented in src/i18n/index.ts):
 *   1. Signed-in account preference  (profiles.ui_language, set manually)
 *   2. Local manual choice           (localStorage, pre-login)
 *   3. Country default / browser locale
 *
 * Mount once, inside <AuthProvider>. It has no UI.
 *
 * Behaviour:
 *  - On sign-in, an explicit account preference is applied and mirrored into
 *    localStorage, so the choice follows the user across devices.
 *  - If the user picked a language before signing in and the account has no
 *    preference yet, that local choice is written to the account.
 *  - Every later manual change is written back to the account.
 *
 * Never writes on behalf of an anonymous visitor, and never persists a
 * language that was merely auto-detected — only explicit choices.
 */
import { useEffect, useRef } from "react";
import i18n, {
  SUPPORTED_LANGUAGES,
  getStoredLanguage,
  isManualLanguage,
  applyAccountLanguage,
  type SupportedLanguage,
} from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const isSupported = (v: unknown): v is SupportedLanguage =>
  typeof v === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);

export function LanguageAccountSync() {
  const { user } = useAuth();
  const hydratedFor = useRef<string | null>(null);

  // 1. Pull the account preference once per signed-in user.
  useEffect(() => {
    if (!user) {
      hydratedFor.current = null;
      return;
    }
    if (hydratedFor.current === user.id) return;
    hydratedFor.current = user.id;

    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("ui_language, language_manual")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || error) return;

      const accountLang = data?.ui_language?.slice(0, 2).toLowerCase();
      if (data?.language_manual && isSupported(accountLang)) {
        applyAccountLanguage(accountLang);
        return;
      }

      // No account preference yet — adopt the pre-login choice if there is one.
      const local = getStoredLanguage();
      if (isManualLanguage() && local) {
        await supabase
          .from("profiles")
          .update({ ui_language: local, language_manual: true })
          .eq("id", user.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // 2. Push every later explicit change back to the account.
  useEffect(() => {
    if (!user) return;
    const onChange = (lng: string) => {
      const lang = lng.slice(0, 2).toLowerCase();
      if (!isSupported(lang)) return;
      if (!isManualLanguage()) return; // auto-detected — not a user decision
      void supabase
        .from("profiles")
        .update({ ui_language: lang, language_manual: true })
        .eq("id", user.id);
    };
    i18n.on("languageChanged", onChange);
    return () => {
      i18n.off("languageChanged", onChange);
    };
  }, [user]);

  return null;
}
