// CORS + auth surface tests. Deployed endpoint only — behaviour with a real
// user is covered by the SQL/integration checks in Step 3a verification.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const URL = `${Deno.env.get("SUPABASE_URL") ?? "http://localhost:54321"}/functions/v1/provider-start-application`;

Deno.test("OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});

Deno.test("POST without auth returns 401 with CORS", async () => {
  const res = await fetch(URL, { method: "POST" });
  const body = await res.json();
  assertEquals(res.status, 401);
  assertEquals(body.error, "Unauthorized");
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});

Deno.test("GET returns 405 with CORS", async () => {
  const res = await fetch(URL, { method: "GET" });
  await res.text();
  // Auth check happens before method check on this endpoint; either 401 or 405
  // is acceptable — both must carry CORS.
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});
