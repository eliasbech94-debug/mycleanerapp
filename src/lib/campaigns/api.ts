// Client-side Campaign Engine data access. All reads go through RLS; all
// writes go through the campaign-* edge functions. This layer normalises
// the underlying schema (sort_order, payload, hero_headline, etc.) into a
// stable frontend shape so the renderer never touches raw column names.
import { supabase } from "@/integrations/supabase/client";

export interface CampaignSummary {
  id: string;
  slug: string;
  name: string;                 // derived: country title || slug
  kind: string;
  lifecycle: string;
  starts_at: string | null;
  ends_at: string | null;
  headline: string | null;      // derived from country_settings.hero_headline
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
  countrySettings: Array<{ country_code: string; enabled: boolean; currency: string | null }>;
}

export async function loadPublicCampaign(slug: string, countryIso?: string | null): Promise<CampaignFullPage | null> {
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, slug, kind, lifecycle, starts_at, ends_at, enable_waiting_list, version, deleted_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !campaign || campaign.deleted_at) return null;

  const [blocks, benefits, faq, testimonials, countrySettings] = await Promise.all([
    supabase.from("campaign_page_blocks").select("id, block_type, sort_order, payload, country_code, enabled").eq("campaign_id", campaign.id).eq("enabled", true).order("sort_order"),
    supabase.from("campaign_benefits").select("id, title, description, icon, sort_order, country_code, enabled").eq("campaign_id", campaign.id).eq("enabled", true).order("sort_order"),
    supabase.from("campaign_faq").select("id, question, answer, sort_order, country_code, enabled").eq("campaign_id", campaign.id).eq("enabled", true).order("sort_order"),
    supabase.from("campaign_testimonials").select("id, author, role_label, quote, avatar_url, sort_order, country_code, enabled").eq("campaign_id", campaign.id).eq("enabled", true).order("sort_order"),
    supabase.from("campaign_country_settings").select("country_code, enabled, currency, title, hero_headline, hero_subheadline").eq("campaign_id", campaign.id),
  ]);

  const country = (countryIso ?? "").toUpperCase();
  const cs = (countrySettings.data ?? []).find((r) => r.country_code === country) ?? (countrySettings.data ?? [])[0];

  const filterByCountry = <T extends { country_code: string | null }>(rows: T[] | null) =>
    (rows ?? []).filter((r) => !r.country_code || r.country_code === country || !country);

  return {
    campaign: {
      id: campaign.id,
      slug: campaign.slug,
      kind: campaign.kind,
      lifecycle: campaign.lifecycle,
      starts_at: campaign.starts_at,
      ends_at: campaign.ends_at,
      enable_waiting_list: campaign.enable_waiting_list,
      version: campaign.version,
      name: cs?.title || campaign.slug,
      headline: cs?.hero_headline ?? null,
      subheadline: cs?.hero_subheadline ?? null,
    },
    blocks: filterByCountry(blocks.data as any).map((b: any) => ({
      id: b.id,
      block_type: b.block_type,
      position: b.sort_order,
      content: (b.payload ?? {}) as Record<string, unknown>,
      country_scope: b.country_code ? [b.country_code] : null,
      locale_scope: null,
    })),
    benefits: filterByCountry(benefits.data as any).map((b: any) => ({
      id: b.id, title: b.title, description: b.description, icon: b.icon, position: b.sort_order,
    })),
    faq: filterByCountry(faq.data as any).map((f: any) => ({
      id: f.id, question: f.question, answer: f.answer, position: f.sort_order,
    })),
    testimonials: filterByCountry(testimonials.data as any).map((t: any) => ({
      id: t.id, name: t.author, quote: t.quote, role: t.role_label, avatar_url: t.avatar_url, position: t.sort_order,
    })),
    countrySettings: (countrySettings.data ?? []).map((r: any) => ({
      country_code: r.country_code, enabled: r.enabled, currency: r.currency,
    })),
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
  } catch { /* analytics failures never surface */ }
}

export async function verifyCampaignEmail(application_id: string, token: string) {
  const { data, error } = await supabase.functions.invoke("campaign-verify-email", {
    body: { application_id, token },
  });
  if (error) throw error;
  return data as { status: string; application?: { id: string; status?: string } };
}

// Admin
export interface AdminCampaign {
  id: string; slug: string; kind: string; lifecycle: string;
  starts_at: string | null; ends_at: string | null; version: number;
  deleted_at: string | null; created_at: string; name: string;
}

export async function listAdminCampaigns(): Promise<AdminCampaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, slug, kind, lifecycle, starts_at, ends_at, version, deleted_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c: any) => ({ ...c, name: c.slug }));
}

export interface AdminApplication {
  id: string; full_name: string; email: string; country_code: string;
  status: string; assigned_number: number | null; waiting_list_position: number | null;
  email_verified_at: string | null; created_at: string; deleted_at: string | null;
}

export async function listAdminApplications(campaignId: string): Promise<AdminApplication[]> {
  const { data, error } = await supabase
    .from("campaign_applications")
    .select("id, full_name, email, country_code, status, assigned_number, waiting_list_position, email_verified_at, created_at, deleted_at")
    .eq("campaign_id", campaignId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as AdminApplication[];
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
