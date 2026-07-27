import { describe, it, expect } from "vitest";
import {
  resolveMobileNavRole,
  getMobileNavTabKeys,
} from "./MobileBottomNav";

describe("MobileBottomNav — role → tabs mapping", () => {
  it("guest gets home/search/login/menu", () => {
    const role = resolveMobileNavRole({ user: null, isProvider: false });
    expect(role).toBe("guest");
    expect(getMobileNavTabKeys(role)).toEqual(["home", "search", "login", "menu"]);
  });

  it("customer gets home/search/bookings/profile", () => {
    const role = resolveMobileNavRole({ user: { id: "u1" }, isProvider: false });
    expect(role).toBe("customer");
    expect(getMobileNavTabKeys(role)).toEqual(["home", "search", "bookings", "profile"]);
  });

  it("provider gets home/dashboard/messages/profile", () => {
    const role = resolveMobileNavRole({ user: { id: "u2" }, isProvider: true });
    expect(role).toBe("provider");
    expect(getMobileNavTabKeys(role)).toEqual(["home", "dashboard", "messages", "profile"]);
  });
});
