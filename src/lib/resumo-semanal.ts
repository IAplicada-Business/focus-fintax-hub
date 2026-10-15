/**
 * Resumo semanal automático por WhatsApp (Lote 3B) — regras puras de
 * formatação das mensagens de segunda e sexta.
 *
 * FONTE ÚNICA DA LÓGICA: este arquivo é o testado pelo vitest. A Edge
 * Function `supabase/functions/resumo-semanal/mensagem.ts` é uma CÓPIA
 * literal (Deno não importa de `src/` e o vitest não importa o arquivo
 * Deno). Qualquer mudança aqui precisa ser replicada lá.
 *
 * Modelo validado com o cliente: texto puro, bullets "•", parágrafos
 * separados por linha em branco e só os emojis ✱ e 🤓.
 */

export const EMOJIS_PERMITIDOS = ["✱", "🤓"] as const;

export interface ResumoEsteiraEtapa {
  estagio: string;
  etapa: string;
  total: number;
  atrasados: number;
}

export interface ResumoPrioridade {
  cliente_id: string;
  empresa: string;
  etapa: string;
  estagio: string;
  dias_parado: number;
  saldo_projetado: number;
  score?: number;
}

export interface ResumoMovimento {
  cliente_id: string;
  empresa: string;
  de: string | null;
  para: string;
  em?: string;
}

/** Payload de `resumo_semanal_dados()` (migration 20261016130000). */
export interface ResumoSemanalDados {
  tipo?: string;
  periodo_inicio: string;
  periodo_fim: string;
  gerado_em?: string;
  foto: {
    carteira_ativa: number;
    credito_apurado_total: number;
    saldo_a_compensar: number;
    compensado_mes: number;
    honorarios_mes: number;
    clientes_em_compensacao: number;
  };
  esteira: ResumoEsteiraEtapa[];
  prioridades: ResumoPrioridade[];
  atencao: { sem_tese: number; sem_responsavel: number; fora_sla: number };
  comercial: { leads_novos_semana_passada: number; reunioes_semana: number; funil_ativo: number };
  semana: {
    compensado: number;
    honorarios: number;
    leads_novos: number;
    contratos_assinados: number;
    clientes_avancaram: number;
  };
  movimentos: ResumoMovimento[];
  pendentes: { fora_sla: number; sem_movimentacao: number; contratos_aguardando: number };
  alertas: {
    maior_saldo_parado: { empresa: string; etapa: string; saldo: number } | null;
    sem_tese: { total: number; saldo: number } | null;
    pior_sla: { empresa: string; etapa: string; dias_acima: number } | null;
  };
}

// ───────────────────────────────────────── Formatação básica

/** "R$ 48.720.400" — sem centavos, separador de milhar com ponto. */
export function formatarMoedaResumo(valor: number | string | null | undefined): string {
  const n = Math.round(Number(valor ?? 0) || 0);
  const abs = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}R$ ${abs}`;
}

/** "+R$ 1.200" / "-R$ 300" / "R$ 0" para o comparativo. */
export function formatarVariacaoMoeda(delta: number): string {
  const n = Math.round(delta || 0);
  if (n === 0) return "R$ 0";
  return `${n > 0 ? "+" : "-"}${formatarMoedaResumo(Math.abs(n))}`;
}

/** "+2" / "-1" / "0". */
export function formatarVariacaoInteiro(delta: number): string {
  const n = Math.round(delta || 0);
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `${n}`;
}

/** "dd/mm" a partir de "YYYY-MM-DD" (ou ISO completo). */
export function formatarDataCurta(iso: string | null | undefined): string {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "--/--";
  return `${m[3]}/${m[2]}`;
}

export function primeiroNome(nome: string | null | undefined): string {
  const limpo = String(nome ?? "").trim();
  if (!limpo) return "time";
  return limpo.split(/\s+/)[0];
}

/** Mapeia o estágio do enum pro rótulo da esteira (fallback pro próprio valor). */
export function rotuloEtapa(estagio: string | null | undefined, esteira: ResumoEsteiraEtapa[]): string {
  if (!estagio) return "etapa anterior";
  return esteira.find((e) => e.estagio === estagio)?.etapa ?? estagio;
}

/**
 * Heurística de prioridade (mesma da RPC, documentada lá): saldo projetado ×
 * dias parado / SLA da etapa. SLA nulo vale 30. Exposta aqui pra UI e testes
 * poderem explicar o ranking.
 */
export function pontuarPrioridade(saldo: number, diasParado: number, slaDias: number | null | undefined): number {
  const sla = Math.max(Number(slaDias ?? 30) || 30, 1);
  return (Math.max(Number(saldo) || 0, 0) * Math.max(Number(diasParado) || 0, 0)) / sla;
}

// ───────────────────────────────────────── Montagem das mensagens

const linhasBullet = (itens: string[]) => itens.map((i) => `• ${i}`).join("\n");
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export function montarMensagemSegunda(dados: ResumoSemanalDados, nomeDestinatario?: string | null): string {
  const nome = primeiroNome(nomeDestinatario);
  const ini = formatarDataCurta(dados.periodo_inicio);
  const fim = formatarDataCurta(dados.periodo_fim);
  const f = dados.foto;

  const foto = linhasBullet([
    `Carteira ativa: ${f.carteira_ativa} ${plural(f.carteira_ativa, "cliente", "clientes")}`,
    `Crédito apurado total: ${formatarMoedaResumo(f.credito_apurado_total)}`,
    `Saldo a compensar: ${formatarMoedaResumo(f.saldo_a_compensar)}`,
    `Compensado no mês até aqui: ${formatarMoedaResumo(f.compensado_mes)}`,
    `Honorários acumulados no mês: ${formatarMoedaResumo(f.honorarios_mes)}`,
  ]);

  // Só etapas com cliente, na ordem da esteira (a RPC já ordena por `ordem`).
  const etapasComCliente = dados.esteira.filter((e) => e.total > 0);
  const distribuicao =
    etapasComCliente.length > 0
      ? linhasBullet(etapasComCliente.map((e) => `${e.etapa}: ${e.total}`))
      : "• Nenhum cliente na esteira";

  const prioridades =
    dados.prioridades.length > 0
      ? linhasBullet(
          dados.prioridades
            .slice(0, 3)
            .map(
              (p) =>
                `${p.empresa} — ${p.etapa}, ${p.dias_parado} ${plural(p.dias_parado, "dia parado", "dias parados")}, saldo projetado ${formatarMoedaResumo(p.saldo_projetado)}`,
            ),
        )
      : "• Nenhuma prioridade sugerida";

  const a = dados.atencao;
  const atencaoItens: string[] = [];
  if (a.sem_tese > 0) atencaoItens.push(`${a.sem_tese} ${plural(a.sem_tese, "cliente sem tese vinculada precisa", "clientes sem tese vinculada precisam")} de ajuste`);
  if (a.sem_responsavel > 0) atencaoItens.push(`${a.sem_responsavel} ${plural(a.sem_responsavel, "cliente", "clientes")} sem responsável definido`);
  if (a.fora_sla > 0) atencaoItens.push(`${a.fora_sla} ${plural(a.fora_sla, "cliente", "clientes")} fora do SLA da etapa`);
  const atencao = atencaoItens.length > 0 ? linhasBullet(atencaoItens) : "• Nenhum ponto de atenção aberto";

  const c = dados.comercial;
  const comercial = linhasBullet([
    `${c.leads_novos_semana_passada} ${plural(c.leads_novos_semana_passada, "lead novo", "leads novos")} na semana passada`,
    `${c.reunioes_semana} ${plural(c.reunioes_semana, "reunião comercial agendada", "reuniões comerciais agendadas")} pra essa semana`,
    `Funil ativo: ${formatarMoedaResumo(c.funil_ativo)}`,
  ]);

  return [
    `Bom dia, ${nome} ✱`,
    `Segue o resumo do Grupo AGF pra semana de ${ini} a ${fim}.`,
    `Foto atual do sistema:\n${foto}`,
    `Distribuição na esteira:\n${distribuicao}`,
    `Prioridades da semana (o que a IA sugeriu atacar):\n${prioridades}`,
    `Pontos de atenção:\n${atencao}`,
    `Comercial:\n${comercial}`,
    "Bora pra semana 🤓",
  ].join("\n\n");
}

/**
 * Para cada prioridade sugerida na segunda, diz o que aconteceu na semana.
 * Exportado pra teste e pro preview.
 */
export function descreverPrioridadesDaSemana(
  prioridadesSegunda: ResumoPrioridade[],
  movimentos: ResumoMovimento[],
  esteira: ResumoEsteiraEtapa[],
): string[] {
  return prioridadesSegunda.slice(0, 3).map((p) => {
    const mov = movimentos.find((m) => m.cliente_id === p.cliente_id);
    if (!mov) return `${p.empresa}: sem movimentação`;
    if (mov.para === "contrato_assinado") return `${p.empresa}: contrato assinado`;
    if (mov.para === "concluido") return `${p.empresa}: concluído`;
    const de = mov.de ? rotuloEtapa(mov.de, esteira) : p.etapa;
    return `${p.empresa}: avançou de ${de} para ${rotuloEtapa(mov.para, esteira)}`;
  });
}

/** Até 3 alertas heurísticos pra semana seguinte. */
export function montarAlertas(dados: ResumoSemanalDados): string[] {
  const itens: string[] = [];
  const al = dados.alertas ?? { maior_saldo_parado: null, sem_tese: null, pior_sla: null };
  if (al.maior_saldo_parado && Number(al.maior_saldo_parado.saldo) > 0) {
    itens.push(
      `${al.maior_saldo_parado.empresa} tem ${formatarMoedaResumo(al.maior_saldo_parado.saldo)} de saldo parado em ${al.maior_saldo_parado.etapa}`,
    );
  }
  if (al.sem_tese && Number(al.sem_tese.total) > 0) {
    const n = Number(al.sem_tese.total);
    const saldo = Number(al.sem_tese.saldo) > 0 ? ` (${formatarMoedaResumo(al.sem_tese.saldo)} travados)` : "";
    itens.push(`${n} ${plural(n, "cliente", "clientes")} sem tese vinculada ${plural(n, "segura", "seguram")} saldo${saldo}`);
  }
  if (al.pior_sla && Number(al.pior_sla.dias_acima) > 0) {
    itens.push(
      `${al.pior_sla.empresa} está ${al.pior_sla.dias_acima} ${plural(al.pior_sla.dias_acima, "dia", "dias")} além do SLA em ${al.pior_sla.etapa}`,
    );
  }
  return itens.slice(0, 3);
}

export function montarMensagemSexta(
  dados: ResumoSemanalDados,
  segunda: ResumoSemanalDados | null,
  nomeDestinatario?: string | null,
): string {
  const nome = primeiroNome(nomeDestinatario);
  const ini = formatarDataCurta(dados.periodo_inicio);
  const fim = formatarDataCurta(dados.periodo_fim);
  const s = dados.semana;

  const movimentacao = linhasBullet([
    `Compensado na semana: ${formatarMoedaResumo(s.compensado)}`,
    `Honorários gerados: ${formatarMoedaResumo(s.honorarios)}`,
    `Novos leads que entraram: ${s.leads_novos}`,
    `Novos contratos assinados: ${s.contratos_assinados}`,
    `Clientes que avançaram de etapa: ${s.clientes_avancaram}`,
  ]);

  // Sem snapshot de segunda (primeira semana, ou segunda falhou) a sexta
  // mostra a foto atual e avisa — melhor que inventar variação zero.
  const f = dados.foto;
  const comparativo = segunda
    ? linhasBullet([
        `Saldo a compensar: ${formatarMoedaResumo(f.saldo_a_compensar)} (variação de ${formatarVariacaoMoeda(f.saldo_a_compensar - segunda.foto.saldo_a_compensar)} vs segunda)`,
        `Clientes em compensação: ${f.clientes_em_compensacao} (${formatarVariacaoInteiro(f.clientes_em_compensacao - segunda.foto.clientes_em_compensacao)} vs segunda)`,
        `Funil comercial: ${formatarMoedaResumo(dados.comercial.funil_ativo)} (${formatarVariacaoMoeda(dados.comercial.funil_ativo - segunda.comercial.funil_ativo)} vs segunda)`,
      ])
    : linhasBullet([
        `Saldo a compensar: ${formatarMoedaResumo(f.saldo_a_compensar)} (sem foto de segunda pra comparar)`,
        `Clientes em compensação: ${f.clientes_em_compensacao}`,
        `Funil comercial: ${formatarMoedaResumo(dados.comercial.funil_ativo)}`,
      ]);

  const prioridadesBase = segunda?.prioridades?.length ? segunda.prioridades : dados.prioridades;
  const prioridadesItens = descreverPrioridadesDaSemana(prioridadesBase, dados.movimentos ?? [], dados.esteira);
  const prioridades = prioridadesItens.length > 0 ? linhasBullet(prioridadesItens) : "• Nenhuma prioridade sugerida na segunda";

  const p = dados.pendentes;
  const pendentesItens: string[] = [];
  if (p.fora_sla > 0) pendentesItens.push(`${p.fora_sla} ${plural(p.fora_sla, "cliente", "clientes")} ainda fora do SLA`);
  if (p.sem_movimentacao > 0) pendentesItens.push(`${p.sem_movimentacao} ${plural(p.sem_movimentacao, "cliente", "clientes")} sem nenhuma movimentação na semana`);
  if (p.contratos_aguardando > 0) pendentesItens.push(`${p.contratos_aguardando} ${plural(p.contratos_aguardando, "contrato enviado aguardando", "contratos enviados aguardando")} assinatura`);
  const pendentes = pendentesItens.length > 0 ? linhasBullet(pendentesItens) : "• Nada pendente";

  const alertasItens = montarAlertas(dados);
  const alertas = alertasItens.length > 0 ? linhasBullet(alertasItens) : "• Nenhum alerta pra próxima semana";

  return [
    `Boa tarde, ${nome} ✱`,
    `Fechamento da semana de ${ini} a ${fim} no Grupo AGF.`,
    `Movimentação da semana:\n${movimentacao}`,
    `Comparativo com a segunda:\n${comparativo}`,
    `Prioridades da semana — o que rolou:\n${prioridades}`,
    `Ficaram pendentes:\n${pendentes}`,
    `Alertas pra próxima semana:\n${alertas}`,
    `Bom final de semana, ${nome} 🤓`,
  ].join("\n\n");
}

export type ModeloResumo = "segunda" | "sexta";

export function montarMensagemResumo(
  modelo: ModeloResumo,
  dados: ResumoSemanalDados,
  segunda: ResumoSemanalDados | null,
  nomeDestinatario?: string | null,
): string {
  return modelo === "sexta"
    ? montarMensagemSexta(dados, segunda, nomeDestinatario)
    : montarMensagemSegunda(dados, nomeDestinatario);
}

// ───────────────────────────────────────── Validação do formato

/**
 * Garante o formato do modelo: nenhum emoji além de ✱ e 🤓, nenhum
 * marcador de lista que não seja "•" e nenhuma marcação de negrito do
 * WhatsApp ("*texto*"). Usado nos testes e como sanidade antes do envio.
 */
export function validarFormatoResumo(texto: string): { ok: boolean; problemas: string[] } {
  const problemas: string[] = [];
  // Emojis: qualquer Extended_Pictographic que não esteja na lista permitida.
  const emojis = texto.match(/\p{Extended_Pictographic}/gu) ?? [];
  const proibidos = [...new Set(emojis.filter((e) => !(EMOJIS_PERMITIDOS as readonly string[]).includes(e)))];
  if (proibidos.length > 0) problemas.push(`emoji fora do modelo: ${proibidos.join(" ")}`);
  if (/^\s*[-*]\s+/m.test(texto)) problemas.push("bullet deve ser •");
  if (/\*[^*\n]+\*/.test(texto)) problemas.push("sem negrito de WhatsApp");
  return { ok: problemas.length === 0, problemas };
}

/** Número em formato Z-API (55 + DDD + número) ou null se inválido. */
export function normalizarTelefoneBR(raw: string | null | undefined): string | null {
  const digitos = String(raw ?? "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return digitos;
  return null;
}
