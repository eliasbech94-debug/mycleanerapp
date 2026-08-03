/**
 * MobileAppShell — Phase 5B transition & scroll-root exposure tests.
 * Verifies:
 *  - <main> exposes `data-mobile-scroll-root` (contract used by
 *    usePullToRefresh) and applies the route-enter class on the content
 *    wrapper without remounting children on pathname change.
 */
import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { MobileAppShell } from "./MobileAppShell";

function Child() {
  return <div data-testid="child">child</div>;
}

function Nav({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button data-testid="go" onClick={() => navigate(to)}>
      go
    </button>
  );
}

describe("MobileAppShell (Phase 5B)", () => {
  it("exposes data-mobile-scroll-root on <main>", () => {
    const { container } = render(
      <MemoryRouter>
        <MobileAppShell appBar={false}>
          <Child />
        </MobileAppShell>
      </MemoryRouter>,
    );
    const root = container.querySelector("[data-mobile-scroll-root]");
    expect(root).not.toBeNull();
    expect(root?.tagName).toBe("MAIN");
  });

  it("applies mobile-route-enter class and does NOT remount child on route change", () => {
    const { getByTestId, container } = render(
      <MemoryRouter initialEntries={["/a"]}>
        <MobileAppShell appBar={false}>
          <Child />
          <Nav to="/b" />
        </MobileAppShell>
      </MemoryRouter>,
    );
    const childBefore = getByTestId("child");
    const wrapper = container.querySelector('[data-testid="mobile-route-content"]');
    expect(wrapper?.classList.contains("mobile-route-enter")).toBe(true);

    act(() => {
      (getByTestId("go") as HTMLButtonElement).click();
    });

    const childAfter = getByTestId("child");
    // Same DOM node → no remount → auth/data preserved.
    expect(childAfter).toBe(childBefore);
    expect(wrapper?.classList.contains("mobile-route-enter")).toBe(true);
  });
});
