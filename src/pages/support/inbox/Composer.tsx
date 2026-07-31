import { useEffect, useRef, useState, useCallback, KeyboardEvent } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Loader2, Lock, Paperclip, RotateCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getDraft, setDraft, clearDraft, subscribe, hasAnyDraft, type ComposerMode } from "@/lib/support/drafts";
import {
  ALLOWED_MIME,
  MAX_BYTES,
  finalizeAttachment,
  uploadAttachment,
  validateFile,
  type UploadInit,
} from "@/lib/support/attachments";

interface Props {
  conversationId: string;
  isStaff: boolean;
  onOptimistic: (msg: OptimisticMessage) => void;
  onConfirmed: (tempId: string, real: { id: string; created_at: string }) => void;
  onFailed: (tempId: string) => void;
  disabled?: boolean;
}

export interface OptimisticMessage {
  tempId: string;
  body: string;
  is_internal_note: boolean;
  attachment?: {
    original_filename: string;
    mime_type: string;
    size_bytes: number;
  };
  created_at: string;
}

interface PendingUpload {
  file: File;
  progress: number;
  status: "uploading" | "ready" | "error";
  error?: string;
  init?: UploadInit;
}

export function Composer({
  conversationId, isStaff, onOptimistic, onConfirmed, onFailed, disabled,
}: Props) {
  const { t } = useTranslation("admin");
  const [mode, setMode] = useState<ComposerMode>("reply");
  const [value, setValue] = useState<string>(() => getDraft(conversationId, mode));
  const [upload, setUpload] = useState<PendingUpload | null>(null);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const activeConv = useRef(conversationId);
  const activeMode = useRef<ComposerMode>(mode);

  // ---- Draft isolation: reset when conversation or mode changes ----
  useEffect(() => {
    activeConv.current = conversationId;
    activeMode.current = mode;
    setValue(getDraft(conversationId, mode));
    setUpload(null);
    return subscribe(() => {
      if (activeConv.current === conversationId && activeMode.current === mode) {
        setValue(getDraft(conversationId, mode));
      }
    });
  }, [conversationId, mode]);

  const onChange = (v: string) => {
    setValue(v);
    setDraft(conversationId, mode, v);
  };

  const canSend = !sending && !disabled && (!!value.trim() || upload?.status === "ready");

  // ---- Attachment handling ----
  const pickFile = () => fileRef.current?.click();
  const onFile = async (file: File) => {
    const v = validateFile(file);
    if (v.ok !== true) {
      toast.error(v.error);
      return;
    }
    setUpload({ file, progress: 0, status: "uploading" });
    try {
      const { init } = await uploadAttachment(conversationId, file, (pct) => {
        setUpload((prev) => (prev && prev.file === file ? { ...prev, progress: pct } : prev));
      });
      setUpload((prev) =>
        prev && prev.file === file ? { ...prev, status: "ready", progress: 100, init } : prev,
      );
    } catch (e) {
      setUpload((prev) =>
        prev && prev.file === file
          ? { ...prev, status: "error", error: (e as Error).message }
          : prev,
      );
    }
  };

  const removeUpload = () => setUpload(null);

  // ---- Send ----
  const doSend = useCallback(async () => {
    if (!canSend) return;
    const text = value.trim();
    const attachment = upload?.status === "ready" ? upload : null;
    const isNote = mode === "note";
    if (!text && !attachment) return;

    const tempId = `tmp_${crypto.randomUUID()}`;
    const optimistic: OptimisticMessage = {
      tempId,
      body: text,
      is_internal_note: isNote,
      attachment: attachment
        ? {
            original_filename: attachment.file.name,
            mime_type: attachment.file.type,
            size_bytes: attachment.file.size,
          }
        : undefined,
      created_at: new Date().toISOString(),
    };
    onOptimistic(optimistic);

    // Clear UI immediately for responsiveness. Persist nothing to storage.
    const snapshotValue = value;
    const snapshotUpload = upload;
    setValue("");
    clearDraft(conversationId, mode);
    setUpload(null);
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("conversation-send-message", {
        body: {
          conversation_id: conversationId,
          body: text || undefined,
          is_internal_note: isNote,
          has_attachment: !!attachment,
          message_type: attachment ? "attachment" : "text",
        },
      });
      if (error) throw error;
      const errBody = (data as { error?: string })?.error;
      if (errBody) throw new Error(errBody);
      const real = data as { id: string; created_at: string };

      if (attachment?.init) {
        try {
          await finalizeAttachment({
            conversation_id: conversationId,
            message_id: real.id,
            storage_path: attachment.init.path,
            original_filename: attachment.file.name,
            mime_type: attachment.file.type,
            size_bytes: attachment.file.size,
          });
        } catch (e) {
          toast.error(t("support.composer.attachmentSaveError", { message: (e as Error).message }));
        }
      }

      onConfirmed(tempId, real);
    } catch (e) {
      onFailed(tempId);
      // Restore composer for retry
      setValue(snapshotValue);
      setDraft(conversationId, mode, snapshotValue);
      if (snapshotUpload) setUpload(snapshotUpload);
      toast.error(t("support.composer.sendError", { message: (e as Error).message }));
    } finally {
      setSending(false);
    }
  }, [canSend, value, upload, mode, conversationId, onOptimistic, onConfirmed, onFailed]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      doSend();
    }
  };

  return (
    <div
      className={cn(
        "border-t bg-background",
        mode === "note" && "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900",
      )}
    >
      {/* Mode switch */}
      <div className="flex items-center gap-1 px-3 pt-2">
        <ModeTab active={mode === "reply"} onClick={() => setMode("reply")} label={t("support.composer.replyTab")} />
        {isStaff && (
          <ModeTab
            active={mode === "note"}
            onClick={() => setMode("note")}
            label={t("support.composer.noteTab")}
            tone="warning"
          />
        )}
      </div>

      {mode === "note" && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-100/60 dark:bg-amber-900/40 p-2 text-xs text-amber-900 dark:text-amber-100">
          <Lock className="h-3.5 w-3.5 mt-0.5" aria-hidden />
          <span>{t("support.composer.noteVisibilityHint")}</span>
        </div>
      )}

      <div className="p-3 space-y-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          placeholder={mode === "note" ? t("support.composer.notePlaceholder") : t("support.composer.replyPlaceholder")}
          rows={3}
          disabled={disabled || sending}
          aria-label={mode === "note" ? t("support.composer.noteTab") : t("support.composer.replyTab")}
          className="resize-none text-sm"
        />

        {upload && (
          <div className="flex items-center gap-2 rounded-md border p-2 text-xs">
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{upload.file.name}</div>
              <div className="text-muted-foreground">
                {upload.status === "uploading" && t("support.composer.uploading", { progress: upload.progress })}
                {upload.status === "ready" && t("support.composer.uploadReady")}
                {upload.status === "error" && (
                  <span className="text-destructive">
                    {t("support.composer.uploadError", { message: upload.error ?? t("support.composer.uploadErrorUnknown") })}
                  </span>
                )}
              </div>
            </div>
            {upload.status === "error" && (
              <Button
                size="sm" variant="ghost" onClick={() => onFile(upload.file)}
                aria-label={t("support.composer.retryUploadAria")}
              >
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="sm" variant="ghost" onClick={removeUpload}
              aria-label={t("support.composer.removeAttachmentAria")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              accept={[...ALLOWED_MIME].join(",")}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onFile(f);
              }}
            />
            <Button
              size="sm" variant="ghost" onClick={pickFile} disabled={disabled || sending || !!upload}
              aria-label={t("support.composer.attachAria")}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              {t("support.composer.hint", { maxMb: (MAX_BYTES / 1024 / 1024).toFixed(0) })}
            </span>
          </div>
          <Button
            size="sm"
            onClick={doSend}
            disabled={!canSend}
            aria-label={mode === "note" ? t("support.composer.sendNoteAria") : t("support.composer.sendReplyAria")}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="ml-2">{mode === "note" ? t("support.composer.sendNote") : t("support.composer.send")}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModeTab({
  active, onClick, label, tone,
}: {
  active: boolean; onClick: () => void; label: string; tone?: "warning";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "text-xs px-3 py-1.5 rounded-t-md border-b-2 transition-colors",
        active
          ? tone === "warning"
            ? "border-amber-500 text-amber-800 dark:text-amber-100 font-medium"
            : "border-primary text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/** Utility used by parents when navigating away with a non-empty draft. */
export function confirmDiscardIfDirty(conversationId: string): boolean {
  if (!hasAnyDraft(conversationId)) return true;
  // eslint-disable-next-line no-alert
  return window.confirm(i18n.t("support.composer.discardConfirm", { ns: "admin" }));
}
