import { describe, expect, it } from "vitest";
import { isProductionHostname, PRODUCTION_HOSTNAMES } from "@/lib/appEnv";

describe("isProductionHostname", () => {
  it("matches every configured production hostname", () => {
    for (const h of PRODUCTION_HOSTNAMES) expect(isProductionHostname(h)).toBe(true);
    expect(isProductionHostname("WWW.MyCleaner.dk")).toBe(true);
  });

  it("does not match preview or local hostnames", () => {
    expect(isProductionHostname("localhost")).toBe(false);
    expect(
      isProductionHostname("id-preview--c41cdc9d-5ab6-4c8d-987e-e3272520bdfb.lovable.app"),
    ).toBe(false);
    expect(isProductionHostname("evil-mycleaner.dk")).toBe(false);
    expect(isProductionHostname("")).toBe(false);
  });
});
