// Central evidence + result collector. Every scenario writes through here.
// No scenario is allowed to declare PASS without at least one artifact.
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { EVIDENCE_DIR, RUN_ID } from "../config.js";

export type Status = "PASS" | "FAIL" | "SKIP";

export interface ScenarioResult {
  id: string;
  title: string;
  status: Status;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  assertions: { name: string; ok: boolean; detail?: string }[];
  artifacts: string[]; // relative paths under evidence dir
  error?: string;
}

const results: ScenarioResult[] = [];

export function evidencePath(...parts: string[]): string {
  const p = join(EVIDENCE_DIR, ...parts);
  mkdirSync(dirname(p), { recursive: true });
  return p;
}

export function saveJson(relPath: string, data: unknown): string {
  const p = evidencePath(relPath);
  writeFileSync(p, JSON.stringify(data, null, 2));
  return relPath;
}

export function saveText(relPath: string, data: string): string {
  const p = evidencePath(relPath);
  writeFileSync(p, data);
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
  try {
    await fn(ctx);
    if (ctx.assertions.some((a) => !a.ok)) status = "FAIL";
    if (ctx.artifacts.length === 0 && status === "PASS") {
      status = "FAIL";
      error = "no evidence artifacts produced — refusing to green-light";
    }
  } catch (e) {
    status = "FAIL";
    error = (e as Error).stack ?? (e as Error).message;
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
  };
  results.push(r);
  console.log(`  → ${status} in ${r.duration_ms}ms`);
  if (error) console.log(`  ✖ ${error.split("\n")[0]}`);
  return r;
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

export function attach(ctx: ScenarioCtx, relPath: string) {
  ctx.artifacts.push(relPath);
}

export function skip(ctx: ScenarioCtx, reason: string) {
  ctx.assertions.push({ name: "skipped", ok: true, detail: reason });
}

export function writeReport(): { pass: number; fail: number; skip: number } {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skipCount = results.filter((r) => r.status === "SKIP").length;
  const summary = {
    run_id: RUN_ID,
    generated_at: new Date().toISOString(),
    totals: { pass, fail, skip: skipCount, total: results.length },
    scenarios: results,
  };
  saveJson("report.json", summary);

  const md: string[] = [];
  md.push(`# RC2 Staging Validation Report`);
  md.push(`Run: \`${RUN_ID}\`  •  Generated: ${summary.generated_at}`);
  md.push(``);
  md.push(`## Verdict`);
  md.push(fail === 0 ? `**READY FOR CONTROLLED BETA** — ${pass}/${results.length} scenarios passed.` : `**NOT READY** — ${fail} scenario(s) failed.`);
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

  // Manifest of every file actually on disk (independent proof).
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
  return { pass, fail, skip: skipCount };
}
