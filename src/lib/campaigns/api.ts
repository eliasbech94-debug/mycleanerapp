// Client-side Campaign Engine data access. All reads go through RLS; all
// writes go through the campaign-* edge functions.
import { supabase } from "@/integrations/supabase/client";

export interface CampaignSummary {
  id: string;
  slug: string;
  name: string;
  kind: string;
  lifecycle: string;
  starts_at: string | null;
  ends_at: string | null;
  headline: string | null;
  subheadline: string | null;
  enable_waiting_list: boolean;
  version: number;
}

export interface CampaignBlock {
  id: string;
  block_type: string;
  position: number;
  content: Record<string, unknown>;
  country_scope: string[] | null;
  locale_scope: string[] | null;
}

export interface CampaignFullPage {
  campaign: CampaignSummary;
  blocks: CampaignBlock[];
  benefits: Array<{ id: string; title: string; description: string | null; icon: string | null; position: number }>;
  faq: Array<{ id: string; question: string; answer: string; position: number }>;
  testimonials: Array<{ id: string; name: string; quote: string; role: string | null; avatar_url: string | null; position: number }>;
  countrySettings: Array<{ country_code: string; enabled: boolean; locale: string | null; currency: string | null }>;
}

export async function loadPublicCampaign(slug: string): Promise<CampaignFullPage | null> {
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, slug, name, kind, lifecycle, starts_at, ends_at, headline, subheadline, enable_waiting_list, version, deleted_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !campaign || (campaign as any).deleted_at) return null;

  const [blocks, benefits, faq, testimonials, countrySettings] = await Promise.all([
    supabase.from("campaign_page_blocks").select("*").eq("campaign_id", campaign.id).order("position"),
    supabase.from("campaign_benefits").select("*").eq("campaign_id", campaign.id).order("position"),
    supabase.from("campaign_faq").select("*").eq("campaign_id", campaign.id).order("position"),
    supabase.from("campaign_testimonials").select("*").eq("campaign_id", campaign.id).order("position"),
    supabase.from("campaign_country_settings").select("country_code, enabled, locale, currency").eq("campaign_id", campaign.id),
  ]);

  return {
    campaign: campaign as CampaignSummary,
    blocks: (blocks.data ?? []) as CampaignBlock[],
    benefits: (benefits.data ?? []) as CampaignFullPage["benefits"],
    faq: (faq.data ?? []) as CampaignFullPage["faq"],
    testimonials: (testimonials.data ?? []) as CampaignFullPage["testimonials"],
    countrySettings: (countrySettings.data ?? []) as CampaignFullPage["countrySettings"],
  };
}

export async function submitCampaignApplication(input: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("campaign-apply", { body: input });
  if (error) throw error;
  return data as { ok: boolean; message: string };
}

export async function trackCampaignEvent(input: {
  campaign_slug: string;
  event_type: string;
  country_code?: string | null;
  session_id?: string | null;
  payload?: Record<string, unknown>;
}) {
  try {
    await supabase.functions.invoke("campaign-track-event", { body: input });
  } catch {
    // Analytics failures never surface to users.
  }
}

export async function verifyCampaignEmail(application_id: string, token: string) {
  const { data, error } = await supabase.functions.invoke("campaign-verify-email", {
    body: { application_id, token },
  });
  if (error) throw error;
  return data as { status: string; application?: { id: string; status?: string } };
}

// Admin
export async function listAdminCampaigns() {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, slug, name, kind, lifecycle, starts_at, ends_at, version, deleted_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listAdminApplications(campaignId: string) {
  const { data, error } = await supabase
    .from("campaign_applications")
    .select("id, full_name, email, country_code, status, assigned_number, waiting_list_position, email_verified_at, created_at, deleted_at")
    .eq("campaign_id", campaignId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

export async function adminCampaignAction(input: {
  action: "approve" | "reject" | "waitlist" | "note";
  application_id: string;
  note?: string;
  reason?: string;
}) {
  const { data, error } = await supabase.functions.invoke("campaign-admin-action", { body: input });
  if (error) throw error;
  return data;
}
