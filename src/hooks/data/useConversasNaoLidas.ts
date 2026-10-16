import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { listConversasInbox, type InboxConversa } from "@/services/atendimentoService";
import { assinarLeitura, chaveTelefone, conversaNaoLida, lerEstadoLeitura } from "@/lib/atendimento-leitura";

/** Quem vê o atendimento (mesma regra do menu: sem linha = liberado). */
export function usePodeVerAtendimento(): boolean {
  const { permissions, userRole } = useAuth();
  if (!userRole || userRole === "cliente") return false;
  const perm = permissions.find((p) => p.screen_key === "atendimento");
  return perm ? perm.can_access : true;
}

/**
 * Conversas com mensagem do lead ainda não vista por este usuário. Lê a mesma
 * query da caixa de entrada (`["atendimento","inbox"]`); quem mantém ela viva
 * em tempo real é o `NotificacoesAtendimento` montado no layout.
 */
export function useConversasNaoLidas() {
  const pode = usePodeVerAtendimento();
  const { data = [] } = useQuery({
    queryKey: ["atendimento", "inbox"],
    queryFn: listConversasInbox,
    enabled: pode,
    staleTime: 15_000,
  });
  const estado = useSyncExternalStore(assinarLeitura, () => lerEstadoLeitura());

  return useMemo(() => {
    const naoLidas: InboxConversa[] = pode ? data.filter((c) => conversaNaoLida(c, estado)) : [];
    const chaves = new Set(naoLidas.map((c) => chaveTelefone(c.telefone)));
    return {
      naoLidas,
      total: naoLidas.length,
      /** true se o telefone (de lead ou conversa) tem mensagem nova. */
      temNova: (telefone: string | null | undefined) => {
        const k = chaveTelefone(telefone);
        return k ? chaves.has(k) : false;
      },
    };
  }, [data, estado, pode]);
}
