import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation, Link } from "react-router-dom";
import { BackButton } from "./BackButton";

/**
 * End-to-end style tests for <BackButton />.
 *
 * Verifies that clicking (or triggering Alt+Left on) the tilbage-knap always
 * moves exactly ONE step back in the router history — regardless of whether
 * the user is on a site page (/services, /providers/...) or a dashboard page
 * (/dashboard, /provider/bilag, ...).
 */

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="pathname">{loc.pathname}</div>;
};

const Page = ({ title, next }: { title: string; next?: string }) => (
  <div>
    <h1>{title}</h1>
    <BackButton />
    {next && <Link to={next}>go to {next}</Link>}
    <LocationProbe />
  </div>
);

const renderAt = (entries: string[]) => {
  // Bump window.history so BackButton's `window.history.length > 1` guard
  // passes inside jsdom (which starts at length 1).
  entries.slice(1).forEach((_, i) =>
    window.history.pushState({}, "", `/__test__/${i}`)
  );

  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/" element={<Page title="Home" />} />
        <Route path="/services" element={<Page title="Services" />} />
        <Route
          path="/providers/:id"
          element={<Page title="Provider profile" />}
        />
        <Route path="/dashboard" element={<Page title="Dashboard" />} />
        <Route path="/provider/bilag" element={<Page title="Bilag" />} />
        <Route path="/profile" element={<Page title="Profile" />} />
      </Routes>
    </MemoryRouter>
  );
};

describe("BackButton — always goes one step back", () => {
  beforeEach(() => {
    // Reset window.history length between tests as best we can.
    window.history.replaceState({}, "", "/");
  });

  it("navigates from a site page back to the previous site page", () => {
    renderAt(["/services", "/providers/abc"]);
    expect(screen.getByTestId("pathname").textContent).toBe("/providers/abc");

    fireEvent.click(screen.getByRole("button", { name: /forrige side/i }));

    expect(screen.getByTestId("pathname").textContent).toBe("/services");
  });

  it("navigates from a dashboard page back to the previous dashboard page", () => {
    renderAt(["/dashboard", "/provider/bilag"]);
    expect(screen.getByTestId("pathname").textContent).toBe("/provider/bilag");

    fireEvent.click(screen.getByRole("button", { name: /forrige side/i }));

    expect(screen.getByTestId("pathname").textContent).toBe("/dashboard");
  });

  it("navigates from a dashboard page back to a site page (cross-area)", () => {
    renderAt(["/services", "/dashboard"]);
    expect(screen.getByTestId("pathname").textContent).toBe("/dashboard");

    fireEvent.click(screen.getByRole("button", { name: /forrige side/i }));

    expect(screen.getByTestId("pathname").textContent).toBe("/services");
  });

  it("only moves ONE step back per click (multiple clicks step one-by-one)", () => {
    renderAt(["/services", "/providers/abc", "/dashboard", "/profile"]);
    expect(screen.getByTestId("pathname").textContent).toBe("/profile");

    const btn = () => screen.getByRole("button", { name: /forrige side/i });

    fireEvent.click(btn());
    expect(screen.getByTestId("pathname").textContent).toBe("/dashboard");

    fireEvent.click(btn());
    expect(screen.getByTestId("pathname").textContent).toBe("/providers/abc");

    fireEvent.click(btn());
    expect(screen.getByTestId("pathname").textContent).toBe("/services");
  });

  it("Alt+Left keyboard shortcut also goes exactly one step back", () => {
    renderAt(["/dashboard", "/provider/bilag"]);
    expect(screen.getByTestId("pathname").textContent).toBe("/provider/bilag");

    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });

    expect(screen.getByTestId("pathname").textContent).toBe("/dashboard");
  });

  it("is hidden on the root path by default (nothing to go back to)", () => {
    renderAt(["/"]);
    expect(
      screen.queryByRole("button", { name: /forrige side/i })
    ).toBeNull();
  });

  it("exposes an accessible aria-label and Alt+ArrowLeft shortcut hint", () => {
    renderAt(["/services", "/dashboard"]);
    const btn = screen.getByRole("button", { name: /forrige side/i });
    expect(btn.getAttribute("aria-label")).toMatch(/Alt \+ venstre pil/i);
    expect(btn.getAttribute("aria-keyshortcuts")).toBe("Alt+ArrowLeft");
  });
});
