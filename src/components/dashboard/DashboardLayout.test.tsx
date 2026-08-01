/**
 * Dashboard shell layout regression.
 *
 * The dashboard start page must not stack a second "Tilbage" control under the
 * global site header, while sub-sections must still offer one.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => ({ hasRole: () => true, loading: false, roles: ["admin"], isSuperAdmin: false }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

async function renderLayout(props: Record<string, unknown> = {}) {
  const { DashboardLayout } = await import("./DashboardLayout");
  render(
    <MemoryRouter initialEntries={["/dk/admin"]}>
      <DashboardLayout role="admin" title="Test" {...props}>
        <p>indhold</p>
      </DashboardLayout>
    </MemoryRouter>,
  );
}

describe("DashboardLayout", () => {
  it("hides the in-dashboard back control on start pages", async () => {
    await renderLayout();
    expect(screen.queryByRole("button", { name: /tilbage/i })).toBeNull();
  });

  it("shows a back control when a sub-section opts in", async () => {
    await renderLayout({ showBack: true, backTo: "/admin" });
    expect(
      screen.getByRole("button", { name: "Tilbage til forrige side" }),
    ).toBeInTheDocument();
  });

  it("labels the sidebar toggle", async () => {
    await renderLayout();
    expect(
      screen.getByRole("button", { name: "Skjul sidemenu" }),
    ).toBeInTheDocument();
  });
});
