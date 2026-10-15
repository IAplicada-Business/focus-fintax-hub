import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { analyzeLead } from "@/services/leadsService";

export interface ProgressoAnaliseLote {
  total: number;
  concluidos: number;
  falhas: number;
  rodando: boolean;
}

const PROGRESSO_INICIAL: ProgressoAnaliseLote = { total: 0, concluidos: 0, falhas: 0, rodando: false };

/**
 * Roda `analyze-lead` para vários leads com concorrência limitada (3): a
 * função chama o motor de diagnóstico e disparar 200 de uma vez derrubaria
 * a cota do Edge. Falha de um lead não interrompe o resto — só conta.
 */
export function useAnalisarLeadsEmLote(concorrencia = 3) {
  const qc = useQueryClient();
  const [progresso, setProgresso] = useState<ProgressoAnaliseLote>(PROGRESSO_INICIAL);
  const cancelado = useRef(false);

  const cancelar = useCallback(() => {
    cancelado.current = true;
  }, []);

  const analisar = useCallback(
    async (leadIds: string[]): Promise<{ concluidos: number; falhas: number }> => {
      cancelado.current = false;
      let concluidos = 0;
      let falhas = 0;
      setProgresso({ total: leadIds.length, concluidos: 0, falhas: 0, rodando: leadIds.length > 0 });

      const fila = [...leadIds];
      const worker = async () => {
        while (fila.length > 0 && !cancelado.current) {
          const id = fila.shift()!;
          try {
            await analyzeLead(id);
            concluidos += 1;
          } catch {
            falhas += 1;
          }
          setProgresso({ total: leadIds.length, concluidos, falhas, rodando: true });
        }
      };
      await Promise.all(Array.from({ length: Math.min(concorrencia, leadIds.length) }, worker));

      setProgresso({ total: leadIds.length, concluidos, falhas, rodando: false });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      return { concluidos, falhas };
    },
    [concorrencia, qc],
  );

  const reiniciar = useCallback(() => setProgresso(PROGRESSO_INICIAL), []);

  return { analisar, cancelar, reiniciar, progresso };
}
