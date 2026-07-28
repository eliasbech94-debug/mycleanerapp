// Pure-unit tests for the magic-byte MIME sniffer used by the finalize edge
// function. Runs safely in the sandbox — no network, no Deno, no DB. We
// import the source file directly (it has no npm: / Deno.env imports at
// top level, only crypto.subtle which exists in jsdom).

import { describe, it, expect } from "vitest";
import { sniffMime } from "../../../scripts/staging-required/edge-functions/_shared/mime-sniff.ts";

function bytes(...vals: (number | string)[]): Uint8Array {
  const out: number[] = [];
  for (const v of vals) {
    if (typeof v === "number") out.push(v);
    else for (const c of v) out.push(c.charCodeAt(0));
  }
  // pad to sniffer minimum (12 bytes).
  while (out.length < 32) out.push(0);
  return new Uint8Array(out);
}

describe("sniffMime — happy path", () => {
  it("detects JPEG from FF D8 FF", () => {
    const r = sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0));
    expect(r.mime).toBe("image/jpeg");
    expect(r.extension).toBe("jpg");
  });
  it("detects PNG signature", () => {
    const r = sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
    expect(r.mime).toBe("image/png");
  });
  it("detects WebP RIFF/WEBP container", () => {
    const r = sniffMime(bytes("RIFF", 0, 0, 0, 0, "WEBP"));
    expect(r.mime).toBe("image/webp");
  });
  it("detects PDF %PDF- header", () => {
    const r = sniffMime(bytes("%PDF-1.4"));
    expect(r.mime).toBe("application/pdf");
  });
});

describe("sniffMime — spoof rejection", () => {
  it("rejects SVG masquerading as image", () => {
    const r = sniffMime(bytes("<svg xmlns"));
    expect(r.mime).toBeNull();
    expect(r.reason).toBe("svg_or_xml_rejected");
  });
  it("rejects HTML", () => {
    const r = sniffMime(bytes("<html><body"));
    expect(r.mime).toBeNull();
    expect(r.reason).toBe("html_rejected");
  });
  it("rejects ZIP archives (also blocks docx/xlsx polyglots)", () => {
    const r = sniffMime(bytes(0x50, 0x4b, 0x03, 0x04));
    expect(r.reason).toBe("zip_rejected");
  });
  it("rejects Windows executables", () => {
    const r = sniffMime(bytes(0x4d, 0x5a, 0x90, 0x00));
    expect(r.reason).toBe("executable_rejected");
  });
  it("rejects unknown formats", () => {
    const r = sniffMime(bytes(0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb));
    expect(r.reason).toBe("unknown_format");
  });
  it("rejects too-short input", () => {
    const r = sniffMime(new Uint8Array([0xff, 0xd8]));
    expect(r.reason).toBe("too_short");
  });
  it("rejects file whose bytes contradict a JPG extension (HTML-as-JPG)", () => {
    const r = sniffMime(bytes("<!DOCTYPE html>"));
    expect(r.mime).toBeNull();
  });
});
