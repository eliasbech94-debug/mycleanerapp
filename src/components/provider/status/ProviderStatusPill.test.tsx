import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ProviderStatusPill from "@/components/provider/status/ProviderStatusPill";
import { resolveProviderStatus } from "@/lib/providerStatus";

const status = (over: Record<string, unknown> = {}) =>
  resolveProviderStatus({
    provider_user_id: "u1",
    provider_slug: "anna",
    status: "available",
    active_until: null,
    next_available_at: null,
    timezone: "Europe/Copenhagen",
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

describe("ProviderStatusPill", () => {
  it("renders the compact pill without presence", () => {
    render(<ProviderStatusPill status={status({ presence_minutes: 1 })} size="sm" />);
    expect(screen.getByTestId("provider-status-available")).toBeInTheDocument();
    expect(screen.queryByText("Online nu")).toBeNull();
  });

  it("renders presence beneath the status when allowed", () => {
    render(<ProviderStatusPill status={status({ presence_minutes: 1 })} showPresence />);
    expect(screen.getByText("Tilgængelig nu")).toBeInTheDocument();
    expect(screen.getByText("Online nu")).toBeInTheDocument();
  });

  it("hides presence when the heartbeat is older than 60 minutes", () => {
    render(<ProviderStatusPill status={status({ presence_minutes: 120 })} showPresence />);
    expect(screen.queryByText(/Aktiv/)).toBeNull();
    expect(screen.queryByText("Online nu")).toBeNull();
  });

  it("shows the short travelling label on compact cards", () => {
    render(<ProviderStatusPill status={status({ status: "travelling" })} size="sm" />);
    expect(screen.getByText("På vej")).toBeInTheDocument();
    expect(screen.queryByText("På vej til kunde")).toBeNull();
  });

  it("shows the descriptive travelling label when there is room", () => {
    render(<ProviderStatusPill status={status({ status: "travelling" })} useLongLabel />);
    expect(screen.getByText("På vej til kunde")).toBeInTheDocument();
  });
});
