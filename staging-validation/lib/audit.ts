import { psqlJson } from "./supabase-admin.js";
import { saveJson } from "./reporter.js";

export interface AuditRow {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
}

export function readAuditSince(iso: string, label: string): AuditRow[] {
  const rows = psqlJson<AuditRow>(
    `select id, created_at, actor_user_id, actor_role, action, target_type, target_id
       from public.admin_audit_log
      where created_at >= '${iso}'
      order by created_at asc
      limit 500`,
  );
  saveJson(`audit/${label}.json`, rows);
  return rows;
}
