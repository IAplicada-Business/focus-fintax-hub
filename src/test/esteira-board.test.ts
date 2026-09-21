import { describe, expect, it } from "vitest";
import {
  agruparEsteiraPorEtapa,
  ordenarCardsEsteira,
  parseDashEsteiraView,
  resumoEtapaEsteira,
  slaDoClienteEsteira,
  type EsteiraCardLike,
} from "@/lib/esteira-board";

const STAGES = [
  { value: "triagem", label: "Triagem" },
  { value: "levantamento", label: "Levantamento" },
  { value: "em_compensacao", label: "Em Compensação" },
];

const cli = (over: Partial<EsteiraCardLike> & { id: string }): EsteiraCardLike => ({
  estagio_esteira: "triagem",
  dias_na_etapa: 0,
  responsavel_nome: "Ana",
  ...over,
});

describe("agruparEsteiraPorEtapa", () => {
  it("agrupa na ordem das colunas e joga etapa desconhecida em triagem", () => {
    const g = agruparEsteiraPorEtapa(
      [cli({ id: "a", estagio_esteira: "levantamento" }), cli({ id: "b", estagio_esteira: "inexistente" }), cli({ id: "c", estagio_esteira: "" })],
      STAGES,
    );
    expect(Object.keys(g)).toEqual(["triagem", "levantamento", "em_compensacao"]);
    expect(g.levantamento.map((c) => c.id)).toEqual(["a"]);
    expect(g.triagem.map((c) => c.id)).toEqual(["b", "c"]);
    expect(g.em_compensacao).toEqual([]);
  });
});

describe("slaDoClienteEsteira", () => {
  it("usa o SLA da etapa quando o cliente não traz o seu", () => {
    const info = slaDoClienteEsteira(cli({ id: "a", dias_na_etapa: 5 }), 3);
    expect(info.status).toBe("estourado");
    expect(info.sla).toBe(3);
    expect(info.restante).toBe(-2);
  });

  it("respeita o atrasado=true vindo da view mesmo sem SLA", () => {
    const info = slaDoClienteEsteira(cli({ id: "a", dias_na_etapa: 1, atrasado: true }), null);
    expect(info.status).toBe("estourado");
  });

  it("config null manda sobre o default da etapa: fica sem meta", () => {
    expect(slaDoClienteEsteira(cli({ id: "a", dias_na_etapa: 40 }), null).status).toBe("sem_sla");
  });

  it("sem config (undefined) cai no default da etapa", () => {
    // triagem tem default de 1 dia
    expect(slaDoClienteEsteira(cli({ id: "a", dias_na_etapa: 3 }), undefined).status).toBe("estourado");
  });
});

describe("resumoEtapaEsteira", () => {
  it("conta atrasados, vencendo e sem responsável", () => {
    const r = resumoEtapaEsteira(
      [
        cli({ id: "a", dias_na_etapa: 10 }), // estourado (sla 5)
        cli({ id: "b", dias_na_etapa: 4, responsavel_nome: null }), // atenção (resta 1)
        cli({ id: "c", dias_na_etapa: 1, responsavel_nome: "" }),
      ],
      5,
    );
    expect(r).toEqual({ total: 3, atrasados: 1, vencendo: 1, semResponsavel: 2 });
  });
});

describe("ordenarCardsEsteira", () => {
  it("atrasados primeiro, depois mais dias na etapa", () => {
    const ordem = ordenarCardsEsteira(
      [
        cli({ id: "ok-novo", dias_na_etapa: 1 }),
        cli({ id: "atrasado", dias_na_etapa: 9 }),
        cli({ id: "ok-velho", dias_na_etapa: 2 }),
        cli({ id: "atencao", dias_na_etapa: 4 }),
      ],
      5,
    ).map((c) => c.id);
    expect(ordem).toEqual(["atrasado", "atencao", "ok-velho", "ok-novo"]);
  });
});

describe("parseDashEsteiraView", () => {
  it("abre no resumo compacto e preserva Kanban quando escolhido", () => {
    expect(parseDashEsteiraView("kanban")).toBe("kanban");
    expect(parseDashEsteiraView("etapas")).toBe("etapas");
    expect(parseDashEsteiraView(null)).toBe("etapas");
    expect(parseDashEsteiraView("x")).toBe("etapas");
  });
});
