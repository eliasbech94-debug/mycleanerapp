/**
 * Account-level language persistence and Crisp support chat synchronisation.
 *
 * Mount once inside <AuthProvider> and <BrowserRouter>. It has no UI.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import i18n, {
  SUPPORTED_LANGUAGES,
  getStoredLanguage,
  isManualLanguage,
  applyAccountLanguage,
  type SupportedLanguage,
} from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const CRISP_WEBSITE_ID = "d4985742-38fc-490b-828c-a0e682a45990";
const CRISP_SCRIPT_ID = "mycleaner-crisp-chat";
const CRISP_HIDDEN_ROUTES = [/^\/admin(?:\/|$)/, /^\/support(?:\/|$)/, /^\/employee(?:\/|$)/];

type CrispCommand = ["set" | "do" | "on" | "off" | "config", string, unknown?];

declare global {
  interface Window {
    $crisp?: CrispCommand[];
    CRISP_WEBSITE_ID?: string;
    CRISP_RUNTIME_CONFIG?: { locale?: string };
  }
}

const crispPush = (command: CrispCommand) => {
  window.$crisp = window.$crisp || [];
  window.$crisp.push(command);
};

const normalizeCrispLocale = (lng: string): string => {
  const lang = lng.slice(0, 2).toLowerCase();
  return lang === "sv" ? "sv" : lang === "de" ? "de" : lang === "es" ? "es" : lang === "da" ? "da" : "en";
};

const isSupported = (v: unknown): v is SupportedLanguage =>
  typeof v === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);

export function LanguageAccountSync() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const hydratedFor = useRef<string | null>(null);
  const crispUserId = useRef<string | null>(null);

  // Load Crisp once. The queue accepts commands before the remote script is ready.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.$crisp = window.$crisp || [];
    window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
    window.CRISP_RUNTIME_CONFIG = {
      ...(window.CRISP_RUNTIME_CONFIG || {}),
      locale: normalizeCrispLocale(i18n.resolvedLanguage || i18n.language || "en"),
    };

    if (!document.getElementById(CRISP_SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = CRISP_SCRIPT_ID;
      script.src = "https://client.crisp.chat/l.js";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }
  }, []);

  // Keep the widget off internal staff surfaces, while showing it everywhere public.
  useEffect(() => {
    const hidden = CRISP_HIDDEN_ROUTES.some((pattern) => pattern.test(location.pathname));
    crispPush(["do", hidden ? "chat:hide" : "chat:show"]);
    if (!hidden) {
      crispPush(["set", "session:data", [["current_path", `${location.pathname}${location.search}`]]]);
    }
  }, [location.pathname, location.search]);

  // Attach authenticated customer/provider context. Reset on logout or account switch.
  useEffect(() => {
    const nextUserId = user?.id ?? null;
    if (crispUserId.current && crispUserId.current !== nextUserId) {
      crispPush(["do", "session:reset"]);
    }
    crispUserId.current = nextUserId;

    if (!user) return;

    if (user.email) crispPush(["set", "user:email", [user.email]]);
    if (profile?.full_name) crispPush(["set", "user:nickname", [profile.full_name]]);
    if (profile?.phone) crispPush(["set", "user:phone", [profile.phone]]);

    crispPush([
      "set",
      "session:data",
      [[
        ["mycleaner_user_id", user.id],
        ["account_type", profile?.provider_id ? "provider" : "customer"],
        ["country", profile?.country_code || "unknown"],
      ]],
    ]);
    crispPush(["set", "session:segments", [[profile?.provider_id ? "provider" : "customer"]]]);
  }, [user?.id, user?.email, profile?.full_name, profile?.phone, profile?.provider_id, profile?.country_code]);

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

  // 2. Push every later explicit change back to the account and tag Crisp with it.
  useEffect(() => {
    const onChange = (lng: string) => {
      const lang = lng.slice(0, 2).toLowerCase();
      crispPush(["set", "session:data", [["language", normalizeCrispLocale(lang)]]]);
      if (!user || !isSupported(lang) || !isManualLanguage()) return;
      void supabase
        .from("profiles")
        .update({ ui_language: lang, language_manual: true })
        .eq("id", user.id);
    };
    i18n.on("languageChanged", onChange);
    onChange(i18n.resolvedLanguage || i18n.language || "en");
    return () => {
      i18n.off("languageChanged", onChange);
    };
  }, [user]);

  return null;
}
