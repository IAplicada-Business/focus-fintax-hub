import { supabase } from "@/integrations/supabase/client";
import type { EstagioEsteira } from "@/lib/esteira-constants";

export interface EsteiraCliente {
  id: string;
  empresa: string;
  cnpj: string;
  segmento: string;
  regime_tributario: string;
  estagio_esteira: string;
  data_entrada_estagio: string;
  dias_na_etapa: number;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  origem: string;
  status: string;
  status_operacional: string | null;
  criado_em: string;
}

export async function listEsteiraClientes() {
  const { data, error } = await supabase
    .from("v_esteira_clientes")
    .select("*")
    .order("data_entrada_estagio", { ascending: true });
  if (error) throw error;
  return data as EsteiraCliente[];
}

export async function updateEstagioEsteira(clienteId: string, estagio: EstagioEsteira) {
  const { error } = await supabase
    .from("clientes")
    .update({ estagio_esteira: estagio })
    .eq("id", clienteId);
  if (error) throw error;
}
