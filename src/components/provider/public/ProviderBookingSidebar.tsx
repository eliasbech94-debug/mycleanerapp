/**
 * Desktop-only sticky booking card (>=1280px).
 *
 * DISPLAY + existing handlers only — no new booking logic, no fetching.
 * Everything shown here comes from the same DB-driven props the page already
 * received; nothing is hardcoded.
 */
import { CalendarCheck, BellRing, Clock3, Heart, Star } from "lucide-react";
import type { PublicProviderProfile, Slot } from "./types";
import { activeServices, priceLabel } from "./servicePricing";
import { serviceLabel } from "./format";
import { deriveTrustBadges } from "./ProviderTrustBadges";

type Props = {
  profile: PublicProviderProfile;
  slots: Slot[] | null;
  nextSlot: Slot | null;
  bookingLocked: boolean;
  isFollowing: boolean;
  onBook: () => void;
  onFollow: () => void;
  onPickSlot: (date: string, slot: string) => void;
};

function dayLabel(date: string) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" });
}

export function ProviderBookingSidebar({
  profile,
  slots,
  nextSlot,
  bookingLocked,
  isFollowing,
  onBook,
  onFollow,
  onPickSlot,
}: Props) {
  const services = activeServices(profile.services);
  const cheapest = services.length
    ? services.reduce((a, b) => (a.amount_minor <= b.amount_minor ? a : b))
    : null;
  const badges = deriveTrustBadges(profile).slice(0, 4);
  const firstName = profile.display_name.split(" ")[0];

  // Group the already-loaded slots by day for a compact calendar preview.
  const byDay = new Map<string, number[]>();
  (slots ?? []).forEach((s) => {
    const arr = byDay.get(s.slot_date) ?? [];
    arr.push(s.slot_hour);
    byDay.set(s.slot_date, arr);
  });
  const days = Array.from(byDay.entries()).slice(0, 3);

  return (
    <aside
      data-testid="provider-booking-sidebar"
      className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-[0_18px_40px_-28px_hsl(222_88%_42%/0.45)] ring-1 ring-[hsl(222_60%_92%)]"
    >
      {cheapest && (
        <div>
          <div className="text-xs uppercase tracking-wide text-[hsl(224_20%_45%)]">Fra</div>
          <div className="text-2xl font-bold text-[hsl(224_72%_18%)]">{priceLabel(cheapest)}</div>
        </div>
      )}

      {profile.average_rating != null && (
        <div className="flex items-center gap-2 text-sm text-[hsl(224_20%_40%)]">
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
          <strong className="text-[hsl(224_72%_18%)]">
            {Number(profile.average_rating).toFixed(1)}
          </strong>
          {profile.total_reviews != null && <span>· {profile.total_reviews} anmeldelser</span>}
        </div>
      )}

      {services.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[hsl(224_72%_18%)]">Ydelser</h2>
          <ul className="mt-2 space-y-1.5">
            {services.slice(0, 5).map((s) => (
              <li
                key={s.service_code}
                className="flex items-baseline justify-between gap-3 text-sm text-[hsl(224_45%_25%)]"
              >
                <span className="min-w-0 break-words">{serviceLabel(s.service_code)}</span>
                <span className="shrink-0 font-semibold text-[hsl(222_88%_42%)]">
                  {priceLabel(s)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {days.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[hsl(224_72%_18%)]">Ledige tider</h2>
          <div className="mt-2 space-y-2">
            {days.map(([day, hours]) => (
              <div key={day}>
                <div className="text-xs capitalize text-[hsl(224_20%_45%)]">{dayLabel(day)}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {hours.slice(0, 4).map((h) => {
                    const time = `${String(h).padStart(2, "0")}:00`;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => onPickSlot(day, time)}
                        className="rounded-lg border border-[hsl(222_60%_90%)] px-2 py-1 text-xs font-medium text-[hsl(222_88%_42%)] transition-colors hover:bg-[hsl(222_88%_42%/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)] focus-visible:ring-offset-1 motion-reduce:transition-none"
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {days.length === 0 && nextSlot && (
        <p className="text-sm text-[hsl(224_20%_45%)]">
          Næste ledige: {dayLabel(nextSlot.slot_date)} kl.{" "}
          {String(nextSlot.slot_hour).padStart(2, "0")}:00
        </p>
      )}

      <button
        type="button"
        onClick={onBook}
        data-testid="provider-book-cta-desktop"
        className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[hsl(222_88%_42%)] px-5 text-base font-semibold text-white transition-colors hover:bg-[hsl(222_88%_36%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)] focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        {bookingLocked ? (
          <BellRing className="h-5 w-5 shrink-0" aria-hidden="true" />
        ) : (
          <CalendarCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">
          {bookingLocked ? `Giv mig besked, når ${firstName} åbner` : "Anmod om booking"}
        </span>
      </button>

      <button
        type="button"
        onClick={onFollow}
        aria-pressed={isFollowing}
        data-testid="provider-follow-cta-desktop"
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-[hsl(222_70%_88%)] px-5 text-sm font-semibold text-[hsl(222_88%_42%)] transition-colors hover:bg-[hsl(222_88%_42%/0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)] focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        <Heart className={`h-5 w-5 ${isFollowing ? "fill-current" : ""}`} aria-hidden="true" />
        {isFollowing ? `Følger ${firstName}` : `Følg ${firstName}`}
      </button>

      {profile.avg_response_minutes != null && (
        <p className="flex items-center gap-2 text-sm text-[hsl(224_20%_45%)]">
          <Clock3 className="h-4 w-4 text-[hsl(222_88%_42%)]" aria-hidden="true" />
          Svarer typisk inden for {profile.avg_response_minutes} min.
        </p>
      )}

      {badges.length > 0 && (
        <ul className="flex flex-wrap gap-2 border-t border-[hsl(222_60%_94%)] pt-4">
          {badges.map(({ key, label, icon: Icon }) => (
            <li
              key={key}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(210_60%_97%)] px-2.5 py-1.5 text-xs font-medium text-[hsl(224_45%_20%)]"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-[hsl(222_88%_42%)]" />
              {label}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-[hsl(224_20%_50%)]">
        Sikker betaling gennem MyCleaner. Ingen adresser, telefonnumre eller e-mails deles udenfor
        platformen.
      </p>
    </aside>
  );
}

export default ProviderBookingSidebar;
