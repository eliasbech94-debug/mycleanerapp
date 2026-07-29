/**
 * usePullToRefresh — focused Phase 5B tests.
 * Simulates the mobile shell scroll container and touch events.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { usePullToRefresh } from "./usePullToRefresh";

/* -------------------------- helpers -------------------------- */

function Probe({
  enabled,
  onRefresh,
  threshold = 60,
  onState,
}: {
  enabled: boolean;
  onRefresh: () => Promise<unknown> | unknown;
  threshold?: number;
  onState?: (s: { pullY: number; refreshing: boolean; thresholdReached: boolean }) => void;
}) {
  const s = usePullToRefresh({ enabled, onRefresh, threshold });
  onState?.(s);
  return (
    <div>
      <span data-testid="pullY">{s.pullY}</span>
      <span data-testid="refreshing">{String(s.refreshing)}</span>
      <span data-testid="threshold">{String(s.thresholdReached)}</span>
    </div>
  );
}

function makeTouch(clientX: number, clientY: number, target: EventTarget): Touch {
  return { clientX, clientY, target, identifier: 0 } as unknown as Touch;
}

function fire(
  el: Element,
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  x: number,
  y: number,
  target?: Element,
) {
  const tgt = target ?? el;
  const ev = new Event(type, { bubbles: true, cancelable: type === "touchmove" }) as TouchEvent;
  Object.defineProperty(ev, "touches", {
    value: type === "touchend" ? [] : [makeTouch(x, y, tgt)],
  });
  Object.defineProperty(ev, "changedTouches", {
    value: [makeTouch(x, y, tgt)],
  });
  Object.defineProperty(ev, "target", { value: tgt });
  el.dispatchEvent(ev);
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("div");
  root.setAttribute("data-mobile-scroll-root", "");
  // Make scrollTop mutable in jsdom.
  Object.defineProperty(root, "scrollTop", {
    value: 0,
    writable: true,
    configurable: true,
  });
  document.body.appendChild(root);
});
afterEach(() => {
  root.remove();
  document.body.innerHTML = "";
});

/* --------------------------- tests --------------------------- */

describe("usePullToRefresh", () => {
  it("triggers once at true scrollTop === 0 past threshold", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<Probe enabled onRefresh={onRefresh} threshold={40} />);
    await act(async () => {
      fire(root, "touchstart", 100, 10);
      fire(root, "touchmove", 100, 200); // dy=190 → resisted=95 → past 40
      fire(root, "touchend", 100, 200);
      await Promise.resolve();
    });
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    unmount();
  });

  it("does NOT trigger when scrollTop > 0", async () => {
    const onRefresh = vi.fn();
    render(<Probe enabled onRefresh={onRefresh} threshold={40} />);
    (root as any).scrollTop = 200;
    await act(async () => {
      fire(root, "touchstart", 100, 10);
      fire(root, "touchmove", 100, 250);
      fire(root, "touchend", 100, 250);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("aborts on horizontal gesture", async () => {
    const onRefresh = vi.fn();
    render(<Probe enabled onRefresh={onRefresh} threshold={40} />);
    await act(async () => {
      fire(root, "touchstart", 100, 10);
      fire(root, "touchmove", 250, 20); // dx=150 dy=10 → horizontal
      fire(root, "touchend", 250, 20);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does NOT trigger when the touch starts on an interactive element", async () => {
    const onRefresh = vi.fn();
    const btn = document.createElement("button");
    root.appendChild(btn);
    render(<Probe enabled onRefresh={onRefresh} threshold={40} />);
    await act(async () => {
      fire(root, "touchstart", 100, 10, btn);
      fire(root, "touchmove", 100, 200, btn);
      fire(root, "touchend", 100, 200, btn);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does NOT trigger while an open dialog / bottom sheet exists", async () => {
    const onRefresh = vi.fn();
    const dlg = document.createElement("div");
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("data-state", "open");
    document.body.appendChild(dlg);
    render(<Probe enabled onRefresh={onRefresh} threshold={40} />);
    await act(async () => {
      fire(root, "touchstart", 100, 10);
      fire(root, "touchmove", 100, 200);
      fire(root, "touchend", 100, 200);
    });
    expect(onRefresh).not.toHaveBeenCalled();
    dlg.remove();
  });

  it("prevents overlapping refreshes (second gesture is a no-op while refreshing)", async () => {
    let resolveIt: () => void = () => {};
    const onRefresh = vi.fn().mockImplementation(
      () => new Promise<void>((r) => (resolveIt = r)),
    );
    render(<Probe enabled onRefresh={onRefresh} threshold={40} />);
    await act(async () => {
      fire(root, "touchstart", 100, 10);
      fire(root, "touchmove", 100, 200);
      fire(root, "touchend", 100, 200);
      await Promise.resolve();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      fire(root, "touchstart", 100, 10);
      fire(root, "touchmove", 100, 200);
      fire(root, "touchend", 100, 200);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveIt();
      await Promise.resolve();
    });
  });

  it("removes listeners on unmount", async () => {
    const onRefresh = vi.fn();
    const remove = vi.spyOn(root, "removeEventListener");
    const { unmount } = render(<Probe enabled onRefresh={onRefresh} />);
    unmount();
    const kinds = remove.mock.calls.map((c) => c[0]);
    expect(kinds).toEqual(
      expect.arrayContaining(["touchstart", "touchmove", "touchend", "touchcancel"]),
    );
  });

  it("is disabled when enabled=false (no listeners attached)", async () => {
    const onRefresh = vi.fn();
    const add = vi.spyOn(root, "addEventListener");
    render(<Probe enabled={false} onRefresh={onRefresh} />);
    const kinds = add.mock.calls.map((c) => c[0]);
    expect(kinds).not.toEqual(
      expect.arrayContaining(["touchstart", "touchmove", "touchend"]),
    );
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("handles onRefresh errors and resets state", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("boom"));
    let last: { refreshing: boolean; pullY: number } = { refreshing: false, pullY: 0 };
    render(
      <Probe
        enabled
        onRefresh={onRefresh}
        threshold={40}
        onState={(s) => {
          last = s;
        }}
      />,
    );
    await act(async () => {
      fire(root, "touchstart", 100, 10);
      fire(root, "touchmove", 100, 200);
      fire(root, "touchend", 100, 200);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(last.refreshing).toBe(false));
    expect(last.pullY).toBe(0);
  });
});
