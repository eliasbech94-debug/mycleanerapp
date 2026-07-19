import { describe, expect, it, vi, beforeEach } from "vitest";

const authGetUser = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: (...a: any[]) => authGetUser(...a) },
    from: (t: string) => fromMock(t),
  },
}));

import { resolveHomeForCurrentUser } from "./roleRedirect";

function stubRoles(roles: string[]) {
  fromMock.mockReturnValue({
    select: () => ({ eq: () => Promise.resolve({ data: roles.map((r) => ({ role: r })) }) }),
  });
}

describe("resolveHomeForCurrentUser", () => {
  beforeEach(() => {
    authGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  });
  it("customer → /customer", async () => {
    stubRoles(["customer"]);
    expect(await resolveHomeForCurrentUser()).toBe("/customer");
  });
  it("provider → /provider-dashboard", async () => {
    stubRoles(["provider"]);
    expect(await resolveHomeForCurrentUser()).toBe("/provider-dashboard");
  });
  it("admin → /admin", async () => {
    stubRoles(["admin"]);
    expect(await resolveHomeForCurrentUser()).toBe("/admin");
  });
  it("employee → /employee", async () => {
    stubRoles(["employee"]);
    expect(await resolveHomeForCurrentUser()).toBe("/employee");
  });
  it("admin+customer → /admin (admin precedence)", async () => {
    stubRoles(["customer", "admin"]);
    expect(await resolveHomeForCurrentUser()).toBe("/admin");
  });
  it("no user → /login", async () => {
    authGetUser.mockResolvedValueOnce({ data: { user: null } });
    expect(await resolveHomeForCurrentUser()).toBe("/login");
  });
});
