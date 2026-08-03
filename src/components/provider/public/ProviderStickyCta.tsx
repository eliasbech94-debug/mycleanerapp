/**
 * Sticky bottom CTA.
 *
 * Mobile: ONE compact primary action only (booking). "Følg" lives as a heart
 * icon in the hero header instead, so the bar stays as small as possible.
 * Desktop (>=640px): the bar flows with the page and may show both actions.
 *
 * The measured height is published as `--provider-mobile-cta-height` on
 * <html> so the profile can reserve exactly the right amount of bottom space.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BellRing, CalendarCheck, Heart } from "lucide-react";

/** Fallback height of the mobile tab bar if it cannot be measured. */
const MOBILE_NAV_FALLBACK_HEIGHT = 64;
const CTA_HEIGHT_VAR = "--provider-mobile-cta-height";

/**
 * Stacks the CTA above the mobile tab bar only when that bar is rendered.
 * The height is measured from the live element — the bar grows with labels and
 * safe-area padding, so a hardcoded value would let the CTA cover it.
 */
function useMobileNavOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const measure = () => {
      const nav = document.querySelector("[data-mobile-bottom-nav]");
      const visible = !!nav && getComputedStyle(nav).display !== "none";
      if (!visible || !nav) {
        setOffset(0);
        return;
      }
      const h = Math.round(nav.getBoundingClientRect().height);
      setOffset(h > 0 ? h : MOBILE_NAV_FALLBACK_HEIGHT);
    };
    measure();
    const nav = document.querySelector("[data-mobile-bottom-nav]");
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && nav) ro.observe(nav);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
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
  const barRef = useRef<HTMLDivElement | null>(null);

  // Publish the real bar height (incl. the tab bar it sits on) as a CSS var.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const el = barRef.current;
      // Above 640px the bar is static and reserves no fixed space.
      const isFixed = el ? getComputedStyle(el).position === "fixed" : false;
      const h = isFixed && el ? Math.round(el.getBoundingClientRect().height) + navOffset : 0;
      root.style.setProperty(CTA_HEIGHT_VAR, `${h}px`);
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ro && barRef.current) ro.observe(barRef.current);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty(CTA_HEIGHT_VAR);
    };
  }, [navOffset, earlyAccess, providerFirstName]);

  const primaryLabel = earlyAccess
    ? `Giv mig besked, når ${providerFirstName} åbner`
    : "Anmod om booking";
  const followLabel = isFollowing ? `Følger ${providerFirstName}` : `Følg ${providerFirstName}`;

  return (
    <div
      ref={barRef}
      data-testid="provider-sticky-cta"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[hsl(222_60%_92%)] bg-white/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:static sm:mt-6 sm:rounded-2xl sm:border sm:px-4 sm:py-3"
      // The measured tab bar already contains its own safe-area padding, so the
      // inset is only added when no tab bar is present.
      style={{
        bottom: navOffset > 0 ? `${navOffset}px` : "env(safe-area-inset-bottom)",
      }}

    >
      <div className="mx-auto flex max-w-4xl gap-2">
        <button
          type="button"
          onClick={onBook}
          data-testid="provider-book-cta"
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full bg-[hsl(222_88%_42%)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[hsl(222_88%_36%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)] focus-visible:ring-offset-2 motion-reduce:transition-none sm:min-h-[52px] sm:text-base"
        >
          {earlyAccess ? (
            <BellRing className="h-5 w-5 shrink-0" aria-hidden="true" />
          ) : (
            <CalendarCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{primaryLabel}</span>
        </button>

        {/* Follow stays a desktop-only action here; on mobile it lives in the hero. */}
        <button
          type="button"
          onClick={onFollow}
          aria-pressed={isFollowing}
          data-testid="provider-follow-cta"
          className="hidden min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full border border-[hsl(222_70%_88%)] px-5 text-base font-semibold text-[hsl(222_88%_42%)] transition-colors hover:bg-[hsl(222_88%_42%/0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(222_88%_42%)] focus-visible:ring-offset-2 motion-reduce:transition-none sm:inline-flex"
        >
          <Heart className={`h-5 w-5 ${isFollowing ? "fill-current" : ""}`} aria-hidden="true" />
          {followLabel}
        </button>
      </div>
    </div>
  );
}

export default ProviderStickyCta;
