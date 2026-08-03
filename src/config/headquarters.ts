/**
 * MyCleaner Headquarters — SINGLE SOURCE OF TRUTH for the public HQ location.
 *
 * The postal address is derived from `src/config/company.ts` (verified legal
 * entity data). The coordinates below were geocoded and verified against the
 * Mapbox Geocoding v6 API:
 *
 *   query : "1 Coldbath Square, London EC1R 5HL"
 *   match : 1 Coldbath Square, Islington, London, EC1R 5HL, United Kingdom
 *   type  : address, accuracy "rooftop"
 *   result: lng -0.11037, lat 51.52400
 *
 * This is the PUBLIC company address, so the exact point may be rendered.
 * It has nothing to do with provider locations, which stay anonymised.
 */
import { COMPANY } from "@/config/company";

export interface HeadquartersConfig {
  name: string;
  addressLines: string[];
  label: string;
  tagline: string;
  lat: number;
  lng: number;
  /** Provenance of the coordinates, for auditability. */
  geocode: { source: string; accuracy: string; verifiedAt: string };
}

export const HEADQUARTERS: HeadquartersConfig = {
  name: COMPANY.legalName,
  addressLines: [
    COMPANY.address.line1,
    COMPANY.address.city,
    COMPANY.address.postalCode,
    COMPANY.address.country,
  ],
  label: "Headquarters",
  tagline: "The heart of trust in home cleaning.",
  lat: 51.524,
  lng: -0.11037,
  geocode: {
    source: "mapbox-geocoding-v6",
    accuracy: "rooftop",
    verifiedAt: "2026-08-02",
  },
};

export function formatHeadquartersAddress(hq: HeadquartersConfig = HEADQUARTERS): string {
  return hq.addressLines.join(", ");
}
