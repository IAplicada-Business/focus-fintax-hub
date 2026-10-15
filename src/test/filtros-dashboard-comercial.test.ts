import { describe, expect, it } from "vitest";
import {
  aplicarFiltrosComercial,
  contarFiltrosAtivos,
  dentroDaFaixa,
  FILTROS_COMERCIAL_PADRAO,
} from "@/lib/filtros-dashboard-comercial";

const AGORA = new Date(2026, 9, 15, 12).getTime(); // 15/10/2026

const leads = [
  { id: "a", criado_em: new Date(2026, 9, 2).toISOString(), produto: "agf_fintax", status_funil: "novo", sdr_id: "u1", closer_id: null, potencial: 50_000 },
  { id: "b", criado_em: new Date(2026, 8, 10).toISOString(), produto: "agf_contabil", status_funil: "em_negociacao", sdr_id: null, closer_id: "u2", potencial: 750_000 },
  { id: "c", criado_em: new Date(2026, 9, 10).toISOString(), produto: null, status_funil: "contrato_emitido", sdr_id: null, closer_id: null, potencial: 0 },
  { id: "d", criado_em: new Date(2026, 5, 1).toISOString(), produto: "agf_tax", status_funil: "ganho", sdr_id: "u1", closer_id: "u2", potencial: 2_000_000 },
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("filtros da Visão Comercial", () => {
  it("sem filtro devolve todos os leads", () => {
    expect(ids(aplicarFiltrosComercial(leads, FILTROS_COMERCIAL_PADRAO, AGORA))).toEqual(["a", "b", "c", "d"]);
    expect(contarFiltrosAtivos(FILTROS_COMERCIAL_PADRAO)).toBe(0);
  });

  it("período recorta pela data de entrada do lead", () => {
    const f = { ...FILTROS_COMERCIAL_PADRAO, periodo: { tipo: "este_mes" as const } };
    expect(ids(aplicarFiltrosComercial(leads, f, AGORA))).toEqual(["a", "c"]);
    const mes = { ...FILTROS_COMERCIAL_PADRAO, periodo: { tipo: "mes" as const, mes: "2026-09" } };
    expect(ids(aplicarFiltrosComercial(leads, mes, AGORA))).toEqual(["b"]);
  });

  it("produto trata lead sem produto como AGF Fintax", () => {
    const f = { ...FILTROS_COMERCIAL_PADRAO, produto: "agf_fintax" as const };
    expect(ids(aplicarFiltrosComercial(leads, f, AGORA))).toEqual(["a", "c"]);
  });

  it("etapa usa a etapa unificada (em_negociacao conta como triagem)", () => {
    const f = { ...FILTROS_COMERCIAL_PADRAO, etapa: "triagem" };
    expect(ids(aplicarFiltrosComercial(leads, f, AGORA))).toEqual(["b"]);
  });

  it("responsável casa SDR ou closer; 'sem' pega quem não tem nenhum", () => {
    expect(ids(aplicarFiltrosComercial(leads, { ...FILTROS_COMERCIAL_PADRAO, responsavel: "u2" }, AGORA))).toEqual(["b", "d"]);
    expect(ids(aplicarFiltrosComercial(leads, { ...FILTROS_COMERCIAL_PADRAO, responsavel: "sem" }, AGORA))).toEqual(["c"]);
  });

  it("faixa de valor separa quem não tem valor estimado", () => {
    expect(dentroDaFaixa(0, "ate_100k")).toBe(false);
    expect(dentroDaFaixa(0, "sem_diagnostico")).toBe(true);
    expect(dentroDaFaixa(100_000, "ate_100k")).toBe(false);
    expect(dentroDaFaixa(100_000, "100k_500k")).toBe(true);
    expect(ids(aplicarFiltrosComercial(leads, { ...FILTROS_COMERCIAL_PADRAO, valor: "acima_1m" }, AGORA))).toEqual(["d"]);
  });

  it("filtros combinam e são contados", () => {
    const f = { ...FILTROS_COMERCIAL_PADRAO, responsavel: "u1", valor: "ate_100k" as const };
    expect(ids(aplicarFiltrosComercial(leads, f, AGORA))).toEqual(["a"]);
    expect(contarFiltrosAtivos(f)).toBe(2);
  });
});
