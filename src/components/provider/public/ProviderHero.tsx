/**
 * Hero — provider identity. 100% database driven; the mockup only defines layout.
 */
import { useState } from "react";
import { BadgeCheck, Heart, MapPin, Sparkles, Star } from "lucide-react";
import type { AvailabilityStatus, PresenceStatus, PublicProviderProfile } from "./types";
import { formatDistance } from "./format";
import ProviderIntroVideoTrigger from "./ProviderIntroVideoTrigger";
import ProviderIntroVideoDialog from "./ProviderIntroVideoDialog";
import { publicIntroVideo } from "./providerIntroVideoTypes";

const AVAILABILITY_META: Record<AvailabilityStatus, { dot: string; label: string; text: string }> = {
  available: { dot: "bg-emerald-500", label: "Tilgængelig", text: "text-emerald-600" },
  unavailable: { dot: "bg-slate-300", label: "Ikke tilgængelig", text: "text-slate-500" },
};

type Props = {
  profile: PublicProviderProfile;
  availabilityStatus: AvailabilityStatus;
  /** "unknown" until real presence tracking exists — then "Online nu" is hidden. */
  presenceStatus?: PresenceStatus;
  distanceKm: number | null;
  earlyAccess?: boolean;
  /** Mobile-only follow affordance (desktop keeps the CTA-bar button). */
  isFollowing?: boolean;
  onFollow?: () => void;
};

export function ProviderHero({
  profile,
  availabilityStatus,
  presenceStatus = "unknown",
  distanceKm,
  earlyAccess,
  isFollowing = false,
  onFollow,
}: Props) {
  const status = AVAILABILITY_META[availabilityStatus];
  const distance = formatDistance(distanceKm);
  const isTopTier = ["top_rated", "elite", "partner"].includes(profile.provider_tier ?? "");
  const introVideo = publicIntroVideo(profile.intro_video);
  const [videoOpen, setVideoOpen] = useState(false);



  return (
    <section
      data-testid="provider-hero"
      className="relative overflow-hidden rounded-3xl bg-white shadow-[0_18px_40px_-28px_hsl(222_88%_42%/0.45)] ring-1 ring-[hsl(222_60%_92%)]"
    >
      <div className="grid gap-0 sm:grid-cols-[minmax(0,220px)_1fr]">
        <div className="relative aspect-[4/3] max-h-[42vh] w-full overflow-hidden bg-[hsl(210_60%_96%)] sm:aspect-[4/5] sm:max-h-none sm:h-full">
          {onFollow && (
            <button
              type="button"
              onClick={onFollow}
              aria-pressed={isFollowing}
              aria-label={isFollowing ? `Følger ${profile.display_name}` : `Følg ${profile.display_name}`}
              data-testid="provider-hero-follow"
              className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-[hsl(222_88%_42%)] shadow-sm backdrop-blur transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)] focus-visible:ring-offset-2 motion-reduce:transition-none sm:hidden"
            >
              <Heart className={`h-5 w-5 ${isFollowing ? "fill-current" : ""}`} aria-hidden="true" />
            </button>
          )}
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover object-[center_25%]"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-4xl font-semibold text-[hsl(222_88%_42%)]">
              {profile.display_name.slice(0, 1)}
            </div>
          )}
          {introVideo && (
            <ProviderIntroVideoTrigger
              video={introVideo}
              providerName={profile.display_name}
              onOpen={() => setVideoOpen(true)}
            />
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

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {presenceStatus === "online" && (
              <p
                data-testid="provider-presence"
                className="flex items-center gap-2 text-sm font-medium text-emerald-600"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Online nu
              </p>
            )}
            <p
              data-testid="provider-availability-status"
              className={`flex items-center gap-2 text-sm font-medium ${status.text}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} aria-hidden="true" />
              {status.label}
            </p>
          </div>

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
