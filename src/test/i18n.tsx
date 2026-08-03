/**
 * Shared i18next test instance.
 *
 * Component tests that render real product surfaces must resolve real
 * translation keys — otherwise `useTranslation` warns with
 * `NO_I18NEXT_INSTANCE` and every `t("some.key")` renders the raw key,
 * which silently hides genuine missing-translation bugs.
 *
 * This helper builds an isolated instance per test file:
 *  - `createInstance()` instead of the i18next module singleton, so two test
 *    files (or two tests) can never leak language/resource state into each
 *    other.
 *  - `initReactI18next` is deliberately NOT registered, because it installs a
 *    process-wide default instance. Consumers pass the instance explicitly
 *    through `I18nTestProvider`.
 *  - Bundles are read from `public/locales`, the same JSON the app ships, so a
 *    key missing in production fails the test instead of silently falling back.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInstance, type i18n as I18nInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import type { ReactNode } from "react";

/**
 * Derived from the runtime namespace list so a test can never load a
 * different set of bundles than the application does.
 */
export const TEST_NAMESPACES: readonly string[] = (() => {
  const src = readFileSync(resolve(process.cwd(), "src/i18n/index.ts"), "utf8");
  const m = src.match(/const NAMESPACES = \[([^\]]+)\]/);
  if (!m) throw new Error("Could not read the namespace list from src/i18n/index.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
})();

function loadBundles(lng: string, namespaces: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const ns of namespaces) {
    out[ns] = JSON.parse(
      readFileSync(resolve(process.cwd(), `public/locales/${lng}/${ns}.json`), "utf8"),
    );
  }
  return out;
}

export interface TestI18nOptions {
  /** Language under test. Defaults to Danish, the primary market. */
  lng?: string;
  /** Namespaces to preload. Defaults to every runtime namespace. */
  namespaces?: readonly string[];
}

/**
 * Creates and initialises a fresh i18next instance backed by the real
 * `public/locales` bundles. Await it once per test file (`beforeAll`).
 */
export async function createTestI18n(options: TestI18nOptions = {}): Promise<I18nInstance> {
  const lng = options.lng ?? "da";
  const namespaces = options.namespaces ?? TEST_NAMESPACES;
  const instance = createInstance();
  await instance.init({
    lng,
    ns: [...namespaces],
    defaultNS: "common",
    // No fallback: a key missing in the language under test must surface as a
    // test failure rather than quietly resolving through English.
    fallbackLng: false,
    resources: { [lng]: loadBundles(lng, namespaces) },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

/** Wraps a tree with the isolated test instance. */
export function I18nTestProvider({
  i18n,
  children,
}: {
  i18n: I18nInstance;
  children: ReactNode;
}) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
