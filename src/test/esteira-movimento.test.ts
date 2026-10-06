import { describe, expect, it } from "vitest";
import { podeMoverNaEsteira, podeSairDaTriagem } from "@/lib/esteira-movimento";

describe("podeSairDaTriagem", () => {
  it("exige realizada e documento", () => {
    expect(podeSairDaTriagem({}).ok).toBe(false);
    expect(podeSairDaTriagem({ triagem_realizada: true }).ok).toBe(false);
    expect(podeSairDaTriagem({ triagem_documento_path: "a/b.pdf" }).ok).toBe(false);
    expect(
      podeSairDaTriagem({ triagem_realizada: true, triagem_documento_path: "a/b.pdf" }).ok,
    ).toBe(true);
  });
});

describe("podeMoverNaEsteira", () => {
  const triagemOk = { triagem_realizada: true, triagem_documento_path: "x/triagem/doc.pdf" };

  it("bloqueia sair da Triagem no kanban sem conclusão", () => {
    const r = podeMoverNaEsteira({
      de: "triagem",
      para: "devolucao_comercial",
      origem: "kanban",
      cliente: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/Triagem realizada/);
  });

  it("libera Triagem → Devolução Comercial quando a triagem está concluída", () => {
    expect(
      podeMoverNaEsteira({
        de: "triagem",
        para: "devolucao_comercial",
        origem: "kanban",
        cliente: triagemOk,
      }).ok,
    ).toBe(true);
  });

  it("ninguém arrasta Devolução Comercial → Contrato Emitido no kanban", () => {
    const r = podeMoverNaEsteira({
      de: "devolucao_comercial",
      para: "contrato_emitido",
      origem: "kanban",
      role: "admin",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/funil comercial/);
  });

  it("admin/pmo forçam na ficha; gestor tributário não", () => {
    expect(
      podeMoverNaEsteira({
        de: "devolucao_comercial",
        para: "contrato_emitido",
        origem: "ficha",
        role: "admin",
      }).ok,
    ).toBe(true);
    expect(
      podeMoverNaEsteira({
        de: "devolucao_comercial",
        para: "contrato_emitido",
        origem: "ficha",
        role: "gestor_tributario",
      }).ok,
    ).toBe(false);
  });

  it("o funil comercial avança para Contrato Emitido", () => {
    expect(
      podeMoverNaEsteira({
        de: "devolucao_comercial",
        para: "contrato_emitido",
        origem: "funil",
        role: "comercial",
      }).ok,
    ).toBe(true);
  });
});
