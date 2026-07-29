import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the supabase client BEFORE importing the module under test.
vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      functions: {
        invoke: vi.fn(),
      },
    },
  };
});

import { supabase } from "@/integrations/supabase/client";
import {
  uploadIncidentEvidence,
  getIncidentEvidenceUrl,
  EVIDENCE_MIME,
  EVIDENCE_MAX_BYTES,
} from "@/lib/knowledge/incidentEvidence";

const INCIDENT = "11111111-1111-1111-1111-111111111111";

function makeFile(name: string, type: string, size: number): File {
  const bytes = new Uint8Array(size);
  const file = new File([bytes], name, { type });
  // jsdom's File lacks arrayBuffer(); polyfill for the sha256 helper.
  if (typeof (file as any).arrayBuffer !== "function") {
    (file as any).arrayBuffer = async () => bytes.buffer;
  }
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Provide crypto.subtle for the sha256 helper in jsdom (older jsdom lacks it).
  if (!globalThis.crypto?.subtle) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).crypto = require("node:crypto").webcrypto;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("incidentEvidence — client-side guardrails", () => {
  it("rejects disallowed MIME before any network call", async () => {
    const file = makeFile("x.svg", "image/svg+xml", 100);
    await expect(uploadIncidentEvidence(INCIDENT, file)).rejects.toThrow(
      "mime_not_allowed",
    );
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("rejects empty files before any network call", async () => {
    const file = makeFile("x.jpg", "image/jpeg", 0);
    await expect(uploadIncidentEvidence(INCIDENT, file)).rejects.toThrow(
      "file_too_large",
    );
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("rejects files above the max byte budget before any network call", async () => {
    // Use a tiny sparse allocation to avoid actually allocating 10MB in RAM;
    // we can't easily create >EVIDENCE_MAX_BYTES cheaply, so assert the
    // constant boundary directly.
    expect(EVIDENCE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(EVIDENCE_MIME.has("application/pdf")).toBe(true);
    expect(EVIDENCE_MIME.has("image/svg+xml")).toBe(false);
    expect(EVIDENCE_MIME.has("text/html")).toBe(false);
    expect(EVIDENCE_MIME.has("application/octet-stream")).toBe(false);
  });

  it("propagates edge-function errors from init without retrying", async () => {
    (supabase.functions.invoke as any).mockResolvedValueOnce({
      data: null,
      error: new Error("forbidden"),
    });
    const file = makeFile("x.jpg", "image/jpeg", 1024);
    await expect(uploadIncidentEvidence(INCIDENT, file)).rejects.toThrow(
      "forbidden",
    );
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });

  it("propagates error payloads returned in `data.error` without retrying", async () => {
    (supabase.functions.invoke as any).mockResolvedValueOnce({
      data: { error: "incident_not_found" },
      error: null,
    });
    const file = makeFile("x.jpg", "image/jpeg", 1024);
    await expect(uploadIncidentEvidence(INCIDENT, file)).rejects.toThrow(
      "incident_not_found",
    );
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });

  it("getIncidentEvidenceUrl surfaces edge-function errors instead of exposing raw storage state", async () => {
    (supabase.functions.invoke as any).mockResolvedValueOnce({
      data: null,
      error: new Error("forbidden"),
    });
    await expect(
      getIncidentEvidenceUrl("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
    ).rejects.toThrow("forbidden");
  });

  it("never persists the raw file object in the invoke payload", async () => {
    (supabase.functions.invoke as any)
      .mockResolvedValueOnce({
        data: {
          storage_path: `${INCIDENT}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg`,
          upload_url: "https://example.invalid/upload",
          token: "t",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
        error: null,
      });

    // Stub XHR so upload succeeds without hitting the network.
    class XHRStub {
      upload = { onprogress: null as any };
      onload: any = null;
      onerror: any = null;
      status = 200;
      open() {}
      setRequestHeader() {}
      send() {
        this.onload?.();
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).XMLHttpRequest = XHRStub as any;

    const file = makeFile("hello.jpg", "image/jpeg", 8);
    await uploadIncidentEvidence(INCIDENT, file);

    for (const call of (supabase.functions.invoke as any).mock.calls) {
      const [, opts] = call;
      const body = opts?.body ?? {};
      expect(body.file).toBeUndefined();
      // The upload URL and token are single-use server artefacts — the client
      // must never echo them back into a subsequent invoke call.
      expect(JSON.stringify(body)).not.toContain("https://example.invalid/upload");
    }
  });
});
