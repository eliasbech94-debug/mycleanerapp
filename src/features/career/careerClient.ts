// Career Identity client helpers.
//
// After Phase 2's migrations were approved and Supabase types were regenerated,
// the Career Identity tables (`cleaner_career_profiles`, `cleaner_work_history`,
// `cleaner_certifications`, `career_evidence_documents`, `career_audit_log`)
// are now first-class members of `Database["public"]["Tables"]`. The previous
// `careerDb = supabase as any` scoped cast is therefore no longer required and
// has been removed — pages import `supabase` directly and receive full
// generated typing.
//
// This module now only exports:
//   - Row-shape aliases derived from the generated Database types
//   - Client-side file validation (MIME allow-list + 10 MB cap)

import type { Database } from "@/integrations/supabase/types";

export type CareerEvidenceDocumentRow =
  Database["public"]["Tables"]["career_evidence_documents"]["Row"];
export type CleanerCareerProfileRow =
  Database["public"]["Tables"]["cleaner_career_profiles"]["Row"];
export type CleanerWorkHistoryRow =
  Database["public"]["Tables"]["cleaner_work_history"]["Row"];
export type CleanerCertificationRow =
  Database["public"]["Tables"]["cleaner_certifications"]["Row"];
export type CareerAuditLogRow =
  Database["public"]["Tables"]["career_audit_log"]["Row"];

export type CareerEvidenceType = "work_history" | "certification";

export type CareerEvidenceStatus =
  | "pending"
  | "under_review"
  | "more_information_required"
  | "verified"
  | "rejected"
  | "expired";

export type CareerVerificationStatus =
  | "self_reported"
  | "pending"
  | "under_review"
  | "more_information_required"
  | "verified"
  | "rejected"
  | "expired";

/**
 * Narrowed shape of a career evidence document as consumed by the provider UI.
 * Kept intentionally smaller than the DB Row: sensitive columns like
 * `reviewed_by`, `storage_path`, and `updated_at` are never rendered
 * client-side and are excluded here to prevent accidental exposure.
 */
export interface CareerEvidenceDocument {
  id: string;
  user_id: string;
  work_history_id: string | null;
  certification_id: string | null;
  storage_path: string;
  original_filename: string | null;
  mime_type: string;
  size_bytes: number;
  evidence_type: CareerEvidenceType;
  status: CareerEvidenceStatus;
  uploaded_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

export const ALLOWED_EVIDENCE_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export function isAllowedEvidenceFile(
  file: File,
): { ok: true } | { ok: false; reason: string } {
  if (!ALLOWED_EVIDENCE_MIME.includes(file.type as (typeof ALLOWED_EVIDENCE_MIME)[number])) {
    return { ok: false, reason: "Kun PDF, JPG, PNG eller WebP er tilladt." };
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    return { ok: false, reason: "Filen må højst være 10 MB." };
  }
  if (file.size <= 0) {
    return { ok: false, reason: "Tom fil." };
  }
  return { ok: true };
}
