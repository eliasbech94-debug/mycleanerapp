import { describe, expect, it } from "vitest";
import { isAllowedEvidenceFile, MAX_EVIDENCE_BYTES } from "./careerClient";

function fakeFile(size: number, type: string, name = "doc.pdf"): File {
  return new File([new Uint8Array(Math.min(size, 1024))], name, { type });
}

describe("career evidence client-side validation", () => {
  it("accepts a small PDF", () => {
    const r = isAllowedEvidenceFile(fakeFile(1024, "application/pdf"));
    expect(r.ok).toBe(true);
  });

  it("rejects unsupported MIME", () => {
    const r = isAllowedEvidenceFile(fakeFile(1024, "text/plain", "doc.txt"));
    expect(r.ok).toBe(false);
  });

  it("rejects files over 10 MB", () => {
    const bigFile = new File([new Uint8Array(1024)], "big.pdf", { type: "application/pdf" });
    // Simulate large size — Node's File does not honour huge buffers, so patch:
    Object.defineProperty(bigFile, "size", { value: MAX_EVIDENCE_BYTES + 1 });
    const r = isAllowedEvidenceFile(bigFile);
    expect(r.ok).toBe(false);
  });

  it("rejects zero-byte files", () => {
    const empty = new File([new Uint8Array()], "empty.pdf", { type: "application/pdf" });
    Object.defineProperty(empty, "size", { value: 0 });
    const r = isAllowedEvidenceFile(empty);
    expect(r.ok).toBe(false);
  });
});
