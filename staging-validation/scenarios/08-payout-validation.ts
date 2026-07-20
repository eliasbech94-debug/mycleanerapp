// After 03-stripe-webhook has replayed a transfer.created, verify the
// finance_payouts row exists with correct fields.
import { psqlJson } from "../lib/supabase-admin.js";
import { runScenario, assert, attach, saveJson } from "../lib/reporter.js";

export async function scenarioPayoutValidation() {
  return runScenario("08-payout-validation", "transfer.created → finance_payouts mirror", async (ctx) => {
    const rows = psqlJson<any>(
      `select stripe_transfer_id, gross_amount, net_amount, platform_fee_amount, currency, status
         from public.finance_payouts where stripe_transfer_id = 'tr_rc2' limit 1`,
    );
    saveJson("payouts/finance_payouts.json", rows);
    attach(ctx, "payouts/finance_payouts.json");
    assert(ctx, "finance_payouts row exists", rows.length === 1);
    if (rows[0]) {
      assert(ctx, "currency=DKK", rows[0].currency === "DKK");
      assert(ctx, "gross > 0", (rows[0].gross_amount ?? 0) > 0);
    }
  });
}
