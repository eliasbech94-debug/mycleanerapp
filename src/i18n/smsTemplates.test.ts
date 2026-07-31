import { describe, expect, it } from "vitest";
import {
  calculateSegments,
  countEmoji,
  renderSms,
  renderSmsForNotification,
  SENSITIVE_CATEGORIES,
  SMS_LANGS,
  SMS_TEMPLATES,
} from "../../supabase/functions/_shared/smsTemplates";

const JOKE_MARKERS = [
  "haha", "lol", "😂", "🤣", "😜", "😉", "🎉", "🥳", "joke", "sjov", "skoj", "witz", "broma",
];

describe("SMS template layer", () => {
  it("has all five languages for every template", () => {
    for (const [key, def] of Object.entries(SMS_TEMPLATES)) {
      for (const lang of SMS_LANGS) {
        expect(def.text[lang], `${key}/${lang}`).toBeTruthy();
        expect(def.text[lang].trim().length, `${key}/${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps identical placeholders across languages", () => {
    const ph = (s: string) =>
      Array.from(s.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)).map((m) => m[1]).sort().join(",");
    for (const [key, def] of Object.entries(SMS_TEMPLATES)) {
      const base = ph(def.text.en);
      for (const lang of SMS_LANGS) {
        expect(ph(def.text[lang]), `${key}/${lang}`).toBe(base);
      }
    }
  });

  it("renders the verification code in all five languages", () => {
    const expected: Record<string, string> = {
      da: "Din MyCleaner-kode er 123456 🔐 Den udløber om 10 minutter.",
      en: "Your MyCleaner code is 123456 🔐 It expires in 10 minutes.",
      sv: "Din MyCleaner-kod är 123456 🔐 Den upphör om 10 minuter.",
      de: "Dein MyCleaner-Code lautet 123456 🔐 Er läuft in 10 Minuten ab.",
      es: "Tu código de MyCleaner es 123456 🔐 Caduca en 10 minutos.",
    };
    for (const lang of SMS_LANGS) {
      const r = renderSms("verification.code", lang, { code: "123456", minutes: 10 });
      expect(r?.text).toBe(expected[lang]);
      expect(r?.lang).toBe(lang);
      expect(r?.category).toBe("security");
    }
  });

  it("falls back to English for unsupported or missing languages", () => {
    expect(renderSms("verification.code", "fr", { code: "1", minutes: 10 })?.lang).toBe("en");
    expect(renderSms("verification.code", null, { code: "1", minutes: 10 })?.lang).toBe("en");
    expect(renderSms("verification.code", "da-DK", { code: "1", minutes: 10 })?.lang).toBe("da");
  });

  it("reports missing variables instead of leaking placeholders", () => {
    const r = renderSms("verification.code", "da", { code: "123456" });
    expect(r?.missingVars).toEqual(["minutes"]);
    expect(r?.text).not.toContain("{{");
    expect(r?.text).not.toContain("undefined");
  });

  it("returns null for unknown keys", () => {
    expect(renderSms("does.not.exist", "da")).toBeNull();
  });

  it("allows at most one emoji per SMS", () => {
    for (const [key, def] of Object.entries(SMS_TEMPLATES)) {
      for (const lang of SMS_LANGS) {
        expect(countEmoji(def.text[lang]), `${key}/${lang}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps jokes out of security, payment, complaint and cancellation copy", () => {
    for (const [key, def] of Object.entries(SMS_TEMPLATES)) {
      if (!SENSITIVE_CATEGORIES.includes(def.category)) continue;
      for (const lang of SMS_LANGS) {
        const text = def.text[lang].toLowerCase();
        for (const marker of JOKE_MARKERS) {
          expect(text.includes(marker), `${key}/${lang}/${marker}`).toBe(false);
        }
      }
    }
  });

  it("keeps every message within two segments", () => {
    for (const [key, def] of Object.entries(SMS_TEMPLATES)) {
      for (const lang of SMS_LANGS) {
        const seg = calculateSegments(def.text[lang]);
        expect(seg.segments, `${key}/${lang}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("reuses notifyI18n copy when no SMS-specific template exists", () => {
    const r = renderSmsForNotification("credit_note.available", "da", { ref: "B-1", number: "K-1" });
    expect(r?.text).toContain("kreditnota");
    expect(renderSmsForNotification("totally.unknown", "da")).toBeNull();
  });
});

describe("segment calculation", () => {
  it("detects GSM-7 and counts single segments", () => {
    const seg = calculateSegments("Hello from MyCleaner");
    expect(seg.encoding).toBe("GSM-7");
    expect(seg.units).toBe(20);
    expect(seg.segments).toBe(1);
  });

  it("counts GSM-7 extended characters as two septets", () => {
    expect(calculateSegments("[").units).toBe(2);
    expect(calculateSegments("€").units).toBe(2);
  });

  it("splits GSM-7 into 153-septet parts above 160", () => {
    expect(calculateSegments("a".repeat(160)).segments).toBe(1);
    expect(calculateSegments("a".repeat(161)).segments).toBe(2);
    expect(calculateSegments("a".repeat(306)).segments).toBe(2);
    expect(calculateSegments("a".repeat(307)).segments).toBe(3);
  });

  it("switches to UCS-2 with 70/67 limits when emoji are present", () => {
    const seg = calculateSegments(`${"a".repeat(60)} 🔐`);
    expect(seg.encoding).toBe("UCS-2");
    expect(seg.segments).toBe(1);
    expect(calculateSegments(`${"a".repeat(80)} 🔐`).segments).toBe(2);
  });

  it("returns zero segments for empty text", () => {
    expect(calculateSegments("").segments).toBe(0);
  });

  it("computes segments on rendered messages", () => {
    const r = renderSms("verification.code", "da", { code: "123456", minutes: 10 });
    expect(r?.segments.encoding).toBe("UCS-2");
    expect(r?.segments.segments).toBe(1);
  });
});
