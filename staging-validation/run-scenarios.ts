// Orchestrates all non-UI scenarios in one process so they share a report.
import "./config.js";
import { writeReport } from "./lib/reporter.js";
import { scenarioSeed } from "./scenarios/01-seed.js";
import { scenarioProviderLifecycle } from "./scenarios/02-provider-lifecycle.js";
import { scenarioStripeWebhookReplay } from "./scenarios/03-stripe-webhook-replay.js";
import { scenarioSumsubReplay } from "./scenarios/04-sumsub-webhook-replay.js";
import { scenarioMarketplaceSearch } from "./scenarios/05-marketplace-search.js";
import { scenarioConcurrentBooking } from "./scenarios/06-concurrent-booking.js";
import { scenarioAdminBulk } from "./scenarios/07-admin-bulk.js";
import { scenarioPayoutValidation } from "./scenarios/08-payout-validation.js";
import { scenarioScoreTier } from "./scenarios/09-score-tier.js";
import { scenarioFailureRecovery } from "./scenarios/10-failure-recovery.js";

async function main() {
  // Order matters: seed → lifecycle → webhooks → derived state → recovery.
  await scenarioSeed();
  await scenarioProviderLifecycle();
  await scenarioStripeWebhookReplay();
  await scenarioSumsubReplay();
  await scenarioMarketplaceSearch();
  await scenarioConcurrentBooking();
  await scenarioAdminBulk();
  await scenarioPayoutValidation();
  await scenarioScoreTier();
  await scenarioFailureRecovery();

  const totals = writeReport();
  console.log(`\n▶ Totals: ${JSON.stringify(totals)}`);
  process.exit(totals.fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
