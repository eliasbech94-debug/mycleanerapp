// Playwright walk-through of the /bliv-cleaner onboarding wizard.
// Runs against STAGING_APP_URL with the seeded provider account.
import { test, expect } from "@playwright/test";

const APP = process.env.STAGING_APP_URL!;
const EMAIL = `rc2-provider@${process.env.TEST_EMAIL_DOMAIN}`;
const PASSWORD = process.env.TEST_PASSWORD!;

test("provider can open onboarding wizard", async ({ page }, testInfo) => {
  await page.goto(`${APP}/login`);
  await page.getByLabel(/e-?mail/i).fill(EMAIL);
  await page.getByLabel(/adgangskode|password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /log ind|sign in/i }).click();
  await page.waitForURL(/\/(provider|dashboard|customer)/, { timeout: 15_000 });
  await page.goto(`${APP}/bliv-cleaner`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
  await testInfo.attach("onboarding-step-1.png", { body: await page.screenshot(), contentType: "image/png" });
});

test("customer can open marketplace", async ({ page }, testInfo) => {
  await page.goto(`${APP}/marketplace`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
  await testInfo.attach("marketplace.png", { body: await page.screenshot(), contentType: "image/png" });
});
