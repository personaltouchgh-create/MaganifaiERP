import { randomUUID } from "node:crypto";
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { can } from "@repo/security";
import type { AuthContext } from "./auth.context";

type HeaderValue = string | string[] | undefined;

export interface AuthRequest {
  headers: Record<string, HeaderValue>;
  auth?: AuthContext;
}

function getHeader(req: AuthRequest, key: string) {
  const v = req.headers[key];
  if (Array.isArray(v)) return v[0];
  if (typeof v === "string") return v;
  return undefined;
}

export function getAuthContextFromRequest(req: AuthRequest): AuthContext {
  const tenantId = getHeader(req, "x-tenant-id");
  const branchId = getHeader(req, "x-branch-id") ?? null;
  const userId = getHeader(req, "x-user-id");
  const requestId = getHeader(req, "x-request-id") ?? randomUUID();

  if (!tenantId || !userId) {
    throw new ForbiddenException("Missing auth headers");
  }

  const rolePermissions = (getHeader(req, "x-role-permissions") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    tenantId,
    branchId,
    userId,
    rolePermissions,
    userGrants: [],
    requestId
  };
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly permission: string) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const auth = getAuthContextFromRequest(req);
    const ok = can({
      requested: this.permission,
      branchId: auth.branchId,
      rolePermissions: auth.rolePermissions,
      userGrants: auth.userGrants
    });

    if (!ok) throw new ForbiddenException("Forbidden");
    req.auth = auth;
    return true;
  }
}
