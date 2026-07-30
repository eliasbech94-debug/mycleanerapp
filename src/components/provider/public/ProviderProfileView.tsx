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
import ProviderBookingSidebar from "./ProviderBookingSidebar";
import ProviderReviewsSummary from "./ProviderReviewsSummary";

/** Anchor for the full review list, linked from the sidebar summary. */
const FULL_REVIEWS_ID = "anmeldelser";
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
    <div className="mx-auto w-full max-w-4xl px-4 pt-4 sm:px-6 lg:max-w-6xl lg:px-8 xl:max-w-[1500px] xl:px-10 xl:pt-8">
      {props.header && <div className="mb-3">{props.header}</div>}

      {/* Bottom padding keeps the fixed mobile CTA (and the tab bar it sits on)
          from covering the last section, the footer or any link. */}
      <div
        className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-10"
        style={{
          paddingBottom:
            "calc(var(--provider-mobile-cta-height, 64px) + env(safe-area-inset-bottom) + 24px)",
        }}
      >
        <div className="min-w-0 space-y-5 xl:space-y-8">
          <ProviderHero
            profile={profile}
            availabilityStatus={props.availabilityStatus}
            presenceStatus={props.presenceStatus}
            distanceKm={props.distanceKm}
            earlyAccess={props.earlyAccess}
            isFollowing={props.isFollowing}
            onFollow={props.onFollow}
          />
          <ProviderTrustBadges profile={profile} />
          <ProviderAbout profile={profile} />
          <ProviderServices profile={profile} nextSlot={props.nextSlot ?? props.slots?.[0] ?? null} />
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
          {/* Below 1024px experience lives in the single column; on desktop it
              moves into the right column instead. */}
          <div className="lg:hidden">
            <ProviderExperience profile={profile} workHistory={props.workHistory} />
          </div>
          <div id={FULL_REVIEWS_ID} className="scroll-mt-24">
            <ProviderReviews profile={profile} reviews={props.reviews} onVisible={props.onLoadReviews} />
          </div>

          <button
            type="button"
            onClick={props.onSeeAlternatives}
            className="w-full rounded-md text-xs text-[hsl(224_20%_45%)] underline underline-offset-2 hover:text-[hsl(224_72%_18%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)]"
            data-testid="see-alternatives-btn"
          >
            Se lignende cleaners
          </button>

          <p className="text-center text-xs text-[hsl(224_20%_50%)] lg:hidden">
            Sikker betaling gennem MyCleaner. Ingen adresser, telefonnumre eller e-mails deles udenfor platformen.
          </p>

          {/* Sticky CTA is the mobile/tablet action bar; desktop uses the sidebar. */}
          <div className="lg:hidden">
            <ProviderStickyCta
              earlyAccess={props.bookingLocked}
              isFollowing={props.isFollowing}
              providerFirstName={firstName}
              onBook={props.onBook}
              onFollow={props.onFollow}
            />
          </div>
        </div>

        {/* Desktop (>=1024px) right column: booking card + trust context.
            Only the booking card is sticky; the rest flows naturally so the
            column never needs its own scrollbar. */}
        <div className="hidden min-w-0 space-y-5 lg:block">
          <ProviderBookingSidebar
            profile={profile}
            slots={props.slots}
            nextSlot={props.nextSlot}
            bookingLocked={props.bookingLocked}
            isFollowing={props.isFollowing}
            onBook={props.onBook}
            onFollow={props.onFollow}
            onPickSlot={props.onPickSlot}
          />
          <ProviderExperience
            profile={profile}
            workHistory={props.workHistory}
            variant="sidebar"
          />
          <ProviderReviewsSummary
            profile={profile}
            reviews={props.reviews}
            fullListId={FULL_REVIEWS_ID}
          />
        </div>
      </div>

    </div>
  );
}


export default ProviderProfileView;
