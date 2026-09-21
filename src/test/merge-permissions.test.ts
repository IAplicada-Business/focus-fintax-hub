import { describe, expect, it } from "vitest";
import { SCREENS, getDefaultPermissions, mergePermissions, type ScreenPermission } from "@/lib/screen-permissions";

const TOTAL_TELAS = SCREENS.reduce((n, s) => n + 1 + (s.children?.length ?? 0), 0);

describe("mergePermissions", () => {
  it("devolve uma linha por tela mesmo com o banco incompleto", () => {
    // Caso real: usuário cadastrado antes de Marketing/Esteira existirem.
    const antigo: ScreenPermission[] = [
      { screen_key: "dashboard", can_access: true, read_only: false },
      { screen_key: "pipeline", can_access: true, read_only: false },
    ];
    const merged = mergePermissions("comercial", antigo);

    expect(merged).toHaveLength(TOTAL_TELAS);
    expect(merged.map((p) => p.screen_key)).toEqual(getDefaultPermissions("comercial").map((p) => p.screen_key));
    // As telas que faltavam entram (vindas do padrão do papel), não somem.
    expect(merged.some((p) => p.screen_key === "marketing")).toBe(true);
    expect(merged.some((p) => p.screen_key === "esteira")).toBe(true);
    expect(merged.some((p) => p.screen_key === "atendimento")).toBe(true);
  });

  it("o que está gravado manda sobre o padrão do papel", () => {
    const gravado: ScreenPermission[] = [
      { screen_key: "esteira", can_access: true, read_only: true },
      { screen_key: "pipeline", can_access: false, read_only: false },
    ];
    const merged = mergePermissions("comercial", gravado);

    const esteira = merged.find((p) => p.screen_key === "esteira")!;
    expect(esteira).toEqual({ screen_key: "esteira", can_access: true, read_only: true });

    const pipeline = merged.find((p) => p.screen_key === "pipeline")!;
    expect(pipeline.can_access).toBe(false);
  });

  it("sem nada gravado, fica igual ao padrão do papel", () => {
    expect(mergePermissions("pmo", [])).toEqual(getDefaultPermissions("pmo"));
  });

  it("papel nulo cai em cliente", () => {
    expect(mergePermissions(null, [])).toEqual(getDefaultPermissions("cliente"));
  });

  it("ignora chaves gravadas que não existem mais", () => {
    const merged = mergePermissions("admin", [
      { screen_key: "tela_que_nao_existe", can_access: true, read_only: false },
    ]);
    expect(merged).toHaveLength(TOTAL_TELAS);
    expect(merged.some((p) => p.screen_key === "tela_que_nao_existe")).toBe(false);
  });
});
