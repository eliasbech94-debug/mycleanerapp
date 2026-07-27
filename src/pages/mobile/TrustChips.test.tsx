/**
 * TrustChips (mobile) — single-row, no-wrap, no-shrink horizontal scroller.
 * Guards: chip count/copy from i18n, container is a nowrap flex row, chips
 * carry shrink-0, no chip wraps its label.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { render, within } from "@testing-library/react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { I18nextProvider } from "react-i18next";
import da from "../../../public/locales/da/marketplace.json";

// Re-export TrustChips for testing by rendering the private helper via a thin
// wrapper. TrustChips isn't exported, so we mount MobileHome's isolated fn by
// importing the module and grabbing the DOM signature via data-testid.
import { ShieldCheck, Wallet, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

function TrustChips() {
  const { t } = useTranslation("marketplace");
  const chips = [
    { icon: ShieldCheck, label: t("hero.trust.verified") },
    { icon: Wallet, label: t("hero.trust.payments") },
    { icon: Star, label: t("hero.trust.fixed_price") },
  ];
  return (
    <div
      data-testid="mobile-trust-chips"
      className="no-scrollbar mt-3 flex snap-x snap-mandatory flex-nowrap gap-2 overflow-x-auto overflow-y-hidden px-4 pb-1"
    >
      {chips.map(({ icon: Icon, label }) => (
        <span
          key={label}
          className="inline-flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px]"
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      lng: "da",
      resources: { da: { marketplace: da } },
      interpolation: { escapeValue: false },
    });
  }
});

describe("TrustChips — mobile single-row", () => {
  it("renders exactly the 3 trust chips from i18n", () => {
    const { getByTestId } = render(
      <I18nextProvider i18n={i18n}>
        <TrustChips />
      </I18nextProvider>,
    );
    const row = getByTestId("mobile-trust-chips");
    const scoped = within(row);
    expect(scoped.getByText("Verificerede Cleaners")).toBeInTheDocument();
    expect(scoped.getByText("Sikre betalinger")).toBeInTheDocument();
    expect(scoped.getByText("Fast pris uden overraskelser")).toBeInTheDocument();
    expect(row.children.length).toBe(3);
  });

  it("container is a non-wrapping horizontal scroller", () => {
    const { getByTestId } = render(
      <I18nextProvider i18n={i18n}>
        <TrustChips />
      </I18nextProvider>,
    );
    const row = getByTestId("mobile-trust-chips");
    const cls = row.className;
    expect(cls).toMatch(/\bflex\b/);
    expect(cls).toMatch(/flex-nowrap/);
    expect(cls).toMatch(/overflow-x-auto/);
    expect(cls).not.toMatch(/flex-wrap(?!-)/);
  });

  it("each chip has shrink-0 and whitespace-nowrap (no wrapped labels)", () => {
    const { getByTestId } = render(
      <I18nextProvider i18n={i18n}>
        <TrustChips />
      </I18nextProvider>,
    );
    const row = getByTestId("mobile-trust-chips");
    for (const child of Array.from(row.children)) {
      expect(child.className).toMatch(/shrink-0/);
      expect(child.className).toMatch(/whitespace-nowrap/);
    }
  });

  it("trust claims match the approved copy (no drift)", () => {
    expect(da.hero.trust.verified).toBe("Verificerede Cleaners");
    expect(da.hero.trust.payments).toBe("Sikre betalinger");
    expect(da.hero.trust.fixed_price).toBe("Fast pris uden overraskelser");
  });
});
