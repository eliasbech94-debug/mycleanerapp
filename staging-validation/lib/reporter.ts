// Central evidence + result collector. Every scenario writes through here.
// - No scenario may declare PASS without at least one artifact.
// - Every artifact is redacted before being written to disk.
// - Statuses distinguish PASS / FAIL / BLOCKED / NOT_EXECUTED / SKIP so a
//   blocked external integration is never silently reported as passed.
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { EVIDENCE_DIR, RUN_ID } from "../config.js";
import { redactValue } from "./redact.js";

export type Status = "PASS" | "FAIL" | "BLOCKED" | "NOT_EXECUTED" | "SKIP";

export interface ScenarioResult {
  id: string;
  title: string;
  status: Status;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  assertions: { name: string; ok: boolean; detail?: string }[];
  artifacts: string[];
  error?: string;
  blocked_reason?: string;
}

const results: ScenarioResult[] = [];

export class BlockedError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "BlockedError";
  }
}
export const blocked = (reason: string): never => { throw new BlockedError(reason); };

export function evidencePath(...parts: string[]): string {
  const p = join(EVIDENCE_DIR, ...parts);
  mkdirSync(dirname(p), { recursive: true });
  return p;
}

function stripSecrets(data: unknown): unknown { return redactValue(data); }

export function saveJson(relPath: string, data: unknown): string {
  const p = evidencePath(relPath);
  writeFileSync(p, JSON.stringify(stripSecrets(data), null, 2));
  return relPath;
}

export function saveText(relPath: string, data: string): string {
  const p = evidencePath(relPath);
  writeFileSync(p, String(stripSecrets(data)));
  return relPath;
}

export async function runScenario(
  id: string,
  title: string,
  fn: (ctx: ScenarioCtx) => Promise<void>,
): Promise<ScenarioResult> {
  const started = Date.now();
  const ctx: ScenarioCtx = { id, artifacts: [], assertions: [] };
  console.log(`\n▶ ${id} ${title}`);
  let status: Status = "PASS";
  let error: string | undefined;
  let blocked_reason: string | undefined;
  try {
    await fn(ctx);
    if (ctx.assertions.some((a) => !a.ok)) status = "FAIL";
    if (ctx.artifacts.length === 0 && status === "PASS") {
      status = "FAIL";
      error = "no evidence artifacts produced — refusing to green-light";
    }
  } catch (e) {
    if (e instanceof BlockedError) {
      status = "BLOCKED";
      blocked_reason = e.reason;
    } else {
      status = "FAIL";
      error = (e as Error).stack ?? (e as Error).message;
    }
  }
  const finished = Date.now();
  const r: ScenarioResult = {
    id, title, status,
    started_at: new Date(started).toISOString(),
    finished_at: new Date(finished).toISOString(),
    duration_ms: finished - started,
    assertions: ctx.assertions,
    artifacts: ctx.artifacts,
    error,
    blocked_reason,
  };
  results.push(r);
  console.log(`  → ${status} in ${r.duration_ms}ms`);
  if (blocked_reason) console.log(`  ⏸ blocked: ${blocked_reason}`);
  if (error) console.log(`  ✖ ${error.split("\n")[0]}`);
  return r;
}

export function recordNotExecuted(id: string, title: string, reason: string) {
  const now = new Date().toISOString();
  results.push({
    id, title, status: "NOT_EXECUTED",
    started_at: now, finished_at: now, duration_ms: 0,
    assertions: [], artifacts: [],
    error: reason,
  });
  console.log(`\n▶ ${id} ${title}\n  → NOT_EXECUTED (${reason})`);
}

export interface ScenarioCtx {
  id: string;
  artifacts: string[];
  assertions: { name: string; ok: boolean; detail?: string }[];
}

export function assert(ctx: ScenarioCtx, name: string, ok: boolean, detail?: string) {
  ctx.assertions.push({ name, ok, detail });
  if (!ok) console.log(`    ✖ assert failed: ${name}${detail ? ` — ${detail}` : ""}`);
}

export function attach(ctx: ScenarioCtx, relPath: string) { ctx.artifacts.push(relPath); }
export function skip(ctx: ScenarioCtx, reason: string) {
  ctx.assertions.push({ name: "skipped", ok: true, detail: reason });
}

/**
 * Standalone assertion logger for scenarios executed directly (no runScenario
 * wrapper), e.g. `bun run pr2:claim`. Prints a stable, greppable line per
 * assertion and forces a non-zero exit code if any assertion failed.
 */
const standaloneAssertions: { scenario: string; name: string; ok: boolean; detail?: string }[] = [];
let standaloneHookInstalled = false;

export function logAssertion(scenario: string, name: string, ok: boolean, detail?: string) {
  standaloneAssertions.push({ scenario, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${scenario}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!standaloneHookInstalled) {
    standaloneHookInstalled = true;
    process.on("exit", (code) => {
      const failed = standaloneAssertions.filter((a) => !a.ok);
      console.log(
        `\n${standaloneAssertions.length - failed.length}/${standaloneAssertions.length} assertions passed`,
      );
      for (const f of failed) console.log(`  ✖ [${f.scenario}] ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
      if (failed.length > 0 && code === 0) process.exitCode = 1;
    });
  }
}


export function writeReport() {
  const count = (s: Status) => results.filter((r) => r.status === s).length;
  const pass = count("PASS");
  const fail = count("FAIL");
  const blockedN = count("BLOCKED");
  const notExec = count("NOT_EXECUTED");
  const skipCount = count("SKIP");

  const summary = {
    run_id: RUN_ID,
    generated_at: new Date().toISOString(),
    totals: { pass, fail, blocked: blockedN, not_executed: notExec, skip: skipCount, total: results.length },
    scenarios: results,
  };
  saveJson("report.json", summary);

  const verdict =
    fail > 0 ? `**RC2 HARNESS RESULT: NOT READY** — ${fail} scenario(s) failed.` :
    blockedN > 0 || notExec > 0
      ? `**RC2 HARNESS RESULT: NOT READY** — ${blockedN} blocked, ${notExec} not executed. Blocked external integrations are never reported as passed.`
      : `**RC2 HARNESS RESULT: READY FOR CONTROLLED BETA** — ${pass}/${results.length} scenarios passed.`;

  const md: string[] = [];
  md.push(`# RC2 Staging Validation Report`);
  md.push(`Run: \`${RUN_ID}\`  •  Generated: ${summary.generated_at}`);
  md.push(``);
  md.push(`## Verdict`);
  md.push(verdict);
  md.push(``);
  md.push(`Totals — PASS ${pass} · FAIL ${fail} · BLOCKED ${blockedN} · NOT_EXECUTED ${notExec} · SKIP ${skipCount}`);
  md.push(``);
  md.push(`| # | Scenario | Status | Duration | Assertions | Artifacts |`);
  md.push(`|---|---|---|---:|---:|---:|`);
  for (const r of results) {
    md.push(`| ${r.id} | ${r.title} | ${r.status} | ${r.duration_ms}ms | ${r.assertions.filter(a=>a.ok).length}/${r.assertions.length} | ${r.artifacts.length} |`);
  }
  md.push(``);
  for (const r of results) {
    md.push(`### ${r.id} — ${r.title} [${r.status}]`);
    md.push(`- Duration: ${r.duration_ms} ms`);
    if (r.blocked_reason) md.push(`- Blocked: \`${r.blocked_reason}\``);
    if (r.error) md.push(`- Error: \`${r.error.split("\n")[0]}\``);
    if (r.assertions.length) {
      md.push(`- Assertions:`);
      for (const a of r.assertions) md.push(`  - ${a.ok ? "✓" : "✖"} ${a.name}${a.detail ? ` — ${a.detail}` : ""}`);
    }
    if (r.artifacts.length) {
      md.push(`- Evidence:`);
      for (const p of r.artifacts) md.push(`  - \`${p}\``);
    }
    md.push(``);
  }

  const manifest: { path: string; bytes: number }[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else manifest.push({ path: p.replace(EVIDENCE_DIR + "/", ""), bytes: s.size });
    }
  };
  walk(EVIDENCE_DIR);
  saveJson("manifest.json", manifest);
  writeFileSync(evidencePath("report.md"), md.join("\n"));

  return { pass, fail, blocked: blockedN, not_executed: notExec, skip: skipCount };
}
