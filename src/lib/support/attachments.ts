import { supabase } from "@/integrations/supabase/client";

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
export const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (server enforces authoritatively)

export interface UploadInit {
  path: string;
  upload_url: string;
  token: string;
  size_bytes: number;
  mime_type: string;
}

export interface FinalizedAttachment {
  id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
}

export function validateFile(file: File): { ok: true } | { ok: false; error: string } {
  if (!ALLOWED_MIME.has(file.type)) return { ok: false, error: "Filtypen understøttes ikke" };
  if (file.size > MAX_BYTES) return { ok: false, error: "Filen er for stor (max 25 MB)" };
  if (file.size <= 0) return { ok: false, error: "Tom fil" };
  return { ok: true };
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/**
 * Upload a file for a conversation attachment.
 * Steps: init → PUT to signed URL → return init metadata. Finalize happens
 * only after the accompanying message insert succeeds.
 */
export async function uploadAttachment(
  conversation_id: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ init: UploadInit; original_filename: string }> {
  const v = validateFile(file);
  if (v.ok !== true) throw new Error(v.error);
  const init = await invoke<UploadInit>("conversation-attachment-upload", {
    step: "init",
    conversation_id,
    filename: file.name,
    mime_type: file.type,
    size_bytes: file.size,
  });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", init.upload_url, true);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload_failed_${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("upload_network_error"));
    xhr.send(file);
  });

  onProgress?.(100);
  return { init, original_filename: file.name };
}

export async function finalizeAttachment(input: {
  conversation_id: string;
  message_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
}): Promise<{ id: string }> {
  return invoke<{ id: string }>("conversation-attachment-upload", { step: "finalize", ...input });
}

/** Fetch a short-lived signed URL for viewing an attachment (never persisted). */
export async function getAttachmentUrl(attachment_id: string): Promise<string> {
  const { url } = await invoke<{ url: string }>("conversation-attachment-url", { attachment_id });
  return url;
}
