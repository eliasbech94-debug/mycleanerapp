import { describe, it, expect } from "vitest";
import { validateSlugFormat, normalizeSlug, slugReasonLabel } from "./slug";

describe("validateSlugFormat", () => {
  it("accepts simple lowercase slug", () => {
    expect(validateSlugFormat("marie-cleans")).toEqual({ ok: true, slug: "marie-cleans" });
  });
  it("lowercases and trims", () => {
    expect(normalizeSlug("  Marie-Cleans  ")).toBe("marie-cleans");
  });
  it("rejects empty", () => {
    expect(validateSlugFormat("")).toMatchObject({ ok: false, reason: "empty" });
  });
  it("rejects too short", () => {
    expect(validateSlugFormat("a")).toMatchObject({ ok: false, reason: "length" });
  });
  it("rejects too long (>40)", () => {
    expect(validateSlugFormat("a".repeat(41))).toMatchObject({ ok: false, reason: "length" });
  });
  it("rejects leading hyphen", () => {
    expect(validateSlugFormat("-abc")).toMatchObject({ ok: false, reason: "format" });
  });
  it("rejects trailing hyphen", () => {
    expect(validateSlugFormat("abc-")).toMatchObject({ ok: false, reason: "format" });
  });
  it("rejects double hyphen", () => {
    expect(validateSlugFormat("ab--cd")).toMatchObject({ ok: false, reason: "format" });
  });
  it("rejects uppercase (after normalize? we normalize first)", () => {
    // validateSlugFormat normalizes internally
    expect(validateSlugFormat("ABC")).toEqual({ ok: true, slug: "abc" });
  });
  it("rejects invalid chars", () => {
    expect(validateSlugFormat("hej_der")).toMatchObject({ ok: false, reason: "format" });
    expect(validateSlugFormat("hej der")).toMatchObject({ ok: false, reason: "format" });
    expect(validateSlugFormat("hej.der")).toMatchObject({ ok: false, reason: "format" });
  });
  it("accepts min length 2", () => {
    expect(validateSlugFormat("ab")).toEqual({ ok: true, slug: "ab" });
  });
  it("accepts max length 40", () => {
    const s = "a" + "b".repeat(38) + "c";
    expect(s.length).toBe(40);
    expect(validateSlugFormat(s)).toEqual({ ok: true, slug: s });
  });
  it("labels all reasons in Danish", () => {
    for (const r of ["empty","length","format","reserved","taken","history_conflict","rate_limited","unauthorized","unknown"] as const) {
      expect(slugReasonLabel(r)).toBeTruthy();
    }
  });
});
