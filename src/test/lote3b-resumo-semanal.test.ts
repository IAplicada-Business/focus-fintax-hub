import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  descreverPrioridadesDaSemana,
  formatarDataCurta,
  formatarMoedaResumo,
  formatarVariacaoInteiro,
  formatarVariacaoMoeda,
  montarAlertas,
  montarMensagemSegunda,
  montarMensagemSexta,
  normalizarTelefoneBR,
  pontuarPrioridade,
  primeiroNome,
  validarFormatoResumo,
  type ResumoSemanalDados,
} from "@/lib/resumo-semanal";

const dados: ResumoSemanalDados = {
  periodo_inicio: "2026-10-12",
  periodo_fim: "2026-10-16",
  foto: {
    carteira_ativa: 42,
    credito_apurado_total: 48_720_400.49,
    saldo_a_compensar: 31_250_000,
    compensado_mes: 1_200_000,
    honorarios_mes: 240_000,
    clientes_em_compensacao: 18,
  },
  esteira: [
    { estagio: "triagem", etapa: "Triagem", total: 5, atrasados: 1 },
    { estagio: "devolucao_comercial", etapa: "Devolução Comercial", total: 0, atrasados: 0 },
    { estagio: "contrato_emitido", etapa: "Contrato Emitido", total: 3, atrasados: 0 },
    { estagio: "contrato_assinado", etapa: "Contrato Assinado", total: 2, atrasados: 0 },
    { estagio: "em_compensacao", etapa: "Em Compensação", total: 18, atrasados: 4 },
    { estagio: "compensado", etapa: "Compensado", total: 0, atrasados: 0 },
    { estagio: "concluido", etapa: "Concluído", total: 14, atrasados: 0 },
  ],
  prioridades: [
    { cliente_id: "c1", empresa: "Mercado X", etapa: "Contrato Emitido", estagio: "contrato_emitido", dias_parado: 12, saldo_projetado: 2_300_000 },
    { cliente_id: "c2", empresa: "Indústria Y", etapa: "Em Compensação", estagio: "em_compensacao", dias_parado: 45, saldo_projetado: 900_000 },
    { cliente_id: "c3", empresa: "Rede Z", etapa: "Triagem", estagio: "triagem", dias_parado: 1, saldo_projetado: 500_000 },
  ],
  atencao: { sem_tese: 3, sem_responsavel: 0, fora_sla: 5 },
  comercial: { leads_novos_semana_passada: 7, reunioes_semana: 1, funil_ativo: 5_400_000 },
  semana: { compensado: 350_000, honorarios: 70_000, leads_novos: 4, contratos_assinados: 1, clientes_avancaram: 6 },
  movimentos: [
    { cliente_id: "c1", empresa: "Mercado X", de: "contrato_emitido", para: "contrato_assinado" },
    { cliente_id: "c3", empresa: "Rede Z", de: "triagem", para: "contrato_emitido" },
  ],
  pendentes: { fora_sla: 4, sem_movimentacao: 9, contratos_aguardando: 2 },
  alertas: {
    maior_saldo_parado: { empresa: "Atacado W", etapa: "Devolução Comercial", saldo: 1_800_000 },
    sem_tese: { total: 3, saldo: 2_000_000 },
    pior_sla: { empresa: "Indústria Y", etapa: "Em Compensação", dias_acima: 15 },
  },
};

describe("Lote 3B · formatação básica", () => {
  it("formata moeda sem centavos e com ponto de milhar", () => {
    expect(formatarMoedaResumo(48_720_400.49)).toBe("R$ 48.720.400");
    expect(formatarMoedaResumo(0)).toBe("R$ 0");
    expect(formatarMoedaResumo("1234.5")).toBe("R$ 1.235");
    expect(formatarMoedaResumo(null)).toBe("R$ 0");
    expect(formatarMoedaResumo(-500)).toBe("-R$ 500");
  });

  it("formata variações com sinal", () => {
    expect(formatarVariacaoMoeda(1200)).toBe("+R$ 1.200");
    expect(formatarVariacaoMoeda(-300)).toBe("-R$ 300");
    expect(formatarVariacaoMoeda(0)).toBe("R$ 0");
    expect(formatarVariacaoInteiro(2)).toBe("+2");
    expect(formatarVariacaoInteiro(-1)).toBe("-1");
    expect(formatarVariacaoInteiro(0)).toBe("0");
  });

  it("formata data dd/mm e primeiro nome", () => {
    expect(formatarDataCurta("2026-10-12")).toBe("12/10");
    expect(formatarDataCurta("2026-10-12T11:00:00Z")).toBe("12/10");
    expect(formatarDataCurta(null)).toBe("--/--");
    expect(primeiroNome("Paulo Henrique")).toBe("Paulo");
    expect(primeiroNome("  ")).toBe("time");
  });

  it("normaliza telefone pra Z-API", () => {
    expect(normalizarTelefoneBR("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizarTelefoneBR("5511912345678")).toBe("5511912345678");
    expect(normalizarTelefoneBR("123")).toBeNull();
  });

  it("pontua prioridade por saldo × dias / SLA, com SLA nulo valendo 30", () => {
    expect(pontuarPrioridade(1000, 10, 5)).toBe(2000);
    expect(pontuarPrioridade(3000, 30, null)).toBe(3000);
    expect(pontuarPrioridade(-50, 10, 5)).toBe(0);
  });
});

describe("Lote 3B · mensagem de segunda", () => {
  const texto = montarMensagemSegunda(dados, "Paulo Henrique");

  it("segue o modelo validado com o cliente", () => {
    expect(texto.startsWith("Bom dia, Paulo ✱\n\nSegue o resumo do Grupo AGF pra semana de 12/10 a 16/10.")).toBe(true);
    expect(texto).toContain("• Carteira ativa: 42 clientes");
    expect(texto).toContain("• Crédito apurado total: R$ 48.720.400");
    expect(texto).toContain("• Saldo a compensar: R$ 31.250.000");
    expect(texto).toContain("• Compensado no mês até aqui: R$ 1.200.000");
    expect(texto).toContain("• Honorários acumulados no mês: R$ 240.000");
    expect(texto).toContain("• Mercado X — Contrato Emitido, 12 dias parados, saldo projetado R$ 2.300.000");
    expect(texto).toContain("• Rede Z — Triagem, 1 dia parado, saldo projetado R$ 500.000");
    expect(texto).toContain("• 7 leads novos na semana passada");
    expect(texto).toContain("• 1 reunião comercial agendada pra essa semana");
    expect(texto).toContain("• Funil ativo: R$ 5.400.000");
    expect(texto.endsWith("Bora pra semana 🤓")).toBe(true);
  });

  it("lista só etapas com cliente, na ordem da esteira", () => {
    const bloco = texto.split("Distribuição na esteira:\n")[1].split("\n\n")[0];
    expect(bloco.split("\n")).toEqual([
      "• Triagem: 5",
      "• Contrato Emitido: 3",
      "• Contrato Assinado: 2",
      "• Em Compensação: 18",
      "• Concluído: 14",
    ]);
    expect(bloco).not.toContain("Devolução Comercial");
  });

  it("omite ponto de atenção zerado", () => {
    expect(texto).toContain("• 3 clientes sem tese vinculada precisam de ajuste");
    expect(texto).toContain("• 5 clientes fora do SLA da etapa");
    expect(texto).not.toContain("sem responsável");
  });

  it("usa só bullets • e os emojis permitidos", () => {
    expect(validarFormatoResumo(texto)).toEqual({ ok: true, problemas: [] });
    expect(validarFormatoResumo("- item 😀 *negrito*").ok).toBe(false);
  });

  it("degrada bem com tudo zerado", () => {
    const vazio: ResumoSemanalDados = {
      ...dados,
      foto: { ...dados.foto, carteira_ativa: 1 },
      esteira: dados.esteira.map((e) => ({ ...e, total: 0 })),
      prioridades: [],
      atencao: { sem_tese: 0, sem_responsavel: 0, fora_sla: 0 },
    };
    const t = montarMensagemSegunda(vazio, null);
    expect(t).toContain("Bom dia, time ✱");
    expect(t).toContain("• Carteira ativa: 1 cliente\n");
    expect(t).toContain("• Nenhum cliente na esteira");
    expect(t).toContain("• Nenhuma prioridade sugerida");
    expect(t).toContain("• Nenhum ponto de atenção aberto");
    expect(validarFormatoResumo(t).ok).toBe(true);
  });
});

describe("Lote 3B · mensagem de sexta", () => {
  const segunda: ResumoSemanalDados = {
    ...dados,
    foto: { ...dados.foto, saldo_a_compensar: 31_500_000, clientes_em_compensacao: 17 },
    comercial: { ...dados.comercial, funil_ativo: 5_000_000 },
  };
  const texto = montarMensagemSexta(dados, segunda, "Paulo");

  it("segue o modelo e calcula o comparativo com sinal", () => {
    expect(texto.startsWith("Boa tarde, Paulo ✱\n\nFechamento da semana de 12/10 a 16/10 no Grupo AGF.")).toBe(true);
    expect(texto).toContain("• Compensado na semana: R$ 350.000");
    expect(texto).toContain("• Honorários gerados: R$ 70.000");
    expect(texto).toContain("• Novos leads que entraram: 4");
    expect(texto).toContain("• Novos contratos assinados: 1");
    expect(texto).toContain("• Clientes que avançaram de etapa: 6");
    expect(texto).toContain("• Saldo a compensar: R$ 31.250.000 (variação de -R$ 250.000 vs segunda)");
    expect(texto).toContain("• Clientes em compensação: 18 (+1 vs segunda)");
    expect(texto).toContain("• Funil comercial: R$ 5.400.000 (+R$ 400.000 vs segunda)");
    expect(texto.endsWith("Bom final de semana, Paulo 🤓")).toBe(true);
    expect(validarFormatoResumo(texto).ok).toBe(true);
  });

  it("conta o que rolou com as prioridades sugeridas na segunda", () => {
    expect(texto).toContain("• Mercado X: contrato assinado");
    expect(texto).toContain("• Indústria Y: sem movimentação");
    expect(texto).toContain("• Rede Z: avançou de Triagem para Contrato Emitido");
    expect(descreverPrioridadesDaSemana(dados.prioridades, [], dados.esteira)).toEqual([
      "Mercado X: sem movimentação",
      "Indústria Y: sem movimentação",
      "Rede Z: sem movimentação",
    ]);
  });

  it("lista pendências e até 3 alertas heurísticos", () => {
    expect(texto).toContain("• 4 clientes ainda fora do SLA");
    expect(texto).toContain("• 9 clientes sem nenhuma movimentação na semana");
    expect(texto).toContain("• 2 contratos enviados aguardando assinatura");
    const alertas = montarAlertas(dados);
    expect(alertas).toHaveLength(3);
    expect(alertas[0]).toBe("Atacado W tem R$ 1.800.000 de saldo parado em Devolução Comercial");
    expect(alertas[1]).toBe("3 clientes sem tese vinculada seguram saldo (R$ 2.000.000 travados)");
    expect(alertas[2]).toBe("Indústria Y está 15 dias além do SLA em Em Compensação");
    expect(montarAlertas({ ...dados, alertas: { maior_saldo_parado: null, sem_tese: { total: 0, saldo: 0 }, pior_sla: null } })).toEqual([]);
  });

  it("sem foto de segunda avisa em vez de inventar variação zero", () => {
    const semSegunda = montarMensagemSexta(dados, null, "Paulo");
    expect(semSegunda).toContain("• Saldo a compensar: R$ 31.250.000 (sem foto de segunda pra comparar)");
    expect(semSegunda).not.toContain("vs segunda");
    expect(validarFormatoResumo(semSegunda).ok).toBe(true);
  });

  it("variação zero sai como R$ 0 e 0", () => {
    const igual = montarMensagemSexta(dados, dados, "Paulo");
    expect(igual).toContain("(variação de R$ 0 vs segunda)");
    expect(igual).toContain("• Clientes em compensação: 18 (0 vs segunda)");
  });
});

describe("Lote 3B · espelho Deno", () => {
  it("a Edge Function usa a mesma lógica do lib (cópia literal após o cabeçalho)", () => {
    const lib = readFileSync(resolve(__dirname, "../lib/resumo-semanal.ts"), "utf8");
    const deno = readFileSync(resolve(__dirname, "../../supabase/functions/resumo-semanal/mensagem.ts"), "utf8");
    const corpo = (s: string) => s.slice(s.indexOf("export const EMOJIS_PERMITIDOS"));
    expect(corpo(deno)).toBe(corpo(lib));
  });
});
