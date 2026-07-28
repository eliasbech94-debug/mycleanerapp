import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Phase 5.1 smoke suite — real preview at http://localhost:8080.
 *
 * Covers:
 *  - Unauthenticated visitor lands on the marketing homepage without
 *    exceptions.
 *  - Authenticated routes redirect an unauthenticated visitor to /login
 *    (role-guard sanity: no leaks of customer/provider surfaces).
 *  - axe-core scan on the public homepage catches serious violations.
 *
 * We do NOT sign in inside CI (no seeded credentials), but we assert
 * the router behaviour we depend on for the role-protected V2 pages.
 */

const BASE = "http://localhost:8080";

async function axeScan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  return serious;
}

test.describe("smoke: unauthenticated", () => {
  test("homepage loads and has no serious a11y violations", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/localhost:8080/);
    await expect(page.locator("body")).toBeVisible();

    const serious = await axeScan(page);
    expect(
      serious,
      `serious a11y issues on /: ${serious.map((v) => v.id).join(", ")}`,
    ).toHaveLength(0);

    expect(errors, `runtime errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("customer dashboard redirects to login", async ({ page }) => {
    await page.goto(`${BASE}/customer/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/(login|auth)/, { timeout: 10_000 }).catch(() => {});
    expect(page.url()).toMatch(/\/(login|auth)/);
  });

  test("provider dashboard redirects to login", async ({ page }) => {
    await page.goto(`${BASE}/provider/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/(login|auth)/, { timeout: 10_000 }).catch(() => {});
    expect(page.url()).toMatch(/\/(login|auth)/);
  });

  test("customer profile redirects to login", async ({ page }) => {
    await page.goto(`${BASE}/customer/profile`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/(login|auth)/, { timeout: 10_000 }).catch(() => {});
    expect(page.url()).toMatch(/\/(login|auth)/);
  });

  test("provider profile redirects to login", async ({ page }) => {
    await page.goto(`${BASE}/provider/profile`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/(login|auth)/, { timeout: 10_000 }).catch(() => {});
    expect(page.url()).toMatch(/\/(login|auth)/);
  });
});

test.describe("smoke: login page a11y", () => {
  test("/login has no serious a11y violations", async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    const serious = await axeScan(page);
    expect(
      serious,
      `serious a11y issues on /login: ${serious.map((v) => v.id).join(", ")}`,
    ).toHaveLength(0);
  });
});
