/**
 * Early Access empty state — the honest production state when there are zero
 * real, published providers. It must never render invented profiles, ratings,
 * booking counts, distances or online status.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EarlyAccessEmptyState } from "@/components/marketplace/EarlyAccessEmptyState";

const renderState = (compact = false) =>
  render(
    <MemoryRouter>
      <EarlyAccessEmptyState compact={compact} />
    </MemoryRouter>,
  );

describe("EarlyAccessEmptyState", () => {
  it("shows the approved headline and body copy", () => {
    renderState();
    expect(screen.getByRole("heading", { name: /Vi er lige åbnet/ })).toBeInTheDocument();
    expect(
      screen.getByText(
        /De første Founding Cleaners er ved at oprette deres profiler\. Kom snart tilbage – eller bliv en af de første\./,
      ),
    ).toBeInTheDocument();
  });

  it("offers both approved actions", () => {
    renderState();
    expect(screen.getByRole("link", { name: "Bliv Founding Cleaner" })).toHaveAttribute(
      "href",
      "/bliv-cleaner",
    );
    expect(
      screen.getByRole("link", { name: "Få besked, når der er cleanere nær dig" }),
    ).toBeInTheDocument();
  });

  it("renders no fabricated ratings, review counts, distances or online status", () => {
    const { container } = renderState();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/★|\bkm\b|anmeldelse|bookinger|online\b/i);
    expect(container.querySelector("img")).toBeNull();
  });

  it("supports a compact mobile variant with the same copy", () => {
    renderState(true);
    expect(screen.getByTestId("early-access-empty-state")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Vi er lige åbnet/ })).toBeInTheDocument();
  });
});
