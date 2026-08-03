import { useEffect, useMemo } from "react";
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

function cleanDisplayName(value?: string | null): string | null {
  const name = value?.trim();
  if (!name || name.includes("@")) return null;
  return name;
}

function metadataDisplayName(user: { user_metadata?: Record<string, unknown> } | null | undefined): string | null {
  const metadata = user?.user_metadata ?? {};
  const candidates = [metadata.full_name, metadata.name, metadata.display_name];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const name = cleanDisplayName(candidate);
      if (name) return name;
    }
  }
  return null;
}

/**
 * Mounts Crisp app-wide in hidden mode.
 *
 * The floating bubble is never rendered. This provider only exists so the
 * support session carries trustworthy identity and navigation context; the
 * visible chat is embedded in the Support Center.
 */
export function CrispProvider() {
  const { user, profile } = useAuth();
  const { roles } = useUserRoles();
  const { i18n } = useTranslation();
  const { pathname } = useLocation();

  const displayName = useMemo(
    () => cleanDisplayName(profile?.full_name) ?? metadataDisplayName(user) ?? null,
    [profile?.full_name, user],
  );

  const primaryRole = roles.includes("provider")
    ? "provider"
    : roles.includes("customer")
      ? "customer"
      : roles[0] ?? "customer";

  useEffect(() => {
    loadCrisp({
      locale: i18n.language?.slice(0, 2) ?? "da",
      tokenId: crispTokenId(user?.id),
    });
    crispPush(["do", "chat:hide"]);
  }, [i18n.language, user?.id]);

  useEffect(() => {
    if (!user) {
      // Signing out must not leak the previous user's history on shared devices.
      resetCrispSession();
      return;
    }

    identifyCrispUser({
      userId: user.id,
      email: user.email,
      name: displayName,
      phone: profile?.phone,
      role: primaryRole,
      country: profile?.country_code,
      language: i18n.language,
      providerId: profile?.provider_id ?? null,
      customerId: roles.includes("customer") ? user.id : null,
    });

    crispPush([
      "set",
      "session:data",
      [[
        ["authenticated", "true"],
        ["account_created_at", user.created_at ?? ""],
        ["support_identity_version", "2"],
      ]],
    ]);
  }, [
    user,
    displayName,
    profile?.phone,
    profile?.country_code,
    profile?.provider_id,
    primaryRole,
    roles,
    i18n.language,
  ]);

  useEffect(() => {
    setCrispPage(pathname);
  }, [pathname]);

  return null;
}

export default CrispProvider;
