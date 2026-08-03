import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SectionErrorState } from "./SectionErrorState";

describe("SectionErrorState", () => {
  it("renders the friendly message and an ARIA-live region", () => {
    render(<SectionErrorState message="Kunne ikke hente sektion" />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Kunne ikke hente sektion")).toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<SectionErrorState onRetry={onRetry} compact />);
    fireEvent.click(screen.getByRole("button", { name: /prøv igen/i }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });

  it("disables the retry button while retrying", async () => {
    let resolve!: () => void;
    const onRetry = vi.fn(
      () => new Promise<void>((r) => { resolve = r; }),
    );
    render(<SectionErrorState onRetry={onRetry} />);
    const btn = screen.getByRole("button", { name: /prøv igen/i });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    resolve();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("hides the retry button when no onRetry is passed", () => {
    render(<SectionErrorState />);
    expect(screen.queryByRole("button", { name: /prøv igen/i })).toBeNull();
  });
});
