/**
 * Central, verified company configuration.
 *
 * SINGLE SOURCE OF TRUTH for every user-facing display of legal entity data
 * (footer, contact page, legal documents, invoices, emails).
 *
 * HARD RULE: only officially verified values may live in this file. Do NOT add
 * CVR, VAT/MOMS numbers, phone numbers or country-specific registration
 * numbers until they are officially verified and documented in
 * `docs/legal/COMPANY_VERIFICATION.md`. Anything unverified belongs in
 * `PENDING_VERIFICATION` below and must never be rendered.
 */

export interface CompanyAddress {
  line1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  countryCode: "GB";
}

export interface CompanyConfig {
  legalName: string;
  tradingName: string;
  companyNumber: string;
  registry: string;
  registryUrl: string;
  address: CompanyAddress;
  supportEmail: string;
  /** Verified single support address used for every market until localised
   *  mailboxes are verified. */
  supportEmailByMarket: Record<string, string>;
}

const SUPPORT_EMAIL = "support@mycleaner.dk";

export const COMPANY: CompanyConfig = {
  legalName: "MYCLEANER INTERNATIONAL LTD",
  tradingName: "MyCleaner",
  companyNumber: "16401689",
  registry: "Companies House",
  registryUrl: "https://find-and-update.company-information.service.gov.uk/company/16401689",
  address: {
    line1: "1 Coldbath Square",
    city: "London",
    region: "England",
    postalCode: "EC1R 5HL",
    country: "United Kingdom",
    countryCode: "GB",
  },
  supportEmail: SUPPORT_EMAIL,
  supportEmailByMarket: {
    DK: SUPPORT_EMAIL,
    SE: SUPPORT_EMAIL,
    GB: SUPPORT_EMAIL,
    DE: SUPPORT_EMAIL,
    ES: SUPPORT_EMAIL,
  },
};

/**
 * Data that is NOT yet officially verified and therefore MUST NOT be rendered
 * anywhere in the product. Keeping the list here makes the gap auditable.
 */
export const PENDING_VERIFICATION = [
  "VAT / GB VAT registration number",
  "Danish CVR number (if a DK branch is registered)",
  "Swedish organisationsnummer",
  "German USt-IdNr / Handelsregister number",
  "Spanish NIF / CIF",
  "Public support telephone number(s)",
  "Country-specific support mailboxes (support@mycleaner.se / .de / .es / .co.uk)",
] as const;

/** Formatted one-line postal address. */
export function formatCompanyAddress(company: CompanyConfig = COMPANY): string {
  const a = company.address;
  return `${a.line1}, ${a.city}, ${a.region}, ${a.postalCode}, ${a.country}`;
}

/** Support email for a market; always falls back to the verified address. */
export function supportEmailFor(marketCode?: string | null): string {
  if (!marketCode) return COMPANY.supportEmail;
  return COMPANY.supportEmailByMarket[marketCode.toUpperCase()] ?? COMPANY.supportEmail;
}
