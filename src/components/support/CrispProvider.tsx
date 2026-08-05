import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
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

type CrispContextResponse = {
  identity?: { email?: string | null; name?: string | null; phone?: string | null };
  snapshot?: Record<string, string>;
};

type CrispIdentityResponse = { email?: string; signature?: string };

/**
 * Mounts Crisp app-wide in hidden mode and supplies verified identity plus a
 * read-only support snapshot. Crisp is the operator workspace; MyCleaner stays
 * the authoritative source for accounts, bookings and payments.
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
    let cancelled = false;

    if (!user) {
      resetCrispSession();
      return;
    }

    // Immediate baseline identity; the signed email below replaces it once the
    // backend signature is available.
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

    async function hydrateTrustedSupportContext() {
      const [{ data: identityData }, { data: contextData }] = await Promise.all([
        supabase.functions.invoke<CrispIdentityResponse>("crisp-identity", { method: "POST" }),
        supabase.functions.invoke<CrispContextResponse>("crisp-context", { method: "POST" }),
      ]);
      if (cancelled) return;

      if (identityData?.email && identityData.signature) {
        crispPush(["set", "user:email", [identityData.email, identityData.signature]]);
      }

      const trustedIdentity = contextData?.identity;
      if (trustedIdentity?.name) crispPush(["set", "user:nickname", [trustedIdentity.name]]);
      if (trustedIdentity?.phone) crispPush(["set", "user:phone", [trustedIdentity.phone]]);

      const entries = Object.entries(contextData?.snapshot ?? {})
        .filter(([, value]) => value !== "")
        .map(([key, value]) => [key, value] as [string, string]);
      if (entries.length) crispPush(["set", "session:data", [entries]]);
    }

    void hydrateTrustedSupportContext();
    return () => { cancelled = true; };
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
