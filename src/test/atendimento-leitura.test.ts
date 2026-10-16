import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetCacheLeitura,
  chaveTelefone,
  conversaNaoLida,
  lerEstadoLeitura,
  LEITURA_STORAGE_KEY,
  marcarConversaLida,
} from "@/lib/atendimento-leitura";

const BASE = "2026-10-16T12:00:00.000Z";

describe("leitura de conversas do atendimento", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetCacheLeitura();
  });

  it("primeira visita grava baseline: histórico antigo não vira 'novo'", () => {
    const estado = lerEstadoLeitura(localStorage, new Date(BASE).getTime());
    expect(estado.baseline).toBe(BASE);
    expect(JSON.parse(localStorage.getItem(LEITURA_STORAGE_KEY)!).baseline).toBe(BASE);
    expect(conversaNaoLida({ telefone: "5521999990000", ultima_em: "2026-10-16T11:00:00Z", ultima_direcao: "entrada" }, estado)).toBe(false);
    expect(conversaNaoLida({ telefone: "5521999990000", ultima_em: "2026-10-16T13:00:00Z", ultima_direcao: "entrada" }, estado)).toBe(true);
  });

  it("só mensagem do lead conta; a nossa última não", () => {
    const estado = { baseline: BASE, lidas: {} };
    expect(conversaNaoLida({ telefone: "21999990000", ultima_em: "2026-10-16T13:00:00Z", ultima_direcao: "saida" }, estado)).toBe(false);
  });

  it("abrir a conversa marca como lida até a próxima mensagem do lead", () => {
    localStorage.setItem(LEITURA_STORAGE_KEY, JSON.stringify({ baseline: BASE, lidas: {} }));
    marcarConversaLida("+55 (21) 99999-0000");
    const estado = lerEstadoLeitura();
    const futura = new Date(Date.now() + 60_000).toISOString();
    expect(conversaNaoLida({ telefone: "5521999990000", ultima_em: new Date(Date.now() - 1000).toISOString(), ultima_direcao: "entrada" }, estado)).toBe(false);
    expect(conversaNaoLida({ telefone: "5521999990000", ultima_em: futura, ultima_direcao: "entrada" }, estado)).toBe(true);
  });

  it("chave casa formatos diferentes do mesmo número", () => {
    expect(chaveTelefone("+55 21 99999-0000")).toBe(chaveTelefone("21999990000"));
  });
});
