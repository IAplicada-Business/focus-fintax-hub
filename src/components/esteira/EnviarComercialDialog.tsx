import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  enviarParaEquipeComercial,
  listDestinatariosComerciais,
  resumirEnvioComercial,
  type DestinoEnvioComercial,
} from "@/services/equipeComercialService";

interface Props {
  cliente: { id: string; empresa: string } | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Enviar para equipe comercial" (card da Triagem): WhatsApp + e-mail
 * automáticos para todo o time comercial (padrão) ou para um comercial —
 * já sugerindo quem trouxe o lead.
 */
export function EnviarComercialDialog({ cliente, onOpenChange }: Props) {
  const open = !!cliente;
  const [destino, setDestino] = useState<DestinoEnvioComercial>("todos");
  const [comercialId, setComercialId] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);

  const destinatariosQ = useQuery({
    queryKey: ["equipe-comercial", "destinatarios", cliente?.id],
    queryFn: () => listDestinatariosComerciais(cliente!.id),
    enabled: open,
    staleTime: 60_000,
  });
  const destinatarios = useMemo(() => destinatariosQ.data ?? [], [destinatariosQ.data]);

  useEffect(() => {
    if (!open) return;
    setDestino("todos");
    setObservacao("");
    setComercialId("");
  }, [open, cliente?.id]);

  useEffect(() => {
    if (comercialId || destinatarios.length === 0) return;
    const origem = destinatarios.find((d) => d.trouxe_o_lead);
    setComercialId(origem?.user_id ?? destinatarios[0].user_id);
  }, [destinatarios, comercialId]);

  const alvo = destino === "todos" ? destinatarios : destinatarios.filter((d) => d.user_id === comercialId);
  const semWhats = alvo.filter((d) => !d.tem_whatsapp).map((d) => d.full_name || "Sem nome");

  const enviar = async () => {
    if (!cliente) return;
    if (destino === "especifico" && !comercialId) {
      toast.error("Escolha o comercial que vai receber.");
      return;
    }
    setEnviando(true);
    try {
      const resultados = await enviarParaEquipeComercial({
        clienteId: cliente.id,
        destino,
        comercialId,
        observacao,
      });
      const resumo = resumirEnvioComercial(resultados);
      (resumo.algumEnviado ? toast.success : toast.warning)(resumo.titulo, { description: resumo.detalhe });
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível enviar para a equipe comercial", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar para equipe comercial</DialogTitle>
          <DialogDescription>
            {cliente?.empresa} · aviso automático por WhatsApp e e-mail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <RadioGroup
            value={destino}
            onValueChange={(v) => setDestino(v as DestinoEnvioComercial)}
            className="gap-2"
            aria-label="Para quem enviar"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="todos" />
              Para todos os comerciais
              {destinatarios.length > 0 && (
                <span className="text-xs text-muted-foreground">({destinatarios.length})</span>
              )}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="especifico" />
              Para um comercial específico
            </label>
          </RadioGroup>

          {destino === "especifico" && (
            <div className="space-y-1.5">
              <Label>Comercial</Label>
              <Select value={comercialId} onValueChange={setComercialId}>
                <SelectTrigger aria-label="Comercial">
                  <SelectValue placeholder={destinatariosQ.isPending ? "Carregando..." : "Escolha o comercial"} />
                </SelectTrigger>
                <SelectContent>
                  {destinatarios.map((d) => (
                    <SelectItem key={d.user_id} value={d.user_id}>
                      {d.full_name || "Sem nome"}
                      {d.trouxe_o_lead ? " · trouxe o lead" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="obs-envio-comercial">Observação (opcional)</Label>
            <Textarea
              id="obs-envio-comercial"
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: triagem concluída, cliente pede retorno até sexta."
            />
          </div>

          {destinatariosQ.isError && (
            <p className="text-xs text-destructive">Não foi possível carregar a equipe comercial.</p>
          )}
          {!destinatariosQ.isPending && destinatarios.length === 0 && !destinatariosQ.isError && (
            <p className="text-xs text-muted-foreground">Nenhum usuário ativo com papel comercial.</p>
          )}
          {semWhats.length > 0 && (
            <p className="text-xs text-amber-700">
              Sem WhatsApp cadastrado (recebe só e-mail): {semWhats.join(", ")}. Cadastre em Usuários.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando || alvo.length === 0} className="gap-2">
            <Send className="h-4 w-4" />
            {enviando ? "Enviando..." : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
