import { supabase } from "@/integrations/supabase/client";

export type CustomerIntentEvent =
  | "provider_view"
  | "service_search"
  | "date_search"
  | "checkout_started"
  | "checkout_abandoned"
  | "suggestion_opened"
  | "suggestion_dismissed"
  | "suggestion_converted";

type TrackIntentInput = {
  eventType: CustomerIntentEvent;
  providerId?: string | null;
  serviceKey?: string | null;
  requestedDate?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Records a customer signal only when the customer has explicitly enabled
 * personalization. The database RPC performs the authoritative consent check.
 * Tracking must never block navigation or booking.
 */
export async function trackCustomerIntent(input: TrackIntentInput): Promise<void> {
  try {
    await (supabase as any).rpc("track_customer_behavior", {
      p_event_type: input.eventType,
      p_provider_id: input.providerId ?? null,
      p_service_key: input.serviceKey ?? null,
      p_requested_date: input.requestedDate ?? null,
      p_session_id: input.sessionId ?? null,
      p_metadata: input.metadata ?? {},
    });
  } catch {
    // Personalization is optional and must fail silently.
  }
}

export type CustomerAiSuggestion = {
  suggestion_key: string;
  suggestion_type: "provider_interest" | "service_interest" | "date_interest";
  title: string;
  body: string;
  action_label: string;
  action_href: string;
  score: number;
  context: Record<string, unknown>;
};

export async function getCustomerAiSuggestions(): Promise<CustomerAiSuggestion[]> {
  const { data, error } = await (supabase as any).rpc("get_customer_ai_suggestions");
  if (error) throw error;
  return (data ?? []) as CustomerAiSuggestion[];
}
