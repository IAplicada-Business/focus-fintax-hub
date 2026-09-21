import { supabase } from "@/integrations/supabase/client";
import {
  avancarEstagioEsteira,
  descricaoHandoff,
  estagioEsteiraDoFunil,
  funilEntraNaEsteira,
} from "@/lib/handoff-funil-esteira";
import type { EstagioEsteira } from "@/lib/esteira-constants";

export interface LeadHandoff {
  id: string;
  empresa: string;
  cnpj?: string | null;
  nome?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  segmento?: string | null;
  regime_tributario?: string | null;
  faturamento_faixa?: string | null;
  status_funil?: string | null;
}

export interface HandoffResultado {
  clienteId: string;
  criado: boolean;
  estagio: EstagioEsteira;
  descricao: string;
}

async function clientePorLead(leadId: string) {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, estagio_esteira")
    .eq("lead_id", leadId)
    .order("criado_em", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Entrega o lead na esteira operacional: cria o cliente se ainda não existir
 * e posiciona na etapa que continua o funil comercial (nunca volta atrás).
 */
export async function entregarLeadNaEsteira(params: {
  lead: LeadHandoff;
  deEtapa: string | null;
  paraEtapa: string;
  usuarioId?: string | null;
  anotacao?: string | null;
}): Promise<HandoffResultado> {
  const { lead, deEtapa, paraEtapa, usuarioId, anotacao } = params;
  const destino = estagioEsteiraDoFunil(paraEtapa, deEtapa ?? lead.status_funil);

  let existente = await clientePorLead(lead.id);
  let criado = false;

  if (!existente) {
    const { data: cliente, error } = await supabase
      .from("clientes")
      .insert({
        lead_id: lead.id,
        empresa: lead.empresa,
        cnpj: lead.cnpj ?? "",
        nome_contato: lead.nome,
        email: lead.email,
        whatsapp: lead.whatsapp,
        segmento: lead.segmento,
        regime_tributario: lead.regime_tributario,
        faturamento_faixa: lead.faturamento_faixa,
        status: "ativo",
        estagio_esteira: destino,
      })
      .select("id, estagio_esteira")
      .single();
    if (error || !cliente) {
      existente = await clientePorLead(lead.id);
      if (!existente) throw error ?? new Error("Não foi possível criar o cliente na esteira.");
    } else {
      existente = cliente;
      criado = true;
    }
  }

  const estagio = avancarEstagioEsteira(existente.estagio_esteira, destino);
  if (estagio !== existente.estagio_esteira) {
    const { error } = await supabase
      .from("clientes")
      .update({ estagio_esteira: estagio })
      .eq("id", existente.id);
    if (error) throw error;
  }

  const { error: leadErr } = await supabase
    .from("leads")
    .update({
      status_funil: paraEtapa,
      status_funil_atualizado_em: new Date().toISOString(),
    })
    .eq("id", lead.id);
  if (leadErr) throw leadErr;

  const { error: histErr } = await supabase.from("lead_historico").insert({
    lead_id: lead.id,
    de_etapa: deEtapa,
    para_etapa: paraEtapa,
    anotacao: anotacao ?? (criado ? descricaoHandoff(estagio) : null),
    criado_por: usuarioId ?? null,
  });
  if (histErr) console.warn("lead_historico não registrado", histErr.message);

  return {
    clienteId: existente.id,
    criado,
    estagio,
    descricao: descricaoHandoff(estagio),
  };
}

export { funilEntraNaEsteira };
