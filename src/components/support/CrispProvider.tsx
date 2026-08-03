import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
  identifyCrispUser,
  loadCrisp,
  crispPush,
  crispTokenId,
  resetCrispSession,
  setCrispPage,
} from "@/lib/crisp";

/**
 * Mounts Crisp app-wide in *hidden* mode.
 *
 * The floating bubble is never rendered (see `loadCrisp` + the
 * `.crisp-client` display rule in index.css). This provider only exists so
 * the session carries identity and context; the visible chat is embedded in
 * the Support Center.
 */
export function CrispProvider() {
  const { user, profile } = useAuth();
  const { roles } = useUserRoles();
  const { i18n } = useTranslation();
  const { pathname } = useLocation();

  useEffect(() => {
    loadCrisp({ locale: i18n.language?.slice(0, 2) ?? "da", tokenId: crispTokenId(user?.id) });
    crispPush(["do", "chat:hide"]);
  }, [i18n.language, user?.id]);

  useEffect(() => {
    if (!user) {
      // Signing out must not leak the previous user's history into a shared device.
      resetCrispSession();
      return;
    }
    identifyCrispUser({
      userId: user.id,
      email: user.email,
      name: profile?.full_name,
      phone: profile?.phone,
      role: roles[0] ?? "customer",
      country: profile?.country_code,
      language: i18n.language,
      providerId: profile?.provider_id ?? null,
      customerId: roles.includes("customer") ? user.id : null,
    });
  }, [user?.id, profile?.full_name, profile?.phone, profile?.country_code, roles.join(","), i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCrispPage(pathname);
  }, [pathname]);

  return null;
}

export default CrispProvider;
