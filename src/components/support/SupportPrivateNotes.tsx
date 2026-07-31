import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Pin, PinOff, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import {
  SUPPORT_NOTE_MAX,
  useCreateSupportNote,
  useSupportNotes,
  useUpdateSupportNote,
  type NoteSubjectType,
  type SupportNote,
} from "@/hooks/useSupportNotes";

interface Props {
  subjectType: NoteSubjectType;
  subjectUserId: string;
}

/**
 * Private, staff-only notes about a customer or provider.
 * Every read and write goes through the staff-gated support-note-* edge
 * functions — the table has no Data API grants for clients.
 * Phase 1: create, edit own note, pin. No deletion.
 */
export function SupportPrivateNotes({ subjectType, subjectUserId }: Props) {
  const { t } = useTranslation("admin");
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const { data: notes, isLoading, isError, error } = useSupportNotes(subjectType, subjectUserId);
  const create = useCreateSupportNote(subjectType, subjectUserId);
  const update = useUpdateSupportNote(subjectType, subjectUserId);

  const startEdit = (n: SupportNote) => {
    setEditingId(n.id);
    setEditDraft(n.body);
  };

  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{t("support.notes.title")}</h3>
        <Badge variant="secondary" className="gap-1 font-normal">
          <Lock className="h-3 w-3" aria-hidden />
          {t("support.notes.staffOnly")}
        </Badge>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const body = draft.trim();
          if (!body) return;
          create.mutate(body, { onSuccess: () => setDraft("") });
        }}
        className="space-y-2"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, SUPPORT_NOTE_MAX))}
          placeholder={t("support.notes.placeholder")}
          aria-label={t("support.notes.placeholder")}
          rows={3}
          maxLength={SUPPORT_NOTE_MAX}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!draft.trim() || create.isPending}>
            {t("support.notes.add")}
          </Button>
        </div>
      </form>

      {isLoading && <Skeleton className="h-16 w-full" />}
      {isError && (
        <p className="text-sm text-destructive">
          {t("support.notes.error", { message: (error as Error).message })}
        </p>
      )}
      {!isLoading && (notes?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">{t("support.notes.empty")}</p>
      )}

      <ul className="space-y-2" role="list">
        {(notes ?? []).map((n) => {
          const mine = n.author_user_id === user?.id;
          return (
            <li key={n.id} className="rounded-md border border-border bg-background p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {editingId === n.id ? (
                    <Textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value.slice(0, SUPPORT_NOTE_MAX))}
                      rows={3}
                      aria-label={t("support.notes.edit")}
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap break-words">{n.body}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                {n.pinned && (
                  <Badge variant="outline" className="gap-1 font-normal">
                    <Pin className="h-3 w-3" aria-hidden />
                    {t("support.notes.pinned")}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {editingId === n.id ? (
                  <>
                    <Button
                      size="sm"
                      disabled={!editDraft.trim() || update.isPending}
                      onClick={() =>
                        update.mutate(
                          { note_id: n.id, body: editDraft.trim() },
                          { onSuccess: () => setEditingId(null) },
                        )
                      }
                    >
                      {t("support.notes.save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      {t("support.notes.cancel")}
                    </Button>
                  </>
                ) : (
                  mine && (
                    <Button size="sm" variant="ghost" onClick={() => startEdit(n)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" aria-hidden />
                      {t("support.notes.edit")}
                    </Button>
                  )
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ note_id: n.id, pinned: !n.pinned })}
                >
                  {n.pinned ? (
                    <>
                      <PinOff className="h-3.5 w-3.5 mr-1" aria-hidden />
                      {t("support.notes.unpin")}
                    </>
                  ) : (
                    <>
                      <Pin className="h-3.5 w-3.5 mr-1" aria-hidden />
                      {t("support.notes.pin")}
                    </>
                  )}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default SupportPrivateNotes;
