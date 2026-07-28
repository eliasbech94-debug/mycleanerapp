// Scoped, minimal client types for Phase 2 Career Identity tables until the
// Supabase types file regenerates and includes them natively. Do NOT widen —
// this file exists so we can drop `supabase as any` casts from the pages.
import { supabase } from "@/integrations/supabase/client";

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

// Scoped cast: only for tables not yet in the generated types file. Do not
// re-export as a general `db = supabase as any` — always name the table.
export const careerDb = supabase as unknown as {
  from: (table:
    | "career_evidence_documents"
    | "cleaner_career_profiles"
    | "cleaner_work_history"
    | "cleaner_certifications"
    | "career_audit_log"
  ) => any;
  rpc: (fn: "ensure_cleaner_career_profile", args?: Record<string, unknown>) => any;
  functions: typeof supabase.functions;
};

export const ALLOWED_EVIDENCE_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export function isAllowedEvidenceFile(file: File): { ok: true } | { ok: false; reason: string } {
  if (!ALLOWED_EVIDENCE_MIME.includes(file.type as any)) {
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
