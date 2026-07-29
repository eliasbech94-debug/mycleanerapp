/**
 * /dev/provider-profile-preview — DEVELOPMENT ONLY.
 *
 * Renders the exact same `ProviderProfileView` as the live /p/:slug page, but
 * with typed fixtures instead of database rows. The route is only registered
 * when `isDevPreviewEnabled()` is true, and this module is lazy-loaded so its
 * code is never part of the production entry bundle.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EARLY_ACCESS_MODE, isBookingLocked } from "@/config/launch";
import ProviderProfileView from "@/components/provider/public/ProviderProfileView";
import { deriveAvailabilityStatus, derivePresenceStatus } from "@/hooks/usePublicProviderProfile";
import { activeServices } from "@/components/provider/public/servicePricing";
import { PREVIEW_CASES, type PreviewCaseId } from "@/dev/providerProfilePreviewFixtures";

export default function ProviderProfilePreview() {
  const [caseId, setCaseId] = useState<PreviewCaseId>("b");
  const [locationGranted, setLocationGranted] = useState(true);
  const [following, setFollowing] = useState(false);
  const [notified, setNotified] = useState(false);

  const current = useMemo(
    () => PREVIEW_CASES.find((c) => c.id === caseId) ?? PREVIEW_CASES[0],
    [caseId],
  );

  const availabilityStatus = deriveAvailabilityStatus(current.slots);
  // No presence source exists yet, so this stays "unknown" exactly as in prod.
  const presenceStatus = derivePresenceStatus(null);
  const serviceCount = activeServices(current.profile.services).length;

  return (
    <main className="min-h-screen bg-[hsl(210_60%_98%)]">
      <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">
        <div
          data-testid="preview-case-switcher"
          className="rounded-2xl border border-dashed border-[hsl(222_60%_80%)] bg-white/80 p-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(222_88%_42%)]">
            Development preview · ingen rigtige data
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Vælg preview-case">
            {PREVIEW_CASES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === caseId}
                onClick={() => setCaseId(c.id)}
                className={
                  "rounded-full px-3 py-1.5 text-sm font-semibold transition " +
                  (c.id === caseId
                    ? "bg-[hsl(222_88%_42%)] text-white"
                    : "bg-[hsl(210_60%_96%)] text-[hsl(224_45%_25%)] hover:bg-[hsl(210_60%_92%)]")
                }
              >
                {c.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={locationGranted}
              onClick={() => setLocationGranted((v) => !v)}
              className="rounded-full border border-[hsl(222_60%_88%)] px-3 py-1.5 text-sm font-medium text-[hsl(224_45%_25%)]"
            >
              {locationGranted ? "Lokation: tilladt" : "Lokation: afvist"}
            </button>
          </div>
          <p className="mt-2 text-xs text-[hsl(224_20%_45%)]">
            {current.description} · {serviceCount} aktive services
          </p>
        </div>
      </div>

      <ProviderProfileView
        profile={current.profile}
        workHistory={current.workHistory}
        slots={current.slots}
        nextSlot={current.nextSlot}
        reviews={current.reviews}
        availabilityStatus={availabilityStatus}
        presenceStatus={presenceStatus}
        distanceKm={locationGranted ? current.distanceKm : null}
        earlyAccess={EARLY_ACCESS_MODE}
        bookingLocked={isBookingLocked()}
        isFollowing={following}
        notifyRequested={notified}
        onPickSlot={(d, s) => toast.info(`Preview: ${d} kl. ${s}`)}
        onRequestOther={() => toast.info("Preview: anmod om anden tid")}
        onNotify={() => {
          setNotified(true);
          toast.success("Preview: notifikation slået til");
        }}
        onSeeAlternatives={() => toast.info("Preview: se andre cleaners")}
        onBook={() => toast.info("Preview: book")}
        onFollow={() => setFollowing((v) => !v)}
        onLoadReviews={() => {}}
      />
    </main>
  );
}
