/** Trust badges — rendered only when actually earned. */
import { BadgeCheck, GraduationCap, MapPinned, ShieldCheck, UserCheck } from "lucide-react";
import type { PublicProviderProfile } from "./types";

type Badge = { key: string; label: string; icon: React.ComponentType<{ className?: string }> };

export function deriveTrustBadges(profile: PublicProviderProfile): Badge[] {
  const badges: Badge[] = [];
  if (profile.identity_verified_badge)
    badges.push({ key: "id", label: "ID verificeret", icon: UserCheck });
  if (profile.insurance_valid)
    badges.push({ key: "insurance", label: "Forsikring", icon: ShieldCheck });
  if (profile.address_verified)
    badges.push({ key: "address", label: "Adresse verificeret", icon: MapPinned });

  const eq = profile.equipment_badges;
  const flags: string[] = Array.isArray(eq)
    ? (eq as string[])
    : eq && typeof eq === "object"
      ? Object.entries(eq as Record<string, unknown>).filter(([, v]) => !!v).map(([k]) => k)
      : [];
  if (flags.includes("mycleaner_test"))
    badges.push({ key: "test", label: "MyCleaner-test bestået", icon: BadgeCheck });
  if (flags.includes("background_check"))
    badges.push({ key: "bg", label: "Baggrundstjek", icon: ShieldCheck });
  if (flags.includes("professional_certificate"))
    badges.push({ key: "cert", label: "Fagligt certifikat", icon: GraduationCap });

  return badges;
}

export function ProviderTrustBadges({ profile }: { profile: PublicProviderProfile }) {
  const badges = deriveTrustBadges(profile);
  if (badges.length === 0) return null;
  return (
    <ul
      data-testid="provider-trust-badges"
      className="flex flex-wrap gap-2"
      aria-label="Verifikationer"
    >
      {badges.map(({ key, label, icon: Icon }) => (
        <li
          key={key}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-[hsl(224_45%_20%)] ring-1 ring-[hsl(222_60%_92%)]"
        >
          <Icon className="h-4 w-4 shrink-0 text-[hsl(222_88%_42%)]" />
          <span className="min-w-0 break-words">{label}</span>
        </li>
      ))}
    </ul>
  );
}

export default ProviderTrustBadges;
