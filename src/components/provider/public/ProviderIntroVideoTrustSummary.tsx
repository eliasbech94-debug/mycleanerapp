/**
 * Compact trust summary shown under the intro video. Renders only the
 * datapoints that exist in the data — never placeholders.
 */
import { BadgeCheck, Repeat2, ShieldCheck, Sparkles, Star } from "lucide-react";
import type { ProviderIntroVideo, ProviderIntroVideoTrust } from "./providerIntroVideoTypes";
import { showsVerifiedBadge } from "./providerIntroVideoTypes";

type Props = {
  trust: ProviderIntroVideoTrust;
  video: ProviderIntroVideo | null;
};

export function ProviderIntroVideoTrustSummary({ trust, video }: Props) {
  const items: { key: string; icon: JSX.Element; label: string }[] = [];

  if (trust.averageRating != null) {
    items.push({
      key: "rating",
      icon: <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />,
      label: `${Number(trust.averageRating).toFixed(1)} i bedømmelse`,
    });
  }
  if (trust.repeatBookingRate != null) {
    items.push({
      key: "repeat",
      icon: <Repeat2 className="h-4 w-4 text-[hsl(222_88%_42%)]" aria-hidden="true" />,
      label: `${Math.round(Number(trust.repeatBookingRate))} % booker igen`,
    });
  }
  if (trust.completedBookings != null && trust.completedBookings > 0) {
    items.push({
      key: "completed",
      icon: <ShieldCheck className="h-4 w-4 text-[hsl(222_88%_42%)]" aria-hidden="true" />,
      label: `${trust.completedBookings} gennemførte opgaver`,
    });
  }
  if (trust.recommended) {
    items.push({
      key: "recommended",
      icon: <Sparkles className="h-4 w-4 text-[hsl(222_88%_42%)]" aria-hidden="true" />,
      label: "MyCleaner anbefaler",
    });
  }

  const verified = showsVerifiedBadge(video);

  return (
    <div data-testid="intro-video-trust" className="space-y-2.5">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex min-w-0 items-center gap-1.5 text-sm text-[hsl(224_45%_25%)]"
            >
              {item.icon}
              <span className="min-w-0 break-words">{item.label}</span>
            </li>
          ))}
        </ul>
      )}

      {verified && (
        <span
          data-testid="intro-video-verified-badge"
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[hsl(222_88%_42%/0.08)] px-3 py-1 text-xs font-semibold text-[hsl(222_88%_42%)]"
        >
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Video og identitet bekræftet
        </span>
      )}

      <p className="text-xs leading-relaxed text-[hsl(224_20%_45%)]">
        Introduktionen er optaget til MyCleaner og gennemgået før offentliggørelse.
      </p>
    </div>
  );
}

export default ProviderIntroVideoTrustSummary;
