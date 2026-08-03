/**
 * Provider decision notices + appeals — client data layer.
 *
 * Providers never read the internal admin ledger. They read
 * `provider_decision_notices`, which is a sanitised, provider-appropriate
 * record of a decision, and may appeal it. All state changes go through
 * SECURITY DEFINER RPCs so a client can never set a final outcome itself.
 */
import { supabase } from "@/integrations/supabase/client";

export type DecisionType = "suspend" | "reject" | "archive" | "freeze_payout" | "restrict" | "other";
export type WithheldCode =
  | "fraud_prevention"
  | "other_user_safety"
  | "legal_requirement"
  | "ongoing_investigation";

export type AppealStatus =
  | "submitted"
  | "under_review"
  | "information_requested"
  | "upheld"
  | "changed"
  | "withdrawn";

export interface DecisionNotice {
  id: string;
  provider_user_id: string;
  decision_type: DecisionType;
  decision_status: string | null;
  effective_at: string;
  provider_reason: string;
  rules_applied: string[];
  reason_withheld: boolean;
  reason_withheld_code: WithheldCode | null;
  human_reviewed: boolean;
  ai_assisted: boolean;
  appealable: boolean;
  created_at: string;
}

export interface Appeal {
  id: string;
  notice_id: string;
  provider_user_id: string;
  status: AppealStatus;
  provider_statement: string;
  provider_followup: string | null;
  information_request: string | null;
  reviewer_reason: string | null;
  decided_at: string | null;
  submitted_at: string;
  created_at: string;
}

export interface AppealEvent {
  id: number;
  appeal_id: string;
  actor_role: "provider" | "admin" | "support" | "system";
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
}

export interface AppealAttachment {
  id: string;
  appeal_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export const DECISION_LABEL: Record<DecisionType, string> = {
  suspend: "Profil suspenderet",
  reject: "Ansøgning afvist",
  archive: "Profil arkiveret",
  freeze_payout: "Udbetalinger sat på hold",
  restrict: "Begrænsning på profilen",
  other: "Afgørelse om din konto",
};

export const WITHHELD_LABEL: Record<WithheldCode, string> = {
  fraud_prevention: "Hensyn til forebyggelse af svig",
  other_user_safety: "Hensyn til andre brugeres sikkerhed",
  legal_requirement: "Lovkrav",
  ongoing_investigation: "Igangværende undersøgelse",
};

export const APPEAL_STATUS_LABEL: Record<AppealStatus, string> = {
  submitted: "Modtaget",
  under_review: "Under behandling",
  information_requested: "Afventer dine oplysninger",
  upheld: "Afgjort — afgørelsen fastholdt",
  changed: "Afgjort — afgørelsen ændret",
  withdrawn: "Trukket tilbage",
};

export const OPEN_APPEAL_STATUSES: AppealStatus[] = [
  "submitted",
  "under_review",
  "information_requested",
];

export const isAppealOpen = (status: AppealStatus) => OPEN_APPEAL_STATUSES.includes(status);

/** Deadline the platform commits to in MC-PROVIDER-AGREEMENT-001 §14. */
export const APPEAL_RESPONSE_DAYS = 14;

export async function listMyDecisions(userId: string) {
  const { data, error } = await supabase
    .from("provider_decision_notices")
    .select("*")
    .eq("provider_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DecisionNotice[];
}

export async function getDecision(noticeId: string) {
  const { data, error } = await supabase
    .from("provider_decision_notices")
    .select("*")
    .eq("id", noticeId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as DecisionNotice | null;
}

export async function listAppealsForNotices(noticeIds: string[]) {
  if (noticeIds.length === 0) return [] as Appeal[];
  const { data, error } = await supabase
    .from("provider_appeals")
    .select("*")
    .in("notice_id", noticeIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Appeal[];
}

export async function listAppealEvents(appealId: string) {
  const { data, error } = await supabase
    .from("provider_appeal_events")
    .select("*")
    .eq("appeal_id", appealId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AppealEvent[];
}

export async function listAppealAttachments(appealId: string) {
  const { data, error } = await supabase
    .from("provider_appeal_attachments")
    .select("id,appeal_id,file_name,content_type,size_bytes,created_at")
    .eq("appeal_id", appealId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as AppealAttachment[];
}

export async function submitAppeal(noticeId: string, statement: string) {
  const { data, error } = await supabase.rpc("submit_provider_appeal_v1" as never, {
    _notice_id: noticeId,
    _statement: statement,
  } as never);
  if (error) throw error;
  return data as unknown as string;
}

export async function respondToAppeal(
  appealId: string,
  action: "add_information" | "withdraw",
  message?: string,
) {
  const { data, error } = await supabase.rpc("provider_appeal_respond_v1" as never, {
    _appeal_id: appealId,
    _action: action,
    _message: message ?? null,
  } as never);
  if (error) throw error;
  return data as unknown as AppealStatus;
}

export async function staffTransitionAppeal(
  appealId: string,
  toStatus: Exclude<AppealStatus, "submitted" | "withdrawn">,
  reason?: string,
) {
  const { data, error } = await supabase.rpc("admin_appeal_transition_v1" as never, {
    _appeal_id: appealId,
    _to_status: toStatus,
    _reason: reason ?? null,
  } as never);
  if (error) throw error;
  return data as unknown as AppealStatus;
}

export async function uploadAppealEvidence(appealId: string, file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i += 8192) {
    binary += String.fromCharCode(...buf.subarray(i, i + 8192));
  }
  const { data, error } = await supabase.functions.invoke("appeal-evidence-upload", {
    body: {
      appeal_id: appealId,
      file_name: file.name,
      content_type: file.type,
      size_bytes: buf.byteLength,
      data_base64: btoa(binary),
    },
  });
  if (error) throw error;
  return data;
}

export async function getAppealEvidenceUrl(attachmentId: string) {
  const { data, error } = await supabase.functions.invoke("appeal-evidence-url", {
    body: { attachment_id: attachmentId },
  });
  if (error) throw error;
  return (data as { url?: string })?.url ?? null;
}

/** Human-readable errors from the RPC guard rails. */
export const APPEAL_ERROR_LABEL: Record<string, string> = {
  statement_too_short: "Skriv mindst 20 tegn, så vi kan forstå din indsigelse.",
  statement_too_long: "Din forklaring er for lang. Maks. 10.000 tegn.",
  decision_not_appealable: "Denne afgørelse kan ikke påklages.",
  appeal_closed: "Sagen er afsluttet og kan ikke ændres.",
  not_authorized: "Du har ikke adgang til denne sag.",
  notice_not_found: "Afgørelsen blev ikke fundet.",
  appeal_not_found: "Klagesagen blev ikke fundet.",
  message_required: "Skriv en besked, før du sender.",
  reason_required: "Angiv en begrundelse på mindst 10 tegn.",
  admin_required_for_final_decision: "Kun en administrator kan træffe den endelige afgørelse.",
};

export function appealErrorMessage(err: unknown): string {
  const raw = (err as { message?: string })?.message ?? "";
  for (const key of Object.keys(APPEAL_ERROR_LABEL)) {
    if (raw.includes(key)) return APPEAL_ERROR_LABEL[key];
  }
  return "Noget gik galt. Prøv igen, eller kontakt support.";
}
