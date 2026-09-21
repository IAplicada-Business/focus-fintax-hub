import { describe, it, expect } from "vitest";
import {
  clientesConvertidosNoFunil,
  inicioSemana,
  leadsPorOrigem,
  pipelinePonderado,
  projetarLinear,
  projetarSerieSemanal,
  resumoAtendimento,
  ritmoSemanal,
  serieSemanalLeads,
  taxasConversaoFunil,
  tempoMedioAteEtapa,
  leadsParados,
} from "@/lib/comercial-analytics";

// Quarta-feira 16/09/2026 12:00 local
const AGORA = new Date(2026, 8, 16, 12, 0, 0).getTime();
const diasAtras = (n: number) => new Date(AGORA - n * 86_400_000).toISOString();

describe("inicioSemana", () => {
  it("volta para a segunda-feira da semana, inclusive no domingo", () => {
    expect(inicioSemana(new Date(2026, 8, 16)).getDate()).toBe(14);
    expect(inicioSemana(new Date(2026, 8, 20)).getDate()).toBe(14); // domingo
    expect(inicioSemana(new Date(2026, 8, 14)).getDate()).toBe(14);
  });
});

describe("serieSemanalLeads", () => {
  it("agrupa novos por semana e conta a primeira entrada em contrato/cliente", () => {
    const leads = [
      { id: "a", criado_em: diasAtras(1) },
      { id: "b", criado_em: diasAtras(2) },
      { id: "c", criado_em: diasAtras(9) },
      { id: "d", criado_em: diasAtras(400) }, // fora da janela
    ];
    const hist = [
      { lead_id: "a", para_etapa: "contrato_emitido", criado_em: diasAtras(1) },
      { lead_id: "a", para_etapa: "qualificado", criado_em: diasAtras(1) },
      { lead_id: "a", para_etapa: "contrato_emitido", criado_em: diasAtras(0) }, // repetido, não duplica
      { lead_id: "c", para_etapa: "ganho", criado_em: diasAtras(8) },
    ];
    const s = serieSemanalLeads(leads, hist, 4, AGORA);
    expect(s).toHaveLength(4);
    expect(s[3]).toMatchObject({ novos: 2, contratos: 1, clientes: 0, label: "14/09" });
    expect(s[2]).toMatchObject({ novos: 1, contratos: 0, clientes: 1, label: "07/09" });
    expect(s[0].novos + s[1].novos).toBe(0);
  });
});

describe("projetarLinear", () => {
  it("segue a tendência e não fica negativo", () => {
    expect(projetarLinear([1, 2, 3, 4], 2)).toEqual([5, 6]);
    expect(projetarLinear([10, 5, 0], 3)).toEqual([0, 0, 0]);
    expect(projetarLinear([7], 2)).toEqual([7, 7]);
    expect(projetarLinear([], 2)).toEqual([0, 0]);
  });
});

describe("projetarSerieSemanal / ritmoSemanal", () => {
  const serie = serieSemanalLeads(
    [
      { id: "1", criado_em: diasAtras(22) },
      { id: "2", criado_em: diasAtras(15) },
      { id: "3", criado_em: diasAtras(14) },
      { id: "4", criado_em: diasAtras(8) },
      { id: "5", criado_em: diasAtras(7) },
      { id: "6", criado_em: diasAtras(7) },
    ],
    [],
    4,
    AGORA,
  );
  it("projeta semanas seguintes marcadas como projeção", () => {
    const proj = projetarSerieSemanal(serie, 2);
    expect(proj).toHaveLength(2);
    expect(proj.every((p) => p.projecao)).toBe(true);
    expect(proj[0].label).toBe("21/09");
    expect(proj[0].novos).toBeGreaterThanOrEqual(3);
  });
  it("ritmo ignora a semana corrente", () => {
    expect(ritmoSemanal(serie, "novos", 3)).toBe(2);
  });
});

describe("pipelinePonderado", () => {
  it("pondera pelo estágio e ignora perdidos e ganhos", () => {
    const r = pipelinePonderado([
      { id: "1", status_funil: "novo", potencial: 100 },
      { id: "2", status_funil: "levantamento_teses", potencial: 100 },
      { id: "3", status_funil: "contrato_emitido", potencial: 200 },
      { id: "4", status_funil: "perdido", potencial: 999 },
      { id: "5", status_funil: "ganho", potencial: 999 },
    ]);
    expect(r.potencial).toBe(400);
    expect(r.total).toBeCloseTo(10 + 65 + 170);
    expect(r.porEtapa[0].etapa).toBe("contrato_emitido");
  });
});

describe("clientesConvertidosNoFunil", () => {
  it("conta leads ganhos, não a carteira global de clientes", () => {
    expect(clientesConvertidosNoFunil([
      { status_funil: "ganho" },
      { status_funil: "ganho" },
      { status_funil: "novo" },
      { status_funil: "perdido" },
    ])).toBe(2);
  });
});

describe("taxasConversaoFunil", () => {
  it("usa o acumulado 'daqui pra frente'", () => {
    const r = taxasConversaoFunil([{ count: 10 }, { count: 5 }, { count: 5 }]);
    expect(r.map((x) => x.acumulado)).toEqual([20, 10, 5]);
    expect(r.map((x) => x.taxaProxima)).toEqual([50, 50, null]);
  });
});

describe("leadsPorOrigem", () => {
  it("rotula, soma potencial e conta convertidos", () => {
    const r = leadsPorOrigem([
      { id: "1", origem: "meta_ads", potencial: 10, status_funil: "novo" },
      { id: "2", origem: "meta_ads", potencial: 20, status_funil: "ganho" },
      { id: "3", origem: "", potencial: 5 },
    ]);
    expect(r[0]).toMatchObject({ origem: "meta_ads", label: "Meta Ads", leads: 2, potencial: 30, convertidos: 1 });
    expect(r[1]).toMatchObject({ origem: "nao_informado", label: "Não informada", leads: 1 });
  });
});

describe("resumoAtendimento", () => {
  it("separa robô/humano e acha quem espera resposta", () => {
    const r = resumoAtendimento(
      [
        { telefone: "1", bot_ativo: true, ultima_em: new Date(AGORA - 3_600_000).toISOString(), ultima_direcao: "entrada" },
        { telefone: "2", bot_ativo: false, ultima_em: new Date(AGORA - 10 * 3_600_000).toISOString(), ultima_direcao: "entrada" },
        { telefone: "3", bot_ativo: false, ultima_em: new Date(AGORA - 30 * 3_600_000).toISOString(), ultima_direcao: "saida" },
        { telefone: "4", bot_ativo: false, ultima_em: null, ultima_direcao: null },
      ],
      AGORA,
      4,
    );
    expect(r).toMatchObject({ total: 4, comRobo: 1, humanas: 3, aguardandoResposta: 1, ativas24h: 2 });
    expect(r.filaResposta[0]).toMatchObject({ telefone: "2", horas: 10 });
  });
});

describe("tempoMedioAteEtapa / leadsParados", () => {
  it("mede dias da criação até a primeira entrada na etapa", () => {
    const leads = [
      { id: "a", criado_em: diasAtras(20) },
      { id: "b", criado_em: diasAtras(10) },
    ];
    const hist = [
      { lead_id: "a", para_etapa: "contrato_emitido", criado_em: diasAtras(10) },
      { lead_id: "a", para_etapa: "contrato_emitido", criado_em: diasAtras(2) },
      { lead_id: "b", para_etapa: "contrato_emitido", criado_em: diasAtras(5) },
    ];
    expect(tempoMedioAteEtapa(leads, hist)).toBe(7.5);
    expect(tempoMedioAteEtapa(leads, [])).toBeNull();
  });
  it("lista parados na etapa acima do limite, do mais antigo pro mais novo", () => {
    const r = leadsParados(
      [
        { id: "a", status_funil: "contrato_emitido", status_funil_atualizado_em: diasAtras(9) },
        { id: "b", status_funil: "contrato_emitido", status_funil_atualizado_em: diasAtras(1) },
        { id: "c", status_funil: "novo", status_funil_atualizado_em: diasAtras(30) },
      ],
      "contrato_emitido",
      3,
      AGORA,
    );
    expect(r.map((x) => x.lead.id)).toEqual(["a"]);
    expect(r[0].dias).toBe(9);
  });
});
