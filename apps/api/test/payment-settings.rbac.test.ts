import { describe, expect, it } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { HttpArgumentsHost } from "@nestjs/common/interfaces";
import { PermissionGuard } from "../src/auth/auth.guard";
import type { AuthRequest } from "../src/auth/auth.guard";

function ctx(headers: Record<string, string>): ExecutionContext {
  const req: AuthRequest = { headers };
  const http = {
    getRequest: () => req,
    getResponse: () => ({}),
    getNext: () => undefined
  } satisfies { getRequest: () => AuthRequest; getResponse: () => unknown; getNext: () => unknown };
  const httpHost = http as unknown as HttpArgumentsHost;

  return {
    switchToHttp: () => httpHost
  } as unknown as ExecutionContext;
}

describe("payment settings RBAC", () => {
  it("returns 403 when missing SETTINGS.PAYMENTS.VIEW", () => {
    const guard = new PermissionGuard("SETTINGS.PAYMENTS.VIEW");

    expect(() =>
      guard.canActivate(
        ctx({
          "x-tenant-id": "t1",
          "x-user-id": "u1",
          "x-role-permissions": ""
        })
      )
    ).toThrow(ForbiddenException);
  });
});
