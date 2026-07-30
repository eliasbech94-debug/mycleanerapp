import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProviderFeatureRoadmap } from "./ProviderFeatureRoadmap";
import { PROVIDER_FEATURE_ROADMAP } from "@/config/provider-feature-roadmap";

afterEach(cleanup);

describe("ProviderFeatureRoadmap", () => {
  it("keeps every locked feature free of a route", () => {
    const locked = PROVIDER_FEATURE_ROADMAP.filter((feature) => !feature.route);

    expect(locked.length).toBeGreaterThan(0);
    expect(locked.every((feature) => feature.route === undefined)).toBe(true);
  });

  it("uses only known provider routes for enabled cards", () => {
    const allowedRoutes = new Set(["/verify-identity", "/provider/profile"]);
    const routes = PROVIDER_FEATURE_ROADMAP.flatMap((feature) =>
      feature.route ? [feature.route] : [],
    );

    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((route) => allowedRoutes.has(route))).toBe(true);
  });

  it("opens a status dialog when a locked feature is clicked", () => {
    render(
      <MemoryRouter>
        <ProviderFeatureRoadmap />
      </MemoryRouter>,
    );

    const lockedCard = screen.getByRole("button", {
      name: /Introduktionsvideo: Under udvikling/i,
    });

    expect(lockedCard.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(lockedCard);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Introduktionsvideo")).toBeTruthy();
    expect(screen.getByText("Under udvikling")).toBeTruthy();
  });
});
