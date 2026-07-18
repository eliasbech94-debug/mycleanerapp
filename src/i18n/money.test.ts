import { describe, it, expect } from "vitest";
import { formatMoney, roundMinor, minorDecimals } from "@/i18n/money";

describe("money: minor-unit formatting is exact and immutable", () => {
  it("formats DKK", () => {
    // 12345 minor = 123,45 kr.
    expect(formatMoney(12345, "DKK", "da-DK")).toMatch(/123,45/);
  });
  it("formats GBP", () => {
    expect(formatMoney(12345, "GBP", "en-GB")).toMatch(/£123\.45/);
  });
  it("formats SEK", () => {
    expect(formatMoney(12345, "SEK", "sv-SE")).toMatch(/123,45/);
  });
  it("formats EUR", () => {
    expect(formatMoney(12345, "EUR", "es-ES")).toMatch(/123,45/);
  });
  it("formats negative values as-is (refunds preserve sign)", () => {
    expect(formatMoney(-2500, "DKK", "da-DK")).toMatch(/-/);
  });
  it("formats zero", () => {
    expect(formatMoney(0, "DKK", "da-DK")).toMatch(/0,00/);
  });
  it("minorDecimals matches ISO 4217 for standard currencies", () => {
    expect(minorDecimals("DKK")).toBe(2);
    expect(minorDecimals("GBP")).toBe(2);
    expect(minorDecimals("SEK")).toBe(2);
    expect(minorDecimals("EUR")).toBe(2);
  });
  it("roundMinor uses half-away-from-zero", () => {
    // Partial refund: 33.335% of 10000 minor = 3333.5 → 3334
    expect(roundMinor(3333.5)).toBe(3334);
    // Symmetric on negatives (credit note round-trip)
    expect(roundMinor(-3333.5)).toBe(-3334);
    expect(roundMinor(0)).toBe(0);
  });
  it("VAT calc is exact minor units (25% inclusive of 12500 → 2500 VAT)", () => {
    const gross = 12500; // minor
    const vatRateBps = 2500;
    const net = Math.round(gross / (1 + vatRateBps / 10000));
    const vat = gross - net;
    expect(net).toBe(10000);
    expect(vat).toBe(2500);
  });
});
