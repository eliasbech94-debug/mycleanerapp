// Helpers for uploading + fetching incident evidence via server-signed URLs.
import { supabase } from "@/integrations/supabase/client";

export const EVIDENCE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UploadedEvidence {
  id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
}

export async function uploadIncidentEvidence(
  incident_id: string,
  file: File,
  opts?: { caption?: string; onProgress?: (pct: number) => void },
): Promise<UploadedEvidence> {
  if (!EVIDENCE_MIME.has(file.type)) throw new Error("mime_not_allowed");
  if (file.size <= 0 || file.size > EVIDENCE_MAX_BYTES) throw new Error("file_too_large");

  const init = await invoke<{ storage_path: string; upload_url: string; token: string }>(
    "incident-evidence-upload",
    {
      step: "init",
      incident_id,
      mime_type: file.type,
      size_bytes: file.size,
      original_filename: file.name,
    },
  );

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", init.upload_url, true);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts?.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
      ? resolve()
      : reject(new Error(`upload_failed_${xhr.status}`));
    xhr.onerror = () => reject(new Error("upload_network_error"));
    xhr.send(file);
  });

  const hash = await sha256Hex(await file.arrayBuffer());

  const { id } = await invoke<{ id: string }>("incident-evidence-upload", {
    step: "finalize",
    incident_id,
    storage_path: init.storage_path,
    mime_type: file.type,
    size_bytes: file.size,
    original_filename: file.name,
    file_hash: hash,
    caption: opts?.caption,
  });

  return { id, storage_path: init.storage_path, mime_type: file.type, size_bytes: file.size };
}

export async function getIncidentEvidenceUrl(evidence_id: string): Promise<string> {
  const { url } = await invoke<{ url: string }>("incident-evidence-url", { evidence_id });
  return url;
}
