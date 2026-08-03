/**
 * useHumanHandover — "Talk to a person" escalation.
 *
 * Creates or transfers the conversation to a MyCleaner Support case while
 * keeping the full history on the same conversation, and returns the takeover
 * state so the UI can stop presenting the AI as the active handler.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface HandoverResult {
  handed_over: boolean;
  already_handed_over: boolean;
  status: string;
  human_takeover_at: string | null;
  /** null = unknown. Never render a promised response time from a null. */
  expected_response_minutes: number | null;
  agent_first_name: string | null;
}

export function useHumanHandover(conversationId: string | null) {
  const { t } = useTranslation("ai");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<HandoverResult | null>(null);

  const requestHuman = useCallback(
    async (opts?: { reason?: string; risk?: boolean }) => {
      if (!conversationId || pending) return null;
      setPending(true);
      try {
        const { data, error } = await supabase.functions.invoke("conversation-request-human", {
          body: { conversation_id: conversationId, reason: opts?.reason, risk: !!opts?.risk },
        });
        if (error) throw error;
        const res = data as HandoverResult;
        setResult(res);
        return res;
      } catch {
        toast.error(t("disclosure.requestFailed"));
        return null;
      } finally {
        setPending(false);
      }
    },
    [conversationId, pending, t],
  );

  return { requestHuman, pending, result, handedOver: !!result?.human_takeover_at };
}
