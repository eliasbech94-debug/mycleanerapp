import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
const URL = `${Deno.env.get("SUPABASE_URL") ?? "http://localhost:54321"}/functions/v1/admin-provider-action`;

Deno.test("OPTIONS returns CORS headers", async () => {
  const res = await fetch(URL, { method: "OPTIONS" });
  await res.text();
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});
Deno.test("POST without auth returns 401 with CORS", async () => {
  const res = await fetch(URL, { method: "POST" });
  await res.json();
  assertEquals(res.status, 401);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});
