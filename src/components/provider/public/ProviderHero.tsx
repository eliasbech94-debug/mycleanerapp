/**
 * Hero — provider identity. 100% database driven; the mockup only defines layout.
 */
import { BadgeCheck, MapPin, Sparkles, Star } from "lucide-react";
import type { OnlineStatus, PublicProviderProfile } from "./types";
import { formatDistance } from "./format";

const STATUS_META: Record<OnlineStatus, { dot: string; label: string; text: string }> = {
  online: { dot: "bg-emerald-500", label: "Online", text: "text-emerald-600" },
  busy: { dot: "bg-amber-400", label: "Optaget", text: "text-amber-600" },
  offline: { dot: "bg-slate-300", label: "Offline", text: "text-slate-500" },
};

type Props = {
  profile: PublicProviderProfile;
  onlineStatus: OnlineStatus;
  distanceKm: number | null;
  earlyAccess?: boolean;
};

export function ProviderHero({ profile, onlineStatus, distanceKm, earlyAccess }: Props) {
  const status = STATUS_META[onlineStatus];
  const distance = formatDistance(distanceKm);
  const isTopTier = ["top_rated", "elite", "partner"].includes(profile.provider_tier ?? "");

  return (
    <section
      data-testid="provider-hero"
      className="relative overflow-hidden rounded-3xl bg-white shadow-[0_18px_40px_-28px_hsl(222_88%_42%/0.45)] ring-1 ring-[hsl(222_60%_92%)]"
    >
      <div className="grid gap-0 sm:grid-cols-[minmax(0,220px)_1fr]">
        <div className="relative aspect-[4/5] w-full bg-[hsl(210_60%_96%)] sm:aspect-auto sm:h-full">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-4xl font-semibold text-[hsl(222_88%_42%)]">
              {profile.display_name.slice(0, 1)}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5 p-5 sm:p-6">
          {earlyAccess && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[hsl(222_88%_42%/0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[hsl(222_88%_42%)]">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Early Access
            </span>
          )}

          <h1 className="flex flex-wrap items-center gap-2 break-words text-3xl font-bold leading-tight text-[hsl(224_72%_18%)] sm:text-4xl">
            <span className="min-w-0 break-words">{profile.display_name}</span>
            {profile.identity_verified_badge && (
              <BadgeCheck
                className="h-6 w-6 shrink-0 text-[hsl(222_88%_42%)]"
                aria-label="Verificeret cleaner"
              />
            )}
          </h1>

          {isTopTier && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[hsl(222_70%_88%)] px-3 py-1 text-sm font-semibold text-[hsl(222_88%_42%)]">
              <Star className="h-4 w-4 fill-current" aria-hidden="true" />
              Top Cleaner
            </span>
          )}

          {profile.marketplace_score != null && (
            <div className="text-sm text-[hsl(224_20%_40%)]">
              MyCleaner Score{" "}
              <strong className="text-[hsl(224_72%_18%)]">{profile.marketplace_score}</strong>
            </div>
          )}

          {profile.average_rating != null && (
            <div className="flex items-center gap-2 text-[hsl(224_20%_40%)]">
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="text-xl font-bold text-[hsl(224_72%_18%)]">
                {Number(profile.average_rating).toFixed(1)}
              </span>
              {profile.total_reviews != null && <span>· {profile.total_reviews} anmeldelser</span>}
            </div>
          )}

          {(profile.city || profile.country_code || distance) && (
            <p className="flex items-center gap-1.5 text-sm text-[hsl(224_20%_40%)]">
              <MapPin className="h-4 w-4 shrink-0 text-[hsl(222_88%_42%)]" aria-hidden="true" />
              <span className="min-w-0 break-words">
                {[profile.city ?? profile.country_code, distance].filter(Boolean).join(" · ")}
              </span>
            </p>
          )}

          <p className={`flex items-center gap-2 text-sm font-medium ${status.text}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} aria-hidden="true" />
            {status.label}
          </p>

          {profile.completed_bookings > 0 && (
            <p className="text-sm text-[hsl(224_20%_40%)]">
              {profile.completed_bookings} gennemførte opgaver
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default ProviderHero;
