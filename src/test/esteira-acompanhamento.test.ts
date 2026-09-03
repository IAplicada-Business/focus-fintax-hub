import { describe, it, expect } from "vitest";
import {
  agruparPorResponsavel,
  corAvatar,
  iniciais,
  ordenarPorSla,
  pertenceAFaixa,
  pertenceAoRamo,
  proximaAcao,
  proximaEtapa,
  ramosDoCliente,
  resumoCobrancaTexto,
  slaInfo,
} from "@/lib/esteira-acompanhamento";

const CONFIG = [
  { estagio: "nova_abordagem", label: "Nova abordagem", ordem: 1, ativo: true },
  { estagio: "triagem", label: "Triagem", ordem: 2, ativo: true },
  { estagio: "levantamento", label: "Levantamento", ordem: 3, ativo: false },
  { estagio: "emitir_contrato", label: "Emitir Contrato", ordem: 4, ativo: true },
  { estagio: "receber_assinado", label: "Receber Assinado", ordem: 5, ativo: true },
  { estagio: "em_compensacao", label: "Em Compensação", ordem: 6, ativo: true },
  { estagio: "encaminhar_financeiro", label: "Encaminhar Financeiro", ordem: 7, ativo: true },
  { estagio: "concluido", label: "Concluído", ordem: 8, ativo: true },
  { estagio: "devolutiva_cliente", label: "Devolutiva ao cliente", ordem: 9, ativo: true },
];

const hoje = new Date();
const diasAtras = (n: number) => new Date(hoje.getTime() - n * 86_400_000).toISOString();

describe("ramos", () => {
  it("cliente sem processo cai em Compensação e nunca some das esteiras", () => {
    expect(ramosDoCliente({})).toEqual(["compensacao"]);
    expect(pertenceAoRamo({}, "compensacao")).toBe(true);
    expect(pertenceAoRamo({}, "recuperacao_judicial")).toBe(false);
  });

  it("cliente com mais de um ramo aparece nas duas esteiras", () => {
    const c = { tem_ramo_compensacao: true, tem_ramo_judicial: true };
    expect(ramosDoCliente(c)).toEqual(["compensacao", "recuperacao_judicial"]);
    expect(pertenceAoRamo(c, "recuperacao_judicial")).toBe(true);
    expect(pertenceAoRamo(c, "ressarcimento")).toBe(false);
    expect(pertenceAoRamo(c, "todas")).toBe(true);
  });
});

describe("slaInfo (semáforo)", () => {
  it("estourado quando passou do prazo", () => {
    const s = slaInfo({ estagio_esteira: "triagem", dias_na_etapa: 5, sla_dias: 1 });
    expect(s.status).toBe("estourado");
    expect(s.restante).toBe(-4);
  });

  it("atenção quando vence hoje ou dentro da margem de 20%", () => {
    expect(slaInfo({ estagio_esteira: "em_compensacao", dias_na_etapa: 30, sla_dias: 30 }).status).toBe("atencao"); // vence hoje
    expect(slaInfo({ estagio_esteira: "em_compensacao", dias_na_etapa: 25, sla_dias: 30 }).status).toBe("atencao"); // faltam 5 (≤ 6)
    expect(slaInfo({ estagio_esteira: "em_compensacao", dias_na_etapa: 20, sla_dias: 30 }).status).toBe("no_prazo"); // faltam 10
  });

  it("SLA de 1 dia: dia 0 no prazo, dia 1 atenção, dia 2 estourado", () => {
    expect(slaInfo({ estagio_esteira: "triagem", dias_na_etapa: 0, sla_dias: 1 }).status).toBe("no_prazo");
    expect(slaInfo({ estagio_esteira: "triagem", dias_na_etapa: 1, sla_dias: 1 }).status).toBe("atencao");
    expect(slaInfo({ estagio_esteira: "triagem", dias_na_etapa: 2, sla_dias: 1 }).status).toBe("estourado");
  });

  it("sem meta para etapas terminais", () => {
    expect(slaInfo({ estagio_esteira: "concluido", dias_na_etapa: 99, sla_dias: null }).status).toBe("sem_sla");
    expect(slaInfo({ estagio_esteira: "devolutiva_cliente", dias_na_etapa: 99 }).status).toBe("sem_sla");
  });

  it("calcula o vencimento a partir da entrada", () => {
    const s = slaInfo({ estagio_esteira: "levantamento", dias_na_etapa: 1, sla_dias: 3, data_entrada_estagio: diasAtras(1) });
    expect(s.vencimento).not.toBeNull();
    const diff = Math.round((s.vencimento!.getTime() - hoje.getTime()) / 86_400_000);
    expect(diff).toBe(2);
  });
});

describe("proximaEtapa / proximaAcao", () => {
  it("pula etapa inativa e a devolutiva", () => {
    expect(proximaEtapa("triagem", CONFIG)?.estagio).toBe("emitir_contrato");
    expect(proximaEtapa("encaminhar_financeiro", CONFIG)?.estagio).toBe("concluido");
  });

  it("etapa terminal não tem próxima", () => {
    expect(proximaEtapa("concluido", CONFIG)).toBeNull();
    expect(proximaEtapa("devolutiva_cliente", CONFIG)).toBeNull();
    expect(proximaAcao({ estagio_esteira: "concluido", dias_na_etapa: 3, sla_dias: null }, CONFIG)).toMatch(/final/);
  });

  it("texto muda conforme o semáforo", () => {
    expect(proximaAcao({ estagio_esteira: "triagem", dias_na_etapa: 6, sla_dias: 1 }, CONFIG)).toBe("Mover para Emitir Contrato — venceu há 5d");
    expect(proximaAcao({ estagio_esteira: "triagem", dias_na_etapa: 1, sla_dias: 1, data_entrada_estagio: diasAtras(1) }, CONFIG)).toBe("Mover para Emitir Contrato — vence hoje");
    expect(proximaAcao({ estagio_esteira: "em_compensacao", dias_na_etapa: 2, sla_dias: 30, data_entrada_estagio: diasAtras(2) }, CONFIG)).toMatch(/^Mover para Encaminhar Financeiro até \d{2}\/\d{2}$/);
  });
});

describe("ordenarPorSla / faixas", () => {
  const lista = [
    { id: "a", estagio_esteira: "concluido", dias_na_etapa: 50, sla_dias: null },
    { id: "b", estagio_esteira: "triagem", dias_na_etapa: 10, sla_dias: 1 }, // -9
    { id: "c", estagio_esteira: "em_compensacao", dias_na_etapa: 5, sla_dias: 30 }, // +25
    { id: "d", estagio_esteira: "triagem", dias_na_etapa: 3, sla_dias: 1 }, // -2
  ];

  it("mais estourado primeiro, sem meta por último", () => {
    expect(ordenarPorSla(lista).map((c) => c.id)).toEqual(["b", "d", "c", "a"]);
  });

  it("filtra por faixa", () => {
    expect(lista.filter((c) => pertenceAFaixa(c, "estourado")).map((c) => c.id)).toEqual(["b", "d"]);
    expect(lista.filter((c) => pertenceAFaixa(c, "no_prazo")).map((c) => c.id)).toEqual(["c"]);
  });
});

describe("agruparPorResponsavel (painel de cobrança)", () => {
  const clientes = [
    { id: "1", empresa: "Alpha", estagio_esteira: "triagem", dias_na_etapa: 4, sla_dias: 1, responsavel_id: "u1", responsavel_nome: "Aline Barbosa" },
    { id: "2", empresa: "Beta", estagio_esteira: "em_compensacao", dias_na_etapa: 30, sla_dias: 30, responsavel_id: "u1", responsavel_nome: "Aline Barbosa" },
    { id: "3", empresa: "Gama", estagio_esteira: "em_compensacao", dias_na_etapa: 29, sla_dias: 30, responsavel_id: "u2", responsavel_nome: "Joao Matias" },
    { id: "4", empresa: "Delta", estagio_esteira: "em_compensacao", dias_na_etapa: 5, sla_dias: 30, responsavel_id: "u2", responsavel_nome: "Joao Matias" }, // fora
    { id: "5", empresa: "Ômega", estagio_esteira: "triagem", dias_na_etapa: 9, sla_dias: 1, responsavel_id: null, responsavel_nome: null },
  ];

  it("só entra quem estourou, vence hoje ou amanhã; sem responsável vem primeiro", () => {
    const grupos = agruparPorResponsavel(clientes, CONFIG);
    expect(grupos.map((g) => g.nome)).toEqual(["Sem responsável", "Aline Barbosa", "Joao Matias"]);
    const aline = grupos[1];
    expect(aline.itens.map((i) => i.cliente.id)).toEqual(["1", "2"]); // estourado antes de hoje
    expect(aline.estourados).toBe(1);
    expect(aline.hoje).toBe(1);
    const joao = grupos[2];
    expect(joao.itens.map((i) => i.urgencia)).toEqual(["amanha"]);
  });

  it("gera texto puro com bullets pra WhatsApp", () => {
    const grupos = agruparPorResponsavel(clientes, CONFIG);
    const txt = resumoCobrancaTexto(grupos[1], (e) => CONFIG.find((x) => x.estagio === e)?.label ?? e);
    expect(txt).toContain("Aline Barbosa");
    expect(txt).toContain("• Alpha — Triagem (venceu há 3d)");
    expect(txt).toContain("• Beta — Em Compensação (vence hoje)");
    expect(txt).not.toMatch(/[*_~]/);
  });
});

describe("iniciais / corAvatar", () => {
  it("usa primeira e última inicial", () => {
    expect(iniciais("Aline Barbosa")).toBe("AB");
    expect(iniciais("Paulo Marcos Silva")).toBe("PS");
    expect(iniciais("Alcir")).toBe("AL");
    expect(iniciais("")).toBe("?");
    expect(iniciais(null)).toBe("?");
  });

  it("mesmo nome, mesma cor", () => {
    expect(corAvatar("Aline Barbosa")).toBe(corAvatar("Aline Barbosa"));
    expect(corAvatar("Aline Barbosa")).toMatch(/^bg-/);
  });
});
