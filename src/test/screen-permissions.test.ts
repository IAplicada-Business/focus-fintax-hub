import { describe, it, expect } from "vitest";
import { getDefaultPermissions, routeToScreenKey, SCREENS } from "@/lib/screen-permissions";

describe("getDefaultPermissions", () => {
  it("returns permissions for all screens and children for admin", () => {
    const perms = getDefaultPermissions("admin");
    const totalExpected = SCREENS.reduce(
      (sum, s) => sum + 1 + (s.children?.length ?? 0),
      0
    );
    expect(perms).toHaveLength(totalExpected);
  });

  it("gives admin access to all screens", () => {
    const perms = getDefaultPermissions("admin");
    const denied = perms.filter((p) => !p.can_access);
    expect(denied).toHaveLength(0);
  });

  it("restricts benchmarks to admin only by default", () => {
    const comercialPerms = getDefaultPermissions("comercial");
    const bench = comercialPerms.find((p) => p.screen_key === "benchmarks");
    expect(bench?.can_access).toBe(false);
  });

  it("gives comercial access to pipeline", () => {
    const perms = getDefaultPermissions("comercial");
    const pipeline = perms.find((p) => p.screen_key === "pipeline");
    expect(pipeline?.can_access).toBe(true);
  });

  it("marks gestor_tributario as read-only for pipeline", () => {
    const perms = getDefaultPermissions("gestor_tributario");
    const pipeline = perms.find((p) => p.screen_key === "pipeline");
    expect(pipeline?.can_access).toBe(true);
    expect(pipeline?.read_only).toBe(true);
  });

  it("defaults unknown role to cliente with minimal access", () => {
    const perms = getDefaultPermissions("unknown_role");
    const hasAccess = perms.filter((p) => p.can_access);
    expect(hasAccess.length).toBeLessThan(perms.length);
  });
});

describe("routeToScreenKey", () => {
  it("maps /dashboard to dashboard", () => {
    expect(routeToScreenKey("/dashboard")).toBe("dashboard");
  });

  it("maps /pipeline to pipeline", () => {
    expect(routeToScreenKey("/pipeline")).toBe("pipeline");
  });

  it("maps /clientes/:id to clientes", () => {
    expect(routeToScreenKey("/clientes/abc-123")).toBe("clientes");
  });

  it("maps /configuracoes/motor to motor_calculo", () => {
    expect(routeToScreenKey("/configuracoes/motor")).toBe("motor_calculo");
  });

  it("returns null for unknown routes", () => {
    expect(routeToScreenKey("/unknown")).toBeNull();
    expect(routeToScreenKey("/")).toBeNull();
  });
});
