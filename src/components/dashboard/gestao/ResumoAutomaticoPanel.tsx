import { useMemo, useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CountChip, InlineEmpty, Panel } from "../ui/primitives";
import {
  useEnviarResumoTeste,
  useResumoDestinatarioMutations,
  useResumoDestinatarios,
  useResumoEnvios,
  useResumoPreview,
} from "@/hooks/data/useResumoSemanal";
import { montarMensagemResumo, normalizarTelefoneBR, type ModeloResumo } from "@/lib/resumo-semanal";
import { cn } from "@/lib/utils";

const TIPO_LABEL: Record<string, string> = { segunda: "Segunda", sexta: "Sexta", teste: "Teste" };

/**
 * "Resumo automático por WhatsApp" (Lote 3B): destinatários do disparo de
 * segunda/sexta, preview do texto gerado a partir de `resumo_semanal_dados`,
 * envio de teste e os últimos envios. Só aparece para admin/pmo — a RPC e as
 * policies barram o resto de qualquer forma.
 */
export function ResumoAutomaticoPanel() {
  const [modelo, setModelo] = useState<ModeloResumo>("segunda");
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [testeAberto, setTesteAberto] = useState(false);
  const [telefoneTeste, setTelefoneTeste] = useState("");

  const destinatariosQ = useResumoDestinatarios();
  const enviosQ = useResumoEnvios();
  const previewQ = useResumoPreview(modelo);
  const { adicionar, alternar, remover } = useResumoDestinatarioMutations();
  const enviarTeste = useEnviarResumoTeste();

  const preview = useMemo(() => {
    if (!previewQ.data) return null;
    const primeiro = destinatariosQ.data?.find((d) => d.ativo)?.nome ?? "Paulo";
    return montarMensagemResumo(modelo, previewQ.data.dados, previewQ.data.segunda, primeiro);
  }, [previewQ.data, modelo, destinatariosQ.data]);

  const adicionarDestinatario = () => {
    if (!normalizarTelefoneBR(whatsapp)) {
      toast.error("WhatsApp inválido", { description: "Use DDD + número, ex.: 11 91234-5678." });
      return;
    }
    adicionar.mutate(
      { nome, whatsapp },
      {
        onSuccess: () => {
          setNome("");
          setWhatsapp("");
          toast.success("Destinatário adicionado");
        },
      },
    );
  };

  const dispararTeste = () => {
    const normalizado = normalizarTelefoneBR(telefoneTeste);
    if (!normalizado) {
      toast.error("WhatsApp inválido", { description: "Use DDD + número, ex.: 11 91234-5678." });
      return;
    }
    enviarTeste.mutate(
      { whatsapp: normalizado, modelo },
      {
        onSuccess: (r) => {
          setTesteAberto(false);
          if (r.enviados > 0) toast.success("Teste enviado", { description: `Modelo de ${TIPO_LABEL[modelo].toLowerCase()} enviado para ${normalizado}.` });
          else toast.warning("Teste não enviado", { description: r.resultados?.[0]?.erro ?? r.aviso ?? "Verifique a Z-API." });
        },
        onError: (e) =>
          toast.error("Não foi possível enviar o teste", { description: e instanceof Error ? e.message : undefined }),
      },
    );
  };

  return (
    <Panel
      eyebrow="Automação"
      title="Resumo automático por WhatsApp"
      subtitle="Segunda 08:00 (abertura) e sexta 17:00 (fechamento), gerados a partir do sistema"
      action={
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTesteAberto(true)}>
          <Send className="h-3.5 w-3.5" /> Enviar teste para mim
        </Button>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-5">
        <div className="space-y-5">
          <section aria-label="Destinatários">
            <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-35 mb-2">Destinatários</p>
            {destinatariosQ.isPending ? (
              <InlineEmpty>Carregando...</InlineEmpty>
            ) : (destinatariosQ.data?.length ?? 0) === 0 ? (
              <InlineEmpty>Nenhum destinatário. Adicione quem deve receber o resumo.</InlineEmpty>
            ) : (
              <ul className="divide-y divide-ink-06 rounded-lg border border-ink-06">
                {destinatariosQ.data!.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-semibold truncate", d.ativo ? "text-ink" : "text-ink-35")}>{d.nome || "Sem nome"}</p>
                      <p className="text-[11px] text-ink-35 tabular-nums">{d.whatsapp}</p>
                    </div>
                    <Switch
                      checked={d.ativo}
                      onCheckedChange={(ativo) => alternar.mutate({ id: d.id, ativo })}
                      aria-label={`${d.ativo ? "Desativar" : "Ativar"} ${d.nome || d.whatsapp}`}
                    />
                    <button
                      type="button"
                      onClick={() => remover.mutate(d.id)}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-ink-35 hover:text-dash-red hover:bg-dash-red/10"
                      aria-label={`Remover ${d.nome || d.whatsapp}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <div className="space-y-1">
                <Label htmlFor="resumo-dest-nome" className="text-[11px]">Nome</Label>
                <Input id="resumo-dest-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Paulo" className="h-9" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="resumo-dest-whats" className="text-[11px]">WhatsApp</Label>
                <Input id="resumo-dest-whats" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="11 91234-5678" className="h-9" />
              </div>
              <Button size="sm" className="h-9 gap-1" onClick={adicionarDestinatario} disabled={adicionar.isPending || !whatsapp.trim()}>
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
          </section>

          <section aria-label="Últimos envios">
            <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-35 mb-2">Últimos envios</p>
            {enviosQ.isPending ? (
              <InlineEmpty>Carregando...</InlineEmpty>
            ) : (enviosQ.data?.length ?? 0) === 0 ? (
              <InlineEmpty>Nenhum envio registrado ainda.</InlineEmpty>
            ) : (
              <ul className="divide-y divide-ink-06 rounded-lg border border-ink-06">
                {enviosQ.data!.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-xs" title={e.erro ?? undefined}>
                    <CountChip tom={e.status === "sucesso" ? "green" : "red"}>{e.status === "sucesso" ? "ok" : "falha"}</CountChip>
                    <span className="font-semibold text-ink">{TIPO_LABEL[e.tipo] ?? e.tipo}</span>
                    <span className="text-ink-35 tabular-nums">{e.destinatario}</span>
                    <span className="ml-auto text-ink-35 tabular-nums whitespace-nowrap">
                      {new Date(e.executado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-label="Prévia da mensagem" className="min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-35">Prévia</p>
            <Select value={modelo} onValueChange={(v) => setModelo(v as ModeloResumo)}>
              <SelectTrigger className="h-8 w-[170px] text-xs" aria-label="Modelo da prévia">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="segunda">Segunda (abertura)</SelectItem>
                <SelectItem value="sexta">Sexta (fechamento)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {previewQ.isPending ? (
            <InlineEmpty>Gerando prévia com os dados atuais...</InlineEmpty>
          ) : previewQ.isError ? (
            <p className="text-xs text-destructive">
              Não foi possível gerar a prévia: {previewQ.error instanceof Error ? previewQ.error.message : "erro"}
            </p>
          ) : (
            <pre className="whitespace-pre-wrap rounded-xl border border-ink-06 bg-ink-03 p-4 text-[12px] leading-relaxed text-ink font-sans max-h-[520px] overflow-y-auto">
              {preview}
            </pre>
          )}
          {modelo === "sexta" && previewQ.data && !previewQ.data.segunda && (
            <p className="mt-2 text-[11px] text-amber-700">
              Sem foto de segunda registrada nesta semana — o comparativo aparece sem variação.
            </p>
          )}
        </section>
      </div>

      <Dialog open={testeAberto} onOpenChange={setTesteAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enviar teste para mim</DialogTitle>
            <DialogDescription>
              Envia o modelo de {TIPO_LABEL[modelo].toLowerCase()} com os dados de agora para o número informado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="resumo-teste-whats">Seu WhatsApp</Label>
            <Input
              id="resumo-teste-whats"
              value={telefoneTeste}
              onChange={(e) => setTelefoneTeste(e.target.value)}
              placeholder="11 91234-5678"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTesteAberto(false)} disabled={enviarTeste.isPending}>Cancelar</Button>
            <Button onClick={dispararTeste} disabled={enviarTeste.isPending || !telefoneTeste.trim()} className="gap-2">
              <Send className="h-4 w-4" />
              {enviarTeste.isPending ? "Enviando..." : "Enviar teste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
