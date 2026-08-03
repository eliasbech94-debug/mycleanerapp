import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatMoneyMinor,
  NOTIFY_LANGS,
  NOTIFY_TEMPLATES,
  interpolate,
  normalizeLang,
  renderNotification,
} from "../../supabase/functions/_shared/notifyI18n";

describe("server notification localization", () => {
  it("normalizes locales with English fallback", () => {
    expect(normalizeLang("da-DK")).toBe("da");
    expect(normalizeLang("SV")).toBe("sv");
    expect(normalizeLang("fr")).toBe("en");
    expect(normalizeLang(null)).toBe("en");
  });

  it("has every language for every template", () => {
    for (const [key, pack] of Object.entries(NOTIFY_TEMPLATES)) {
      for (const lang of NOTIFY_LANGS) {
        expect(pack[lang], `${key}/${lang}`).toBeTruthy();
        expect(pack[lang].subject.trim().length, `${key}/${lang}`).toBeGreaterThan(0);
        expect(pack[lang].body.trim().length, `${key}/${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps interpolation placeholders consistent across languages", () => {
    const vars = (s: string) => (s.match(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g) ?? []).sort().join(",");
    for (const [key, pack] of Object.entries(NOTIFY_TEMPLATES)) {
      const ref = vars(pack.en.subject + pack.en.body);
      for (const lang of NOTIFY_LANGS) {
        expect(vars(pack[lang].subject + pack[lang].body), `${key}/${lang}`).toBe(ref);
      }
    }
  });

  it("renders localized copy per language", () => {
    const da = renderNotification("booking.cancelled", "da", {
      ref: "MC-ABC", service: "rengøring", actor: "kunde",
    });
    expect(da?.subject).toBe("Booking MC-ABC annulleret");
    const de = renderNotification("booking.cancelled", "de", {
      ref: "MC-ABC", service: "Reinigung", actor: "Kunde",
    });
    expect(de?.subject).toBe("Buchung MC-ABC storniert");
  });

  it("returns null for unknown events so callers keep literal copy", () => {
    expect(renderNotification("does.not.exist", "en", {})).toBeNull();
  });

  it("formats money and dates per locale", () => {
    expect(formatMoneyMinor(125050, "DKK", "da")).toMatch(/1[.\s]250,50/);
    expect(formatMoneyMinor(125050, "GBP", "en")).toContain("1,250.50");
    expect(formatDate("2026-08-01T10:00:00Z", "de")).toContain("2026");
  });

  it("drops missing variables instead of printing raw placeholders", () => {
    expect(interpolate("Hi {{name}}!", {})).toBe("Hi !");
  });
});
