import { describe, it, expect } from "vitest";
import { resolveBranchScope, ForbiddenError, type AuthContext } from "./rbac";

function makeCtx(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: "u1",
    organizationId: "org1",
    fullName: "Test User",
    permissions: new Set(),
    roleNames: [],
    branchIds: [],
    isOrgWide: false,
    ...overrides
  };
}

describe("resolveBranchScope", () => {
  it("org-wide roles with no branchId filter see all branches (undefined = no filter)", () => {
    const ctx = makeCtx({ isOrgWide: true });
    expect(resolveBranchScope(ctx, undefined)).toBeUndefined();
  });

  it("org-wide roles can still narrow to one branch explicitly", () => {
    const ctx = makeCtx({ isOrgWide: true });
    expect(resolveBranchScope(ctx, "branch-9")).toEqual(["branch-9"]);
  });

  it("scoped users with no branchId filter default to their assigned branches", () => {
    const ctx = makeCtx({ isOrgWide: false, branchIds: ["b1", "b2"] });
    expect(resolveBranchScope(ctx, undefined)).toEqual(["b1", "b2"]);
  });

  it("scoped users requesting an assigned branch get that single branch", () => {
    const ctx = makeCtx({ isOrgWide: false, branchIds: ["b1", "b2"] });
    expect(resolveBranchScope(ctx, "b1")).toEqual(["b1"]);
  });

  it("scoped users requesting a branch outside their scope are forbidden (Rule 11)", () => {
    const ctx = makeCtx({ isOrgWide: false, branchIds: ["b1", "b2"] });
    expect(() => resolveBranchScope(ctx, "b-not-mine")).toThrow(ForbiddenError);
  });
});
