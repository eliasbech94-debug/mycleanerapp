/** Sticky bottom CTA — booking CTA respects Early Access; follow is optimistic. */
import { useEffect, useState } from "react";
import { BellRing, CalendarCheck, Heart } from "lucide-react";

/** Height of the mobile tab bar (h-14) when it is present on the route. */
const MOBILE_NAV_HEIGHT = 56;

/** Stacks the CTA above the mobile tab bar only when that bar is rendered. */
function useMobileNavOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const measure = () => {
      const nav = document.querySelector("[data-mobile-bottom-nav]");
      const visible = !!nav && getComputedStyle(nav).display !== "none";
      setOffset(visible ? MOBILE_NAV_HEIGHT : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return offset;
}

type Props = {
  earlyAccess: boolean;
  isFollowing: boolean;
  providerFirstName: string;
  onBook: () => void;
  onFollow: () => void;
};

export function ProviderStickyCta({ earlyAccess, isFollowing, providerFirstName, onBook, onFollow }: Props) {
  const navOffset = useMobileNavOffset();
  return (
    <div
      data-testid="provider-sticky-cta"
      // Mobile: fixed bottom bar (always visible, like the reference).
      // Desktop (>=640px): flows with the page below the content.
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[hsl(222_60%_92%)] bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:static sm:mt-6 sm:rounded-2xl sm:border sm:px-4"
      // Sits directly above the mobile tab bar (h-14) incl. safe area.
      // `bottom` is ignored once the bar becomes static at >=640px.
      style={{ bottom: `calc(${navOffset}px + env(safe-area-inset-bottom))`, }}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onBook}
          data-testid="provider-book-cta"
          className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full border border-[hsl(222_70%_88%)] px-5 text-base font-semibold text-[hsl(222_88%_42%)] transition hover:bg-[hsl(222_88%_42%/0.06)]"
        >
          {earlyAccess ? <BellRing className="h-5 w-5" /> : <CalendarCheck className="h-5 w-5" />}
          {earlyAccess ? "Bookinger åbner snart" : "Book nu"}
        </button>
        <button
          type="button"
          onClick={onFollow}
          aria-pressed={isFollowing}
          data-testid="provider-follow-cta"
          className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-[hsl(222_88%_42%)] px-5 text-base font-semibold text-white transition hover:bg-[hsl(222_88%_36%)]"
        >
          <Heart className={`h-5 w-5 ${isFollowing ? "fill-white" : ""}`} />
          {isFollowing ? `Følger ${providerFirstName}` : `Følg ${providerFirstName}`}
        </button>
      </div>
    </div>
  );
}

export default ProviderStickyCta;
