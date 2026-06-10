import { z } from "zod";

/**
 * Onboarding validation
 * Single source of truth for "is this onboarding step truly complete?"
 * Used by the customer profile + provider dashboard checklists.
 */

// E.164-ish: optional leading +, 8–15 digits total. Allows local Danish (8 digits).
const phoneRegex = /^\+?[0-9]{8,15}$/;
const normalizePhone = (v: string) => v.replace(/[\s\-()]/g, "");

export const contactSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Navn skal være mindst 2 tegn")
    .max(100, "Navn må højst være 100 tegn")
    .refine((v) => v.split(/\s+/).length >= 2, "Indtast både for- og efternavn"),
  phone: z
    .string()
    .trim()
    .transform(normalizePhone)
    .refine((v) => phoneRegex.test(v), "Indtast et gyldigt telefonnummer (8–15 cifre)"),
  country_code: z
    .string()
    .trim()
    .length(2, "Land mangler"),
});

export const addressSchema = z.object({
  address: z.string().trim().min(5, "Adresse er for kort").max(200),
  address_place_id: z.string().min(1, "Vælg adresse fra forslagene"),
  lat: z.number().refine((v) => v >= -90 && v <= 90, "Ugyldig lokation"),
  lng: z.number().refine((v) => v >= -180 && v <= 180, "Ugyldig lokation"),
});

export const propertySchema = z.object({
  place_type: z.enum(["private", "business", "vacation_rental", "other"] as const),
  size_sqm: z.number().int().min(5, "Angiv størrelse i m²").max(2000),
  rooms: z.number().int().min(1).max(30).optional().nullable(),
  access_method: z.enum(["home", "key_safe", "doorman", "neighbor", "other"] as const),
});

export type ValidationResult = {
  ok: boolean;
  /** First error message if any */
  error?: string;
  /** Map of field -> first error, useful for inline UI */
  fieldErrors?: Record<string, string>;
};

function toResult(parsed: z.SafeParseReturnType<any, any>): ValidationResult {
  if (parsed.success) return { ok: true };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const first = parsed.error.issues[0]?.message;
  return { ok: false, error: first, fieldErrors };
}

export const validateContact = (input: unknown): ValidationResult =>
  toResult(contactSchema.safeParse(input));

export const validateAddress = (input: unknown): ValidationResult =>
  toResult(addressSchema.safeParse(input));

export const validateProperty = (input: unknown): ValidationResult =>
  toResult(propertySchema.safeParse(input));

/** Helper: derive checklist status from a validation + optional "in progress" state */
export function statusFrom(
  v: ValidationResult,
  opts?: { loading?: boolean; pendingIfMissing?: boolean },
): "complete" | "pending" | "incomplete" {
  if (opts?.loading) return "pending";
  if (v.ok) return "complete";
  if (opts?.pendingIfMissing) return "pending";
  return "incomplete";
}
