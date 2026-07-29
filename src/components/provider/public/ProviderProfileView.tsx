/**
 * Presentational shell for the public provider profile.
 *
 * Both the live page (/p/:slug) and the development preview route render THIS
 * component, so the preview can never drift into a hardcoded copy of the page.
 * It receives already-typed data (PublicProviderProfile etc.) and owns layout
 * only — no fetching, no navigation.
 */
import type { ReactNode } from "react";
import ProviderHero from "./ProviderHero";
import ProviderTrustBadges from "./ProviderTrustBadges";
import ProviderAbout from "./ProviderAbout";
import ProviderServices from "./ProviderServices";
import ProviderAvailability from "./ProviderAvailability";
import ProviderExperience from "./ProviderExperience";
import ProviderReviews from "./ProviderReviews";
import ProviderStickyCta from "./ProviderStickyCta";
import type {
  AvailabilityStatus,
  PresenceStatus,
  PublicProviderProfile,
  PublicReview,
  PublicWorkHistoryEntry,
  Slot,
} from "./types";

export type ProviderProfileViewProps = {
  profile: PublicProviderProfile;
  workHistory: PublicWorkHistoryEntry[];
  slots: Slot[] | null;
  nextSlot: Slot | null;
  reviews: PublicReview[] | null;
  availabilityStatus: AvailabilityStatus;
  presenceStatus: PresenceStatus;
  distanceKm: number | null;
  earlyAccess: boolean;
  bookingLocked: boolean;
  isFollowing: boolean;
  notifyRequested: boolean;
  header?: ReactNode;
  onPickSlot: (date: string, slot: string) => void;
  onRequestOther: () => void;
  onNotify: () => void;
  onSeeAlternatives: () => void;
  onBook: () => void;
  onFollow: () => void;
  onLoadReviews: () => void;
};

export function ProviderProfileView(props: ProviderProfileViewProps) {
  const { profile } = props;
  const firstName = profile.display_name.split(" ")[0];

  return (
    <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">
      {props.header && <div className="mb-3">{props.header}</div>}

      {/* Bottom padding keeps the fixed mobile CTA from covering the last section. */}
      <div className="space-y-5 pb-[calc(104px+env(safe-area-inset-bottom))] sm:pb-6">
        <ProviderHero
          profile={profile}
          availabilityStatus={props.availabilityStatus}
          presenceStatus={props.presenceStatus}
          distanceKm={props.distanceKm}
          earlyAccess={props.earlyAccess}
        />
        <ProviderTrustBadges profile={profile} />
        <ProviderAbout profile={profile} />
        <ProviderServices profile={profile} />
        <ProviderAvailability
          slots={props.slots}
          nextSlot={props.nextSlot}
          providerName={profile.display_name}
          onPick={props.onPickSlot}
          onRequestOther={props.onRequestOther}
          onNotify={props.onNotify}
          notifyRequested={props.notifyRequested}
          onSeeAlternatives={props.onSeeAlternatives}
        />
        <ProviderExperience profile={profile} workHistory={props.workHistory} />
        <ProviderReviews profile={profile} reviews={props.reviews} onVisible={props.onLoadReviews} />

        <button
          type="button"
          onClick={props.onSeeAlternatives}
          className="w-full text-xs text-[hsl(224_20%_45%)] underline underline-offset-2 hover:text-[hsl(224_72%_18%)]"
          data-testid="see-alternatives-btn"
        >
          Se andre cleaners
        </button>

        <p className="text-center text-xs text-[hsl(224_20%_50%)]">
          Sikker betaling gennem MyCleaner. Ingen adresser, telefonnumre eller e-mails deles udenfor platformen.
        </p>
      </div>

      <ProviderStickyCta
        earlyAccess={props.bookingLocked}
        isFollowing={props.isFollowing}
        providerFirstName={firstName}
        onBook={props.onBook}
        onFollow={props.onFollow}
      />
    </div>
  );
}

export default ProviderProfileView;
