/**
 * usePullToRefresh — native-feeling pull-to-refresh for the mobile app shell.
 *
 * Presentation + gesture only. Reuses the caller-supplied refetch function;
 * never triggers a browser reload and never introduces new data fetching.
 *
 * Guarantees (Phase 5B):
 *  - Enabled strictly below 768px (caller passes `enabled`).
 *  - Only starts when the actual mobile shell scroll container
 *    (`[data-mobile-scroll-root]`) is at true scrollTop === 0.
 *  - Requires a deliberate downward vertical gesture; a horizontal component
 *    aborts (protects carousels / chip scrollers / card lists).
 *  - Ignores touches that start inside interactive elements
 *    (input, textarea, select, button, a, contenteditable) so tapping the
 *    booking segmented control or a card CTA never triggers refresh.
 *  - Ignores touches while any [role="dialog"] / [data-testid="bottom-sheet"]
 *    is open, and while a non-collapsed text selection exists.
 *  - Prevents overlapping refreshes (rejects re-entry while `refreshing`).
 *  - Cleans up all listeners and async state on unmount / dep change.
 *  - `preventDefault()` runs only once we are past a small deliberate
 *    downward-pull threshold at scrollTop === 0, so ordinary vertical scroll
 *    and horizontal carousels remain untouched.
 *  - No new dependency.
 */
import { useEffect, useRef, useState } from "react";

export type UsePullToRefreshOptions = {
  /** Enable listeners. Callers gate this by viewport width. */
  enabled: boolean;
  /** Existing refetch operation. Must not reload the browser. */
  onRefresh: () => Promise<unknown> | unknown;
  /**
   * Selector for the mobile shell scroll container. Defaults to
   * `[data-mobile-scroll-root]`, which is set by `MobileAppShell`.
   */
  scrollRootSelector?: string;
  /** Pixels of pull required to commit a refresh. Defaults to 72. */
  threshold?: number;
  /** Max visual pull distance. Defaults to 120. */
  maxDistance?: number;
};

export type UsePullToRefreshReturn = {
  /** Current visual pull distance in pixels (0 when idle). */
  pullY: number;
  /** True while `onRefresh` is running. */
  refreshing: boolean;
  /** True once the current gesture has passed `threshold`. */
  thresholdReached: boolean;
};

const INTERACTIVE_SELECTOR =
  'input,textarea,select,button,a,[contenteditable="true"],[contenteditable=""]';

const OPEN_OVERLAY_SELECTOR =
  '[role="dialog"][data-state="open"], [data-testid="bottom-sheet"][data-state="open"], [data-mobile-overlay="open"]';

export function usePullToRefresh({
  enabled,
  onRefresh,
  scrollRootSelector = "[data-mobile-scroll-root]",
  threshold = 72,
  maxDistance = 120,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [thresholdReached, setThresholdReached] = useState(false);

  // Latest onRefresh in a ref so we don't re-bind listeners on every render.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const refreshingRef = useRef(false);
  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const root = document.querySelector(scrollRootSelector) as HTMLElement | null;
    if (!root) return;

    let disposed = false;
    let startY = 0;
    let startX = 0;
    let tracking = false;
    let aborted = false;
    let currentPull = 0;

    const isInteractive = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest(INTERACTIVE_SELECTOR));
    };

    const anyOverlayOpen = () =>
      Boolean(document.querySelector(OPEN_OVERLAY_SELECTOR));

    const hasTextSelection = () => {
      const sel = window.getSelection?.();
      return Boolean(sel && !sel.isCollapsed && sel.toString().length > 0);
    };

    const reset = () => {
      tracking = false;
      aborted = false;
      currentPull = 0;
      setPullY(0);
      setThresholdReached(false);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (!e.touches || e.touches.length !== 1) return;
      if (root.scrollTop > 0) return;
      if (anyOverlayOpen()) return;
      if (hasTextSelection()) return;
      if (isInteractive(e.target)) return;
      const t = e.touches[0];
      startY = t.clientY;
      startX = t.clientX;
      tracking = true;
      aborted = false;
      currentPull = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || aborted || refreshingRef.current) return;
      if (!e.touches || e.touches.length !== 1) {
        aborted = true;
        reset();
        return;
      }
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;

      // Horizontal intent → let carousels/chips handle it.
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
        aborted = true;
        reset();
        return;
      }
      // Upward pull is a normal scroll, not a refresh.
      if (dy <= 0) {
        currentPull = 0;
        setPullY(0);
        setThresholdReached(false);
        return;
      }
      // If the shell scrolled off the top mid-gesture, cancel.
      if (root.scrollTop > 0) {
        aborted = true;
        reset();
        return;
      }
      // Resisted rubber-band pull.
      const resisted = Math.min(maxDistance, dy * 0.5);
      currentPull = resisted;
      setPullY(resisted);
      const past = resisted >= threshold;
      setThresholdReached(past);
      // Only claim the gesture (prevent default scroll bounce) once we're
      // clearly in a downward pull past a small dead zone.
      if (dy > 10 && e.cancelable) {
        e.preventDefault();
      }
    };

    const finish = async () => {
      const shouldRefresh = !aborted && currentPull >= threshold;
      tracking = false;
      aborted = false;
      if (!shouldRefresh) {
        reset();
        return;
      }
      setRefreshing(true);
      refreshingRef.current = true;
      // Hold indicator visible at ~threshold while refreshing.
      setPullY(Math.max(48, Math.min(threshold, 64)));
      setThresholdReached(true);
      try {
        await onRefreshRef.current();
      } catch {
        // Swallow — page-level UI owns error surfaces; refresh must never
        // leave the user stuck in a spinning indicator.
      } finally {
        if (disposed) return;
        setRefreshing(false);
        refreshingRef.current = false;
        currentPull = 0;
        setPullY(0);
        setThresholdReached(false);
      }
    };

    const onTouchEnd = () => {
      // Only participate if THIS gesture was ever tracked. Refresh-in-flight
      // gestures never set `tracking`, so they never re-enter finish().
      if (!tracking) return;
      void finish();
    };
    const onTouchCancel = () => {
      if (!tracking) return;
      reset();
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    root.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      disposed = true;
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled, scrollRootSelector, threshold, maxDistance]);

  return { pullY, refreshing, thresholdReached };
}

export default usePullToRefresh;
