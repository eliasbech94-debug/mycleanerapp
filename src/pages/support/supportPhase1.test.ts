/**
 * Phase 1 support workspace regression tests.
 *
 * Covers the security contract of the private-notes surface and the
 * dashboard route wiring. Database-level guarantees (RLS / grants) are
 * asserted against the shipped migration SQL, so a future migration that
 * loosens them fails here.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const migration = (() => {
  const dir = path.join(root, "supabase/migrations");
  const file = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ f, s: fs.readFileSync(path.join(dir, f), "utf8") }))
    .find((x) => x.s.includes("support_entity_notes"));
  return file?.s ?? "";
})();

describe("support_entity_notes — database contract", () => {
  it("ships a migration creating the table", () => {
    expect(migration).toContain("CREATE TABLE public.support_entity_notes");
  });

  it("revokes all Data API access from anon and authenticated (no direct frontend writes)", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON public\.support_entity_notes FROM anon, authenticated/,
    );
    expect(migration).not.toMatch(
      /GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ON public\.support_entity_notes TO (anon|authenticated)/,
    );
  });

  it("enables RLS and only lets support staff read", () => {
    expect(migration).toContain(
      "ALTER TABLE public.support_entity_notes ENABLE ROW LEVEL SECURITY",
    );
    expect(migration).toContain("public.is_support_agent(auth.uid())");
    // Deny-by-default: no INSERT/UPDATE/DELETE policy exists for clients.
    expect(migration).not.toMatch(/ON public\.support_entity_notes\s+FOR (INSERT|UPDATE|DELETE)/i);
  });

  it("keeps customers, providers and anon out (no permissive policy)", () => {
    expect(migration).not.toMatch(/USING \(true\)/);
    expect(migration).not.toMatch(/TO anon/);
  });

  it("gates support_recent_activity to staff and to service_role execution only", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.support_recent_activity");
    expect(migration).toContain("NOT public.is_support_agent(_user)");
    expect(migration).toContain("RAISE EXCEPTION 'forbidden'");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.support_recent_activity\(uuid, integer\) FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.support_recent_activity\(uuid, integer\) TO service_role/,
    );
  });

  it("narrows the legacy {public} support_threads / support_messages policies", () => {
    expect(migration).toContain(
      'ALTER POLICY "Support agents view all threads" ON public.support_threads TO authenticated',
    );
    expect(migration).toContain(
      'ALTER POLICY "Support agents insert messages" ON public.support_messages TO authenticated',
    );
  });
});

describe("support note edge functions — staff gate, validation, audit", () => {
  const create = read("supabase/functions/support-note-create/index.ts");
  const list = read("supabase/functions/support-note-list/index.ts");
  const update = read("supabase/functions/support-note-update/index.ts");
  const dashboard = read("supabase/functions/support-dashboard/index.ts");

  it.each([
    ["support-note-create", create],
    ["support-note-list", list],
    ["support-note-update", update],
    ["support-dashboard", dashboard],
  ])("%s authenticates and gates on support/admin", (_name, src) => {
    expect(src).toContain("authenticate(req, corsHeaders)");
    expect(src).toContain('requireRole(ctx, ["support", "admin"]');
  });

  it("rejects an invalid subject_type and an unknown subject user", () => {
    expect(create).toContain("isSubjectType(subject_type)");
    expect(create).toContain("subjectExists(ctx.admin, subject_type, subject_user_id)");
    expect(create).toContain("Subject user not found");
  });

  it("audits create and update of private notes", () => {
    expect(create).toContain('action: "support_note_create"');
    expect(update).toContain('action: "support_note_update"');
  });

  it("does not implement deletion in phase 1", () => {
    expect(create + list + update).not.toContain(".delete()");
  });

  it("dashboard only returns staff-gated RPC data, never raw tables", () => {
    expect(dashboard).toContain('rpc("support_counters"');
    expect(dashboard).toContain('rpc("support_recent_activity"');
    expect(dashboard).not.toContain('.from("conversations")');
    expect(dashboard).not.toContain('.from("conversation_events")');
  });
});

describe("support note validation helpers", () => {
  it("enforces subject types, uuids and body limits", async () => {
    const mod = await import("../../supabase/functions/_shared/supportNotes.ts");
    expect(mod.isSubjectType("customer")).toBe(true);
    expect(mod.isSubjectType("provider")).toBe(true);
    expect(mod.isSubjectType("employee")).toBe(false);
    expect(mod.isSubjectType("")).toBe(false);

    expect(mod.isUuid("11111111-2222-3333-4444-555555555555")).toBe(true);
    expect(mod.isUuid("not-a-uuid")).toBe(false);

    expect(mod.validateBody("  hello  ")).toEqual({ ok: true, body: "hello" });
    expect(mod.validateBody("   ").ok).toBe(false);
    expect(mod.validateBody(123).ok).toBe(false);
    expect(mod.validateBody("x".repeat(mod.NOTE_BODY_MAX + 1)).ok).toBe(false);
  });

  it("shapes notes to the necessary fields only", async () => {
    const mod = await import("../../supabase/functions/_shared/supportNotes.ts");
    const shaped = mod.shapeNote({
      id: "1",
      subject_type: "customer",
      subject_user_id: "2",
      body: "b",
      author_user_id: "3",
      pinned: false,
      created_at: "t",
      updated_at: "t",
      secret_internal_column: "leak",
    });
    expect(Object.keys(shaped)).not.toContain("secret_internal_column");
  });

  it("rejects a provider subject that has no provider profile", async () => {
    const mod = await import("../../supabase/functions/_shared/supportNotes.ts");
    const admin = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              table === "profiles" ? { data: { id: "u1" } } : { data: null },
          }),
        }),
      }),
    } as never;
    expect(await mod.subjectExists(admin, "provider", "u1")).toBe(false);
    expect(await mod.subjectExists(admin, "customer", "u1")).toBe(true);
  });
});

describe("support routes", () => {
  const app = read("src/App.tsx");
  const shell = read("src/pages/support/SupportShell.tsx");

  it("/support points at the dashboard", () => {
    expect(shell).toContain('<Navigate to="/support/dashboard" replace />');
  });

  it("registers /support/dashboard behind the support/admin role guard", () => {
    expect(app).toMatch(
      /<Route path="\/support\/dashboard" element=\{<RoleGuard allow=\{\["support", "admin"\]\}>/,
    );
  });

  it("keeps the existing inbox and cases routes intact", () => {
    expect(app).toContain('<Route path="/support/inbox"');
    expect(app).toContain('<Route path="/support/inbox/:conversationId"');
    expect(app).toContain('<Route path="/support/cases"');
  });
});

describe("private notes UI", () => {
  const ui = read("src/components/support/SupportPrivateNotes.tsx");

  it("labels notes as staff-only", () => {
    expect(ui).toContain('t("support.notes.staffOnly")');
    for (const lang of ["da", "en", "de", "es", "sv"]) {
      const bundle = JSON.parse(read(`public/locales/${lang}/admin.json`));
      expect(bundle.support.notes.staffOnly).toBeTruthy();
      expect(bundle.support.dashboard.title).toBeTruthy();
    }
    expect(JSON.parse(read("public/locales/da/admin.json")).support.notes.staffOnly).toBe(
      "Kun synlig for MyCleaner-medarbejdere",
    );
  });

  it("supports create, edit and pin but never delete", () => {
    expect(ui).toContain("useCreateSupportNote");
    expect(ui).toContain("useUpdateSupportNote");
    expect(ui).toContain("pinned: !n.pinned");
    expect(ui).not.toMatch(/delete/i);
  });

  it("reads and writes only through edge functions, never the table", async () => {
    const hook = read("src/hooks/useSupportNotes.ts");
    expect(hook).toContain("support-note-list");
    expect(hook).toContain("support-note-create");
    expect(hook).toContain("support-note-update");
    expect(hook).not.toContain('.from("support_entity_notes")');
    vi.resetModules();
  });
});
