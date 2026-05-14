import { describe, expect, it } from "vitest";
import { can } from "@repo/security";

describe("rbac", () => {
  it("allows role permission unless explicitly denied for branch", () => {
    const ok = can({
      requested: "SETTINGS.PAYMENTS.EDIT",
      branchId: "b1",
      rolePermissions: ["SETTINGS.PAYMENTS.EDIT"],
      userGrants: [
        { permissionKey: "SETTINGS.PAYMENTS.EDIT", effect: "DENY", branchId: "b2" }
      ]
    });
    expect(ok).toBe(true);
  });
});
