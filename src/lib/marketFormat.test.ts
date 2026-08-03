/**
 * Market formatting contract tests.
 *
 * Locks the separation of market / language / currency and the rule that the
 * frontend never selects or converts a currency.
 */
import { describe, it, expect } from "vitest";
import {
  MARKET_FORMATS,
  CurrencyMismatchError,
  formatAddressLines,
  formatMarketDate,
  formatMarketMoney,
  formatMarketTime,
  formatPhone,
  formatPostcode,
  isValidPostcode,
  marketFormat,
  resolveLocale,
  vatLabel,
} from "./marketFormat";

const nb = (s: string) => s.replace(/\u00a0|\u202f/g, " ");

describe("market profiles", () => {
  it("covers exactly the five launch markets", () => {
    expect(Object.keys(MARKET_FORMATS).sort()).toEqual(["DE", "DK", "ES", "GB", "SE"]);
  });

  it("maps each market to its own currency", () => {
    expect(MARKET_FORMATS.DK.currency).toBe("DKK");
    expect(MARKET_FORMATS.SE.currency).toBe("SEK");
    expect(MARKET_FORMATS.GB.currency).toBe("GBP");
    expect(MARKET_FORMATS.DE.currency).toBe("EUR");
    expect(MARKET_FORMATS.ES.currency).toBe("EUR");
  });

  it("normalises UK to GB without inventing a market", () => {
    expect(marketFormat("uk")?.code).toBe("GB");
    expect(marketFormat("XX")).toBeNull();
    expect(marketFormat(null)).toBeNull();
  });
});

describe("locale resolution keeps market and language separate", () => {
  it("uses the market default language when none is given", () => {
    expect(resolveLocale("DK")).toBe("da-DK");
    expect(resolveLocale("SE")).toBe("sv-SE");
    expect(resolveLocale("DE")).toBe("de-DE");
    expect(resolveLocale("ES")).toBe("es-ES");
    expect(resolveLocale("GB")).toBe("en-GB");
  });

  it("allows browsing a market in another supported language", () => {
    expect(resolveLocale("SE", "en")).toBe("en-SE");
    expect(resolveLocale("DK", "en")).toBe("en-DK");
  });

  it("never falls back to another market's locale", () => {
    expect(resolveLocale("DE", "sv")).toBe("de-DE");
    expect(resolveLocale("ES", "da")).toBe("es-ES");
  });
});

describe("money formatting is server-driven", () => {
  it("formats minor units in the market locale and currency", () => {
    expect(nb(formatMarketMoney({ minor: 24900, currency: "DKK", market: "DK" }))).toContain("249,00");
    expect(nb(formatMarketMoney({ minor: 24900, currency: "SEK", market: "SE" }))).toContain("249,00");
    expect(nb(formatMarketMoney({ minor: 2500, currency: "GBP", market: "GB" }))).toBe("£25.00");
    expect(nb(formatMarketMoney({ minor: 2500, currency: "EUR", market: "DE" }))).toBe("25,00 €");
  });

  it("refuses an amount whose currency contradicts the market", () => {
    expect(() => formatMarketMoney({ minor: 100, currency: "DKK", market: "DE" })).toThrow(
      CurrencyMismatchError,
    );
    expect(() => formatMarketMoney({ minor: 100, currency: "EUR", market: "DK" })).toThrow(
      CurrencyMismatchError,
    );
  });

  it("refuses to render without a server currency", () => {
    expect(() => formatMarketMoney({ minor: 100, currency: "", market: "DK" })).toThrow();
  });

  it("never converts between currencies", () => {
    const dkk = formatMarketMoney({ minor: 100000, currency: "DKK", market: "DK" });
    expect(dkk).toMatch(/1[.\s]000,00/);
  });
});

describe("date, time and number formatting", () => {
  const instant = "2026-08-01T06:00:00.000Z";

  it("renders dates in the market timezone", () => {
    expect(formatMarketTime(instant, "DK")).toBe("08.00");
    expect(formatMarketTime(instant, "GB")).toBe("07:00");
  });

  it("renders localised dates per market", () => {
    expect(formatMarketDate(instant, "DE")).toMatch(/2026/);
    expect(formatMarketDate(instant, "ES")).toMatch(/2026/);
  });
});

describe("VAT designations are local", () => {
  it("uses the local term for each market", () => {
    expect(vatLabel("DK")).toBe("moms");
    expect(vatLabel("SE")).toBe("moms");
    expect(vatLabel("DE")).toBe("MwSt.");
    expect(vatLabel("ES")).toBe("IVA");
    expect(vatLabel("GB")).toBe("VAT");
  });
});

describe("postcodes, phones and addresses", () => {
  it("formats postcodes per market", () => {
    expect(formatPostcode("2100", "DK")).toBe("2100");
    expect(formatPostcode("11330", "SE")).toBe("113 30");
    expect(formatPostcode("ec1r5hl", "GB")).toBe("EC1R 5HL");
    expect(formatPostcode("10115", "DE")).toBe("10115");
  });

  it("validates postcodes per market", () => {
    expect(isValidPostcode("2100", "DK")).toBe(true);
    expect(isValidPostcode("10115", "DK")).toBe(false);
    expect(isValidPostcode("EC1R 5HL", "GB")).toBe(true);
    expect(isValidPostcode("28013", "ES")).toBe(true);
    expect(isValidPostcode("2100", "XX")).toBe(false);
  });

  it("prefixes phone numbers with the market dial code", () => {
    expect(formatPhone("12345678", "DK")).toBe("+4512345678");
    expect(formatPhone("070 123 45 67", "SE")).toBe("+467012345 67".replace(" ", ""));
    expect(formatPhone("+441234567890", "GB")).toBe("+441234567890");
  });

  it("orders address lines per market convention", () => {
    expect(
      formatAddressLines({ street: "Gade 1", postcode: "2100", city: "København", market: "DK" }),
    ).toEqual(["Gade 1", "2100 København"]);
    expect(
      formatAddressLines({
        street: "1 Coldbath Square",
        postcode: "EC1R5HL",
        city: "London",
        market: "GB",
      }),
    ).toEqual(["1 Coldbath Square", "London", "EC1R 5HL"]);
  });
});
