import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProviderShareCard, { providerShareUrl } from "./ProviderShareCard";

vi.mock("qrcode", () => ({
  default: {
    toString: vi.fn(async () => "<svg data-testid='mock-qr'></svg>"),
    toDataURL: vi.fn(async () => "data:image/png;base64,AAA"),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: [{ available: true, reason: "ok" }], error: null })),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(async () => undefined) },
  });
});

describe("ProviderShareCard", () => {
  it("renders the public link with provider_direct_link source", () => {
    render(<ProviderShareCard slug="marie" isPublic />);
    const input = screen.getByLabelText("Dit link") as HTMLInputElement;
    expect(input.value).toContain("/p/marie?src=provider_direct_link");
  });

  it("QR payload uses canonical provider_qr source", () => {
    expect(providerShareUrl("marie", "provider_qr")).toContain("src=provider_qr");
    expect(providerShareUrl("marie", "provider_qr")).not.toContain("provider_qr_code");
  });

  it("preview section links to the public profile", () => {
    render(<ProviderShareCard slug="marie" isPublic />);
    const link = screen.getByRole("link", { name: /Åbn offentlig profil/i }) as HTMLAnchorElement;
    expect(link.href).toContain("/p/marie");
    expect(link.href).toContain("src=provider_direct_link");
  });

  it("copy button writes URL to clipboard", async () => {
    render(<ProviderShareCard slug="marie" isPublic />);
    fireEvent.click(screen.getByLabelText("Kopiér link"));
    await waitFor(() => {
      expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.stringContaining("/p/marie")
      );
    });
  });

  it("shows warning when profile is not public", () => {
    render(<ProviderShareCard slug="marie" isPublic={false} />);
    expect(screen.getByRole("alert").textContent).toMatch(/ikke offentlig/i);
  });

  it("rename panel opens and disables submit until availability resolves", async () => {
    render(<ProviderShareCard slug="marie" isPublic />);
    fireEvent.click(screen.getByText("Skift link-navn"));
    expect(screen.getByTestId("rename-panel")).toBeTruthy();
    const submit = screen.getAllByRole("button", { name: "Skift link-navn" })[1] as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});
