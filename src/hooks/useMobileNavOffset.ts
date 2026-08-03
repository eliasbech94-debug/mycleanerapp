import { useEffect, useState } from "react";

/** Fallback height of the mobile tab bar if it cannot be measured. */
const MOBILE_NAV_FALLBACK_HEIGHT = 64;

/**
 * Live height of the mobile bottom tab bar, or 0 when it is not rendered.
 *
 * Sticky page footers (booking CTA, provider CTA) must stack on top of the tab
 * bar. The bar grows with labels and safe-area padding, so it is measured from
 * the live element instead of being hardcoded.
 */
export function useMobileNavOffset(): number {
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

export default useMobileNavOffset;
