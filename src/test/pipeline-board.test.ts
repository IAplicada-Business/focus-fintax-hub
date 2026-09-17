import { describe, it, expect } from "vitest";
import {
  agruparPorEtapa,
  conversaDoLead,
  estadoConversa,
  etapasVazias,
  filtrarLeadsBusca,
  indexarConversas,
  lerColapsadas,
  resumoColuna,
  salvarColapsadas,
  slaDoLead,
} from "@/lib/pipeline-board";

const AGORA = new Date("2026-09-16T12:00:00Z").getTime();
const diasAtras = (n: number) => new Date(AGORA - n * 86_400_000).toISOString();

describe("agruparPorEtapa", () => {
  it("unifica legado e manda desconhecido pra primeira coluna", () => {
    const g = agruparPorEtapa([
      { id: "1", status_funil: "levantamento_teses" },
      { id: "2", status_funil: "nao_vai_fazer" },
      { id: "3", status_funil: "xpto" },
      { id: "4", status_funil: "" },
    ]);
    expect(g.em_negociacao.map((l) => l.id)).toEqual(["1"]);
    expect(g.perdido.map((l) => l.id)).toEqual(["2"]);
    expect(g.novo.map((l) => l.id)).toEqual(["3", "4"]);
    expect(etapasVazias(g)).toContain("qualificado");
  });
});

describe("resumoColuna / slaDoLead", () => {
  it("soma potencial e conta atrasados e vencendo pela meta", () => {
    const leads = [
      { id: "a", status_funil: "novo", status_funil_atualizado_em: diasAtras(10), potencial: 100 },
      { id: "b", status_funil: "novo", status_funil_atualizado_em: diasAtras(2), potencial: 50 },
      { id: "c", status_funil: "novo", status_funil_atualizado_em: diasAtras(0), potencial: 0 },
    ];
    const r = resumoColuna(leads, 3, AGORA);
    expect(r).toMatchObject({ total: 3, potencial: 150, atrasados: 1 });
    expect(r.vencendo).toBeGreaterThanOrEqual(1);
    expect(slaDoLead(leads[0], 3, AGORA).status).toBe("estourado");
    expect(slaDoLead(leads[0], null, AGORA).status).toBe("sem_sla");
  });
});

describe("filtrarLeadsBusca", () => {
  const leads = [
    { id: "1", empresa: "Mercado Bom Preço", nome: "Ana", cnpj: "12.345.678/0001-99", whatsapp: "(21) 98894-6055" },
    { id: "2", empresa: "Farma Vida", nome: "Carlos", cnpj: "98.765.432/0001-11", whatsapp: "21999990000" },
  ];
  it("acha por empresa, contato, CNPJ e telefone", () => {
    expect(filtrarLeadsBusca(leads, "bom pre").map((l) => l.id)).toEqual(["1"]);
    expect(filtrarLeadsBusca(leads, "carlos").map((l) => l.id)).toEqual(["2"]);
    expect(filtrarLeadsBusca(leads, "345678").map((l) => l.id)).toEqual(["1"]);
    expect(filtrarLeadsBusca(leads, "98894").map((l) => l.id)).toEqual(["1"]);
    expect(filtrarLeadsBusca(leads, "  ")).toHaveLength(2);
  });
});

describe("colapso persistido", () => {
  it("lê e grava no storage, tolerando lixo", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string): void => {
        store.set(k, v);
      },
    };
    salvarColapsadas(new Set(["perdido", "novo"]), storage);
    expect([...lerColapsadas(storage)]).toEqual(["perdido", "novo"]);
    store.set("pipeline.colapsadas", "{nope");
    expect(lerColapsadas(storage).size).toBe(0);
    expect(lerColapsadas(null).size).toBe(0);
  });
});

describe("conversas do atendimento", () => {
  const conversas = [
    { telefone: "5521988946055", bot_ativo: true, ultima_em: "2026-09-16T10:00:00Z", ultima_direcao: "entrada" as const },
    { telefone: "21999990000", bot_ativo: false, ultima_em: "2026-09-16T09:00:00Z", ultima_direcao: "saida" as const },
  ];
  it("casa pelo sufixo de 11 dígitos e classifica o estado", () => {
    const idx = indexarConversas(conversas);
    const c1 = conversaDoLead("(21) 98894-6055", idx);
    expect(c1?.telefone).toBe("5521988946055");
    expect(estadoConversa(c1)).toBe("robo");
    const c2 = conversaDoLead("21 99999-0000", idx);
    expect(estadoConversa(c2)).toBe("aguardando_lead");
    expect(estadoConversa({ ...conversas[1], ultima_direcao: "entrada" })).toBe("aguardando_nos");
    expect(estadoConversa(conversaDoLead("11 1111-1111", idx))).toBe("sem_conversa");
    expect(conversaDoLead("", idx)).toBeNull();
  });
});
