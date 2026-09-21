import { describe, it, expect } from "vitest";
import {
  type EsteiraClienteLike,
  acoesPorTipo,
  acoesPorUsuario,
  cargaPorResponsavel,
  carteiraPorTese,
  comparativoMensal,
  filaPrioridade,
  geracaoTesesPorMes,
  movimentosEsteira,
  projetarMensal,
  resumoEsteira,
  serieMensal,
} from "@/lib/operacional-analytics";
import {
  STATUS_COMPENSACAO_VALUES,
  buildRamoFlagsPorCliente,
  filtrarIdsRecorteGerencial,
  normalizarStatusCompensacao,
} from "@/lib/gerencial-filters";

const AGORA = new Date(2026, 8, 16, 12).getTime(); // set/2026
const diasAtras = (n: number) => new Date(AGORA - n * 86_400_000).toISOString();

describe("serieMensal / projetarMensal / comparativoMensal", () => {
  const comps = [
    { cliente_id: "c1", mes_referencia: "2026-06-01", valor_compensado: 100, honorario_valor: 10 },
    { cliente_id: "c1", mes_referencia: "2026-07-01", valor_compensado: 200, valor_nf_servico: 20 },
    { cliente_id: "c2", mes_referencia: "2026-08-01", valor_compensado: 300, honorario_valor: 30 },
    { cliente_id: "c2", mes_referencia: "2026-09-01", valor_compensado: 50, honorario_valor: 5 },
    { cliente_id: "c2", mes_referencia: "2020-01-01", valor_compensado: 9999 },
  ];
  it("preenche meses vazios e rotula", () => {
    const s = serieMensal(comps, 6, AGORA);
    expect(s.map((p) => p.label)).toEqual(["Abr/26", "Mai/26", "Jun/26", "Jul/26", "Ago/26", "Set/26"]);
    expect(s.map((p) => p.compensado)).toEqual([0, 0, 100, 200, 300, 50]);
    expect(s[3].honorarios).toBe(20);
  });
  it("projeta meses seguintes a partir dos fechados", () => {
    const s = serieMensal(comps, 4, AGORA); // Jun, Jul, Ago, Set(parcial)
    const p = projetarMensal(s, 2, 6);
    expect(p.map((x) => x.label)).toEqual(["Out/26", "Nov/26"]);
    expect(p[0].compensado).toBe(400);
    expect(p[1].compensado).toBe(500);
    expect(p.every((x) => x.projecao)).toBe(true);
  });
  it("compara mês atual com anterior", () => {
    const s = serieMensal(comps, 4, AGORA);
    const c = comparativoMensal(s);
    expect(c).toMatchObject({ atual: 50, anterior: 300, variacaoPct: -83 });
    expect(c.mediaFechados).toBe(200);
  });
});

describe("carteiraPorTese", () => {
  const teses = [
    { id: "t1", codigo: "INSUMOS", label: "PIS/COFINS Insumos" },
    { id: "t2", codigo: "SUBVENCAO", label: "Subvenção" },
  ];
  it("junta crédito, compensação e processos por tese", () => {
    const rows = carteiraPorTese(
      teses,
      [
        { cliente_id: "a", tese_id: "t1", valor_apurado_inicial: 1000 },
        { cliente_id: "b", tese_id: "t1", valor_apurado_inicial: 1000 },
        { cliente_id: "a", tese_id: "t2", valor_apurado_inicial: 500, incluir_no_calculo: false },
      ],
      [
        { cliente_id: "a", mes_referencia: "2026-08-01", valor_compensado: 400, tese_origem_id: "t1" },
        { cliente_id: "c", mes_referencia: "2026-08-01", valor_compensado: 100, tese_origem_id: null },
      ],
      [{ id: "p1", cliente_id: "a", tese: "pis_cofins_insumos", criado_em: "2026-08-01" }],
    );
    expect(rows[0]).toMatchObject({ codigo: "INSUMOS", clientes: 2, processos: 1, apurado: 2000, compensado: 400, saldo: 1600, pctUtilizado: 20, share: 100 });
    const semTese = rows.find((r) => r.tese_id === "__sem_tese__")!;
    expect(semTese).toMatchObject({ label: "Sem tese vinculada", compensado: 100, clientes: 1 });
    expect(rows.find((r) => r.tese_id === "t2")).toBeUndefined();
  });
});

describe("reconciliação do recorte Executivo × Clientes", () => {
  const clientes = ["administrativo", "ressarcimento", "judicial", "encerrado"];
  const statusRows = [
    { cliente_id: "administrativo", status_principal: "compensando" },
    // Formato legado: ramo misturado no status, normalizado pelas flags.
    { cliente_id: "ressarcimento", status_principal: "ressarcimento", tem_tese_ativa: true },
    { cliente_id: "judicial", status_principal: "judicial", tem_tese_ativa: true },
    { cliente_id: "encerrado", status_principal: "encerrado", todos_encerrados: true },
  ];
  const statusMap = new Map(
    statusRows.map((row) => [row.cliente_id, normalizarStatusCompensacao(row)]),
  );
  const ramosMap = buildRamoFlagsPorCliente([
    { cliente_id: "administrativo", tipo_recuperacao: "compensacao", status_contrato: "assinado" },
    { cliente_id: "ressarcimento", tipo_recuperacao: "ressarcimento", status_contrato: "assinado" },
    { cliente_id: "judicial", tipo_recuperacao: "recuperacao_judicial", status_contrato: "assinado" },
    { cliente_id: "encerrado", tipo_recuperacao: "compensacao", status_contrato: "assinado", status_processo: "compensado" },
  ]);
  const totais = [
    { cliente_id: "administrativo", credito_apurado: 1_000, total_compensado: 300, saldo_restante: 700 },
    { cliente_id: "ressarcimento", credito_apurado: 2_000, total_compensado: 500, saldo_restante: 1_500 },
    { cliente_id: "judicial", credito_apurado: 4_000, total_compensado: 1_000, saldo_restante: 3_000 },
    { cliente_id: "encerrado", credito_apurado: 800, total_compensado: 800, saldo_restante: 0 },
  ];

  it("administrativo usa compensação + ressarcimento, igual à semântica da esteira", () => {
    const idsClientes = filtrarIdsRecorteGerencial(
      clientes,
      new Set(STATUS_COMPENSACAO_VALUES),
      "administrativo",
      statusMap,
      ramosMap,
    );
    expect([...idsClientes]).toEqual(["administrativo", "ressarcimento", "encerrado"]);

    const executivo = totais.filter((row) => idsClientes.has(row.cliente_id));
    expect(executivo.reduce((sum, row) => sum + row.credito_apurado, 0)).toBe(3_800);
    expect(executivo.reduce((sum, row) => sum + row.total_compensado, 0)).toBe(1_600);
    expect(executivo.reduce((sum, row) => sum + row.saldo_restante, 0)).toBe(2_200);
  });

  it("qualidade de dados e ramo se combinam sem judicial/ressarcimento virarem status", () => {
    const idsClientes = filtrarIdsRecorteGerencial(
      clientes,
      new Set(["sem_operacao"]),
      "recuperacao_judicial",
      statusMap,
      ramosMap,
    );
    expect([...idsClientes]).toEqual(["judicial"]);
    expect(statusMap.get("ressarcimento")).toBe("sem_operacao");
    expect(statusMap.get("judicial")).toBe("sem_operacao");
  });
});

describe("geracaoTesesPorMes", () => {
  it("conta processos e clientes distintos por mês", () => {
    const g = geracaoTesesPorMes(
      [
        { cliente_id: "a", criado_em: "2026-09-02T10:00:00Z" },
        { cliente_id: "a", criado_em: "2026-09-05T10:00:00Z" },
        { cliente_id: "b", criado_em: "2026-08-20T10:00:00Z" },
        { cliente_id: "b", criado_em: null },
      ],
      3,
      AGORA,
    );
    expect(g.map((p) => p.label)).toEqual(["Jul/26", "Ago/26", "Set/26"]);
    expect(g[2]).toMatchObject({ novos: 2, clientes: 1 });
    expect(g[1]).toMatchObject({ novos: 1, clientes: 1 });
  });
});

const CONFIG = [
  { estagio: "triagem", label: "Triagem", sla_dias: 1, ordem: 1, ativo: true },
  { estagio: "em_compensacao", label: "Em Compensação", sla_dias: 30, ordem: 2, ativo: true },
  { estagio: "concluido", label: "Concluído", sla_dias: null, ordem: 3, ativo: false },
];

const CLIENTES: EsteiraClienteLike[] = [
  { id: "1", empresa: "A", estagio_esteira: "triagem", dias_na_etapa: 3, sla_dias: 1, responsavel_id: "u1", responsavel_nome: "Bia", ultima_acao_em: diasAtras(1) },
  { id: "2", empresa: "B", estagio_esteira: "triagem", dias_na_etapa: 0, sla_dias: 1, responsavel_id: "u1", responsavel_nome: "Bia", ultima_acao_em: diasAtras(20) },
  { id: "3", empresa: "C", estagio_esteira: "em_compensacao", dias_na_etapa: 10, sla_dias: 30, responsavel_id: null, responsavel_nome: null, teses_assinadas: 2, ultima_acao_em: null },
  { id: "4", empresa: "D", estagio_esteira: "concluido", dias_na_etapa: 90, sla_dias: null, responsavel_id: "u2", responsavel_nome: "Caio" },
];

describe("resumoEsteira", () => {
  it("segue a ordem da config, conta atrasados e esconde inativa vazia", () => {
    const r = resumoEsteira(CLIENTES, CONFIG);
    expect(r.map((e) => e.estagio)).toEqual(["triagem", "em_compensacao", "concluido"]);
    expect(r[0]).toMatchObject({ clientes: 2, atrasados: 1, atrasoAcumulado: 2, diasMedios: 2 });
    expect(resumoEsteira(CLIENTES.slice(0, 3), CONFIG).map((e) => e.estagio)).not.toContain("concluido");
  });
});

describe("cargaPorResponsavel", () => {
  it("agrupa por responsável, atrasados primeiro", () => {
    const r = cargaPorResponsavel(CLIENTES, new Map(), AGORA);
    expect(r[0]).toMatchObject({ nome: "Bia", clientes: 2, atrasados: 1, semAcao7d: 1 });
    expect(r.find((x) => x.responsavel_id === null)).toMatchObject({ nome: "Sem responsável", clientes: 1, emCompensacao: 1, tesesAssinadas: 2, semAcao7d: 1 });
  });
});

describe("movimentosEsteira", () => {
  it("conta entradas desde a data, por etapa", () => {
    const r = movimentosEsteira(
      [
        { cliente_id: "1", estagio: "triagem", entrou_em: diasAtras(1), saiu_em: null, origem: "sistema" },
        { cliente_id: "1", estagio: "concluido", entrou_em: diasAtras(0), saiu_em: null, origem: "sistema" },
        { cliente_id: "2", estagio: "triagem", entrou_em: diasAtras(30), saiu_em: null, origem: "sistema" },
        { cliente_id: "3", estagio: "triagem", entrou_em: diasAtras(1), saiu_em: null, origem: "importacao" },
        { cliente_id: "4", estagio: "triagem", entrou_em: diasAtras(1), saiu_em: null, origem: "reset_sla" },
      ],
      diasAtras(7),
    );
    expect(r).toMatchObject({ total: 2, clientes: 1, concluidos: 1 });
    expect(r.porEtapa.map((e) => e.label)).toEqual(["Triagem", "Concluído"]);
  });
});

describe("ações do time", () => {
  const acoes = [
    { tipo: "esteira", usuario_id: "u1", created_at: diasAtras(1) },
    { tipo: "esteira", usuario_id: "u1", created_at: diasAtras(2) },
    { tipo: "xpto_novo", usuario_id: null, created_at: diasAtras(2) },
  ];
  it("rotula tipos conhecidos e humaniza desconhecidos", () => {
    const t = acoesPorTipo(acoes);
    expect(t[0]).toMatchObject({ key: "esteira", label: "Movimento na esteira", count: 2 });
    expect(t[1].label).toBe("Xpto novo");
  });
  it("agrupa por usuário com nome e sistema", () => {
    const u = acoesPorUsuario(acoes, new Map([["u1", "Bia"]]));
    expect(u[0]).toMatchObject({ label: "Bia", count: 2 });
    expect(u[1]).toMatchObject({ label: "Sistema / automações", count: 1 });
  });
});

describe("filaPrioridade", () => {
  it("atrasados primeiro, depois saldo alto, depois sem ação; terminais fora", () => {
    const saldo = new Map([
      ["1", 10_000],
      ["2", 900_000],
      ["3", 50_000],
      ["4", 5_000_000],
    ]);
    const r = filaPrioridade(CLIENTES, saldo, CONFIG, 8, AGORA);
    expect(r.map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(r.map((x) => x.motivo)).toEqual(["atrasado", "saldo_alto", "sem_acao"]);
    expect(r[0].estagioLabel).toBe("Triagem");
  });
});
