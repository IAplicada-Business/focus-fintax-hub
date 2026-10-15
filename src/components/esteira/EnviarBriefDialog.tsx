import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  canaisDisponiveis,
  montarAssuntoBrief,
  montarHtmlBrief,
  montarTextoBriefWhatsapp,
  resumirEnvioBrief,
  type CanalBrief,
  type ResultadoBrief,
} from "@/lib/brief-cliente";
import { enviarBriefCliente, getClienteContatoBrief } from "@/services/briefClienteService";

interface Props {
  cliente: { id: string; empresa: string } | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Enviar brief" (Lote 3C): boas-vindas ao CLIENTE quando o contrato é
 * assinado. Mostra e deixa editar o WhatsApp e o e-mail antes de enviar;
 * canais vêm pré-marcados só quando o cliente tem o contato cadastrado.
 */
export function EnviarBriefDialog({ cliente, onOpenChange }: Props) {
  const open = !!cliente;
  const [canais, setCanais] = useState<CanalBrief[]>([]);
  const [texto, setTexto] = useState("");
  const [assunto, setAssunto] = useState("");
  const [html, setHtml] = useState("");
  const [verHtml, setVerHtml] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoBrief | null>(null);

  const contatoQ = useQuery({
    queryKey: ["brief-cliente", "contato", cliente?.id],
    queryFn: () => getClienteContatoBrief(cliente!.id),
    enabled: open,
    staleTime: 60_000,
  });
  const contato = contatoQ.data;
  const disponiveis = useMemo(() => (contato ? canaisDisponiveis(contato) : []), [contato]);

  // Reinicia tudo quando abre pra outro cliente; os textos partem do modelo.
  useEffect(() => {
    if (!open) return;
    setResultado(null);
    setVerHtml(false);
  }, [open, cliente?.id]);

  useEffect(() => {
    if (!contato) return;
    setCanais(canaisDisponiveis(contato));
    setTexto(montarTextoBriefWhatsapp(contato));
    setAssunto(montarAssuntoBrief(contato));
    setHtml(montarHtmlBrief(contato));
  }, [contato]);

  const alternarCanal = (canal: CanalBrief, marcado: boolean) =>
    setCanais((prev) => (marcado ? [...new Set([...prev, canal])] : prev.filter((c) => c !== canal)));

  const enviar = async () => {
    if (!cliente || canais.length === 0) return;
    setEnviando(true);
    try {
      const r = await enviarBriefCliente({
        clienteId: cliente.id,
        canais,
        textoWhatsapp: canais.includes("whatsapp") ? texto : undefined,
        assunto: canais.includes("email") ? assunto : undefined,
        html: canais.includes("email") ? html : undefined,
      });
      setResultado(r);
      const resumo = resumirEnvioBrief(r, canais);
      (resumo.algumEnviado ? toast.success : toast.warning)(resumo.titulo, { description: resumo.detalhe });
      if (resumo.algumEnviado) onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível enviar o brief", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setEnviando(false);
    }
  };

  const semContato = contato && disponiveis.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Enviar brief de boas-vindas</DialogTitle>
          <DialogDescription>
            {cliente?.empresa} · mensagem ao cliente após a assinatura do contrato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1 max-h-[70vh] overflow-y-auto pr-1">
          {contatoQ.isPending && <p className="text-xs text-ink-35">Carregando contato do cliente...</p>}
          {contatoQ.isError && <p className="text-xs text-destructive">Não foi possível carregar o contato do cliente.</p>}

          {contato && (
            <>
              <div className="flex flex-wrap gap-4" role="group" aria-label="Canais">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={canais.includes("whatsapp")}
                    onCheckedChange={(v) => alternarCanal("whatsapp", v === true)}
                    disabled={!disponiveis.includes("whatsapp")}
                    aria-label="WhatsApp"
                  />
                  WhatsApp
                  <span className="text-xs text-ink-35">{contato.whatsapp?.trim() || "sem número cadastrado"}</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={canais.includes("email")}
                    onCheckedChange={(v) => alternarCanal("email", v === true)}
                    disabled={!disponiveis.includes("email")}
                    aria-label="E-mail"
                  />
                  E-mail
                  <span className="text-xs text-ink-35">{contato.email?.trim() || "sem e-mail cadastrado"}</span>
                </label>
              </div>
              {semContato && (
                <p className="text-xs text-amber-700">
                  Cliente sem WhatsApp e sem e-mail cadastrados. Preencha o contato na ficha do cliente antes de enviar.
                </p>
              )}

              {canais.includes("whatsapp") && (
                <div className="space-y-1.5">
                  <Label htmlFor="brief-whatsapp">Mensagem de WhatsApp</Label>
                  <Textarea id="brief-whatsapp" rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} className="text-[13px] leading-relaxed" />
                </div>
              )}

              {canais.includes("email") && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="brief-assunto">Assunto do e-mail</Label>
                    <Input id="brief-assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="brief-html">Corpo do e-mail</Label>
                      <button type="button" className="text-[11px] font-semibold text-gold-deep hover:underline" onClick={() => setVerHtml((v) => !v)}>
                        {verHtml ? "Ver prévia" : "Editar HTML"}
                      </button>
                    </div>
                    {verHtml ? (
                      <Textarea id="brief-html" rows={12} value={html} onChange={(e) => setHtml(e.target.value)} className="font-mono text-[11px]" />
                    ) : (
                      <iframe
                        title="Prévia do e-mail"
                        srcDoc={html}
                        sandbox=""
                        className="w-full h-[360px] rounded-lg border border-ink-06 bg-white"
                      />
                    )}
                  </div>
                </div>
              )}

              {resultado && (
                <p className="text-xs text-ink-60" role="status">
                  {resumirEnvioBrief(resultado, canais).detalhe}
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando || !contato || canais.length === 0} className="gap-2">
            <Send className="h-4 w-4" />
            {enviando ? "Enviando..." : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
