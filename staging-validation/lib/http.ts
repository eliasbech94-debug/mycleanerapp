// Instrumented fetch. Every call writes a redacted transcript into evidence/http/.
import { saveJson } from "./reporter.js";
import { redactHeaders, redactValue } from "./redact.js";

let seq = 0;

export async function httpCall(
  label: string,
  input: string,
  init: RequestInit = {},
): Promise<{ status: number; body: string; json: any; artifact: string }> {
  const started = Date.now();
  const res = await fetch(input, init);
  const body = await res.text();
  let json: any = null;
  try { json = JSON.parse(body); } catch { /* not JSON */ }
  const record = {
    label,
    request: {
      method: init.method ?? "GET",
      url: redactValue(input),
      headers: redactHeaders(init.headers as Record<string, string> | undefined),
      body: typeof init.body === "string" ? redactValue(tryJson(init.body)) : null,
    },
    response: {
      status: res.status,
      headers: redactHeaders(res.headers),
      body: redactValue(json ?? body),
    },
    timing_ms: Date.now() - started,
    at: new Date().toISOString(),
  };
  const artifact = `http/${String(++seq).padStart(4, "0")}-${label}.json`;
  saveJson(artifact, record);
  return { status: res.status, body, json, artifact };
}

function tryJson(s: string): any {
  try { return JSON.parse(s); } catch { return s.slice(0, 2000); }
}
