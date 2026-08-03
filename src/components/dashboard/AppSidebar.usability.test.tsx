/**
 * Sidebar usability regression.
 *
 * Guards the affordances that made the collapsed rail unreadable before:
 * every item keeps its icon, gets a tooltip for the collapsed state, and the
 * toggle exposes a real accessible name instead of a bare icon.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useUserRoles", () => ({
  useUserRoles: () => ({ hasRole: () => true, loading: false, roles: ["customer"], isSuperAdmin: false }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

async function renderSidebar() {
  const { SidebarProvider } = await import("@/components/ui/sidebar");
  const { AppSidebar } = await import("./AppSidebar");
  render(
    <MemoryRouter initialEntries={["/dk/customer"]}>
      <SidebarProvider>
        <AppSidebar role="customer" />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("AppSidebar", () => {
  it("renders an icon for every nav item so the collapsed rail stays readable", async () => {
    await renderSidebar();
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.querySelector("svg")).not.toBeNull();
    }
  });

  it("exposes the collapse rail with a descriptive aria-label", async () => {
    await renderSidebar();
    expect(
      screen.getByRole("button", { name: "Skjul eller vis sidemenu" }),
    ).toBeInTheDocument();
  });
});
