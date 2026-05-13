export type PermissionKey = string;

export interface PermissionGrant {
  permissionKey: PermissionKey;
  effect: "ALLOW" | "DENY";
  branchId: string | null;
}

export function can(args: {
  requested: PermissionKey;
  branchId: string | null;
  rolePermissions: PermissionKey[];
  userGrants: PermissionGrant[];
}) {
  const roleAllows = new Set(args.rolePermissions);
  let allowed = roleAllows.has(args.requested);

  const branchMatches = (grantBranchId: string | null) =>
    grantBranchId === null || grantBranchId === args.branchId;

  for (const g of args.userGrants) {
    if (g.permissionKey !== args.requested) continue;
    if (!branchMatches(g.branchId)) continue;
    if (g.effect === "DENY") allowed = false;
    if (g.effect === "ALLOW") allowed = true;
  }

  return allowed;
}