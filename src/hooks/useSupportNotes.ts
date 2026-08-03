import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NoteSubjectType = "customer" | "provider";

export interface SupportNote {
  id: string;
  subject_type: NoteSubjectType;
  subject_user_id: string;
  body: string;
  author_user_id: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export const SUPPORT_NOTE_MAX = 5000;

const key = (t: NoteSubjectType, id: string) => ["support", "notes", t, id];

/** Private staff notes for one subject. All access is staff-gated server-side. */
export function useSupportNotes(subjectType: NoteSubjectType, subjectUserId: string, enabled = true) {
  return useQuery({
    queryKey: key(subjectType, subjectUserId),
    enabled: enabled && Boolean(subjectUserId),
    queryFn: async (): Promise<SupportNote[]> => {
      const params = new URLSearchParams({
        subject_type: subjectType,
        subject_user_id: subjectUserId,
      });
      const { data, error } = await supabase.functions.invoke(
        `support-note-list?${params.toString()}`,
        { method: "GET" },
      );
      if (error) throw error;
      return (data as { notes?: SupportNote[] })?.notes ?? [];
    },
  });
}

export function useCreateSupportNote(subjectType: NoteSubjectType, subjectUserId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { data, error } = await supabase.functions.invoke("support-note-create", {
        body: { subject_type: subjectType, subject_user_id: subjectUserId, body },
      });
      if (error) throw error;
      return (data as { note: SupportNote }).note;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(subjectType, subjectUserId) }),
  });
}

export function useUpdateSupportNote(subjectType: NoteSubjectType, subjectUserId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { note_id: string; body?: string; pinned?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("support-note-update", {
        body: patch,
      });
      if (error) throw error;
      return (data as { note: SupportNote }).note;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(subjectType, subjectUserId) }),
  });
}
