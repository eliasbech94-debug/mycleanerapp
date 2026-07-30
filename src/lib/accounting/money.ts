/**
 * Integer money helpers.
 *
 * Rules:
 *  - All monetary values are minor units (integers).
 *  - Exchange rates are decimal strings with a fixed scale, never JS floats.
 *  - Conversion is done in scaled integer space and rounded half-up, once.
 */

export const EXCHANGE_RATE_SCALE = 10;

const SCALE_FACTOR = 10n ** BigInt(EXCHANGE_RATE_SCALE);

export function assertInteger(value: number, field: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer minor-unit amount, received ${value}`);
  }
  return value;
}

/** Parse "7.45123" into a scaled bigint at EXCHANGE_RATE_SCALE. */
export function parseRate(rate: string): bigint {
  const trimmed = rate.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid exchange rate "${rate}" — expected a positive decimal string`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(EXCHANGE_RATE_SCALE)).slice(0, EXCHANGE_RATE_SCALE);
  if (frac.length > EXCHANGE_RATE_SCALE) {
    throw new Error(
      `Exchange rate "${rate}" exceeds the documented scale of ${EXCHANGE_RATE_SCALE} decimals`,
    );
  }
  return BigInt(whole) * SCALE_FACTOR + BigInt(padded || "0");
}

/**
 * Convert a minor-unit amount using a decimal-string rate.
 * Documented rounding: half-up on the absolute value, sign preserved.
 */
export function convertMinor(amountMinor: number, rate: string): number {
  assertInteger(amountMinor, "amountMinor");
  const scaled = parseRate(rate);
  const negative = amountMinor < 0;
  const abs = BigInt(Math.abs(amountMinor));
  const product = abs * scaled;
  const quotient = product / SCALE_FACTOR;
  const remainder = product % SCALE_FACTOR;
  const rounded = remainder * 2n >= SCALE_FACTOR ? quotient + 1n : quotient;
  const result = Number(rounded);
  return negative ? -result : result;
}

/** Apply a basis-point rate to a minor amount. 2500 bp = 25 %. Half-up. */
export function applyBasisPoints(amountMinor: number, basisPoints: number): number {
  assertInteger(amountMinor, "amountMinor");
  assertInteger(basisPoints, "basisPoints");
  const negative = amountMinor < 0;
  const abs = BigInt(Math.abs(amountMinor));
  const product = abs * BigInt(basisPoints);
  const quotient = product / 10000n;
  const remainder = product % 10000n;
  const rounded = remainder * 2n >= 10000n ? quotient + 1n : quotient;
  const result = Number(rounded);
  return negative ? -result : result;
}

/** Apply an integer percentage (0-100) to a minor amount. Half-up. */
export function applyPercentage(amountMinor: number, percentage: number): number {
  return applyBasisPoints(amountMinor, Math.round(percentage * 100));
}

export function sumMinor(values: number[]): number {
  return values.reduce((acc, value) => acc + assertInteger(value, "value"), 0);
}

export function formatMinor(
  amountMinor: number | null,
  currency: string | null,
  locale: string | null,
): string {
  if (amountMinor == null || !currency) return "—";
  return new Intl.NumberFormat(locale || "en", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}
