export interface AuthGrant {
  permissionKey: string;
  effect: "ALLOW" | "DENY";
  branchId: string | null;
}

export interface AuthContext {
  tenantId: string;
  branchId: string | null;
  userId: string;
  rolePermissions: string[];
  userGrants: AuthGrant[];
  requestId: string;
}
