/**
 * PROPOSAL ONLY — not deployed by this change.
 *
 * Scheduled monthly accounting report generator.
 *
 * Runs on the 1st of each month (pg_cron → this function) and, per provider:
 *   1. resolves the jurisdiction and the rule pack that was effective for the
 *      reported month (never today's pack),
 *   2. calls the authoritative `accounting-calculate` logic,
 *   3. freezes the inputs + result into `snapshot`,
 *   4. renders the PDF with pdf-lib using MyCleaner branding,
 *   5. uploads it to the PRIVATE `provider-accounting-reports` bucket,
 *   6. writes the report row (idempotent — retries never double-generate).
 *
 * The function never invents a legal outcome: if no rule pack is published for
 * the provider's country, the report states that no tax guidance is available.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

interface JobRequest {
  /** Defaults to the month that just ended. */
  year?: number;
  month?: number;
  providerIds?: string[];
  /** Provider-initiated mid-month report. */
  kind?: "scheduled_month_end" | "provisional";
  /** Generate a report even when the month has no activity. */
  generateEmptyMonths?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = (await req.json().catch(() => ({}))) as JobRequest;
    const now = new Date();
    const target = previousMonth(now, body.year, body.month);

    // Providers are processed in batches with a lease so a retry or a parallel
    // worker can never generate the same report twice. The unique index on
    // `idempotency_key` is the final guard.
    const summary = { attempted: 0, generated: 0, skipped: 0, failed: 0, target };

    // ... per-provider loop:
    //   const snapshot = await buildSnapshot(supabase, providerId, target);
    //   if (!shouldGenerateReport(snapshot, body)) { summary.skipped++; continue; }
    //   const document = buildMonthlyReportDocument({ snapshot, kind });
    //   const pdf = await renderReportPdf(document);           // pdf-lib
    //   await supabase.storage.from("provider-accounting-reports")
    //     .upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });
    //   await supabase.from("provider_monthly_accounting_reports").insert({ ... });

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("monthly report generation failed", error);
    return new Response(
      JSON.stringify({ error: "generation_failed", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function previousMonth(now: Date, year?: number, month?: number) {
  if (year && month) return { year, month };
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1 };
}
