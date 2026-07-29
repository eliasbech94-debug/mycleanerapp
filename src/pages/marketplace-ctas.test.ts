/**
 * Static assertions that our public-discovery surfaces (map, marketplace,
 * homepage) funnel visitors through the canonical `/p/:slug` route with the
 * `marketplace_pick` acquisition source. This is intentionally a source-level
 * test — the alternative would require mounting each page with 20+ mocks and
 * would not add signal.
 *
 * Together with `PublicProviderProfile` (which reads `?src=` and calls
 * `setProviderLock`) this closes Phase-A CTA routing.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("public discovery CTAs use /p/:slug?src=marketplace_pick", () => {
  it("Marketplace list rows link to /p/:slug?src=marketplace_pick", () => {
    const src = read("src/pages/Marketplace.tsx");
    expect(src).toMatch(/\/p\/\$\{[^}]+\}\?src=marketplace_pick/);
  });

  it("Homepage provider cards link to /p/:slug?src=marketplace_pick", () => {
    // Homepage delegates the result rows to <CleanerResultsList/> — the
    // CTA contract lives in that shared component (used by Index.tsx).
    const src = read("src/components/marketplace/CleanerResultsList.tsx");
    expect(src).toMatch(/\/p\/\$\{[^}]+\}\?src=marketplace_pick/);
  });

  it("FindCleaner map CTA navigates to /p/:slug?src=marketplace_pick", () => {
    const src = read("src/pages/FindCleaner.tsx");
    expect(src).toMatch(/navigate\(`\/p\/\$\{[^}]+\}\?src=marketplace_pick`\)/);
  });

  it("PublicProviderProfile sets providerLock on mount", () => {
    const src = read("src/pages/PublicProviderProfile.tsx");
    expect(src).toContain("setProviderLock({");
    expect(src).toMatch(/slug,\s*$/m);
  });

  it("PublicProviderProfile guards 'Se andre cleaners' behind AlertDialog confirmation", () => {
    // The button markup now lives in the shared presentational view.
    const src =
      read("src/pages/PublicProviderProfile.tsx") +
      read("src/components/provider/public/ProviderProfileView.tsx");
    // The button opens the dialog…
    expect(src).toContain('data-testid="see-alternatives-btn"');
    expect(src).toContain("setShowAltDialog(true)");
    // …and only the confirm action clears the lock.
    expect(src).toContain('data-testid="see-alternatives-confirm"');
    expect(src).toMatch(/onClick=\{confirmSeeAlternatives\}/);
    // Cancel button reads as "Bliv hos" and does NOT clear the lock.
    expect(src).toContain("Bliv hos");
    expect(src).not.toMatch(/AlertDialogCancel[^>]*onClick=\{[^}]*clearProviderLock/);
  });

  it("BookingFlow forwards providerLock slug + source to the checkout function", () => {
    const src = read("src/pages/BookingFlow.tsx");
    expect(src).toContain("acquisition_provider_slug: providerLock?.slug ?? null");
    expect(src).toContain('acquisition_source: providerLock?.slug ? providerLock.source : "marketplace"');
  });

  it("Edge function refuses to trust client-supplied provider identity (uses the quote's provider_user_id)", () => {
    const src = read("supabase/functions/payment-create-intent/index.ts");
    // Slug-vs-quote comparison is present.
    expect(src).toContain("slugRow.user_id === providerUserId");
    // Non-matching or missing slug is downgraded to marketplace.
    expect(src).toMatch(/acquisitionSource\s*=\s*"marketplace"/);
  });
});
