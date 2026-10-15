import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Smartphone, Unplug } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const WHATSAPP_STATUS_KEY = ["atendimento", "zapi-status"] as const;

const QR_REFRESH_MS = 20_000;
const MAX_AUTO_QR = 3;

type StatusConexao = {
  ok: boolean;
  configured: boolean;
  connected: boolean;
  smartphoneConnected: boolean;
  detail: string | null;
};

type QrResposta =
  | { ok: true; kind: "qr"; value: string }
  | { ok: true; kind: "already_connected" }
  | { ok: true; kind: "challenge"; message: string };

async function pedirConexao(acao: "status" | "qr" | "desconectar") {
  const { data, error } = await supabase.functions.invoke("atendimento-zapi/conexao", {
    body: { acao },
  });
  if (error) throw error;
  if (data && data.ok === false) {
    throw new Error(data.motivo || "Falha ao falar com a instância");
  }
  return data;
}

export function useWhatsappConexao() {
  return useQuery({
    queryKey: WHATSAPP_STATUS_KEY,
    queryFn: () => pedirConexao("status") as Promise<StatusConexao>,
    staleTime: 15_000,
    retry: false,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d?.configured) return false;
      return d.connected ? 60_000 : 8_000;
    },
  });
}

export function WhatsAppConexao() {
  const qc = useQueryClient();
  const statusQ = useWhatsappConexao();
  const [open, setOpen] = useState(false);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const autoCount = useRef(0);

  const configured = Boolean(statusQ.data?.configured);
  const connected = Boolean(statusQ.data?.connected);

  async function loadQr(reason: "open" | "manual" | "auto") {
    setQrLoading(true);
    setQrError(null);
    try {
      const res = (await pedirConexao("qr")) as QrResposta;
      if (res.kind === "already_connected") {
        setQrValue(null);
        await qc.invalidateQueries({ queryKey: WHATSAPP_STATUS_KEY });
        if (reason !== "auto") toast.success("WhatsApp já está conectado");
        return;
      }
      if (res.kind === "challenge") {
        setQrValue(null);
        setQrError(res.message);
        return;
      }
      setQrValue(res.value);
      if (reason === "manual") autoCount.current = 0;
    } catch (e) {
      setQrValue(null);
      setQrError(e instanceof Error ? e.message : "Falha ao gerar o QR code");
    } finally {
      setQrLoading(false);
    }
  }

  useEffect(() => {
    if (!open) {
      setQrValue(null);
      setQrError(null);
      autoCount.current = 0;
      return;
    }
    void (async () => {
      const st = (await pedirConexao("status").catch(() => null)) as StatusConexao | null;
      await qc.invalidateQueries({ queryKey: WHATSAPP_STATUS_KEY });
      if (st?.configured && !st.connected) await loadQr("open");
    })();
    // Só ao abrir o diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !configured || connected || !qrValue) return;
    if (autoCount.current >= MAX_AUTO_QR) return;
    const t = window.setInterval(() => {
      if (autoCount.current >= MAX_AUTO_QR) return;
      autoCount.current += 1;
      void loadQr("auto");
    }, QR_REFRESH_MS);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, configured, connected, qrValue]);

  useEffect(() => {
    if (open && connected) setQrValue(null);
  }, [open, connected]);

  async function desconectar() {
    setDesconectando(true);
    try {
      await pedirConexao("desconectar");
      toast.success("WhatsApp desconectado");
      await qc.invalidateQueries({ queryKey: WHATSAPP_STATUS_KEY });
      await loadQr("manual");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível desconectar");
    } finally {
      setDesconectando(false);
    }
  }

  const rotulo = statusQ.isLoading
    ? "Verificando"
    : !statusQ.data
      ? "Instância"
      : !configured
        ? "Sem Z-API"
        : connected
          ? "Conectado"
          : "Desconectado";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted"
        title="Ver se a instância está conectada e gerar o QR code"
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            connected ? "bg-emerald-500" : configured ? "bg-amber-500" : "bg-muted-foreground",
          )}
        />
        {rotulo}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Escaneie o QR no celular em Aparelhos conectados. A instância é a mesma que envia as mensagens do atendimento.
            </DialogDescription>
          </DialogHeader>

          {statusQ.isError ? (
            <div className="space-y-2 rounded-md border bg-muted/40 p-4 text-sm">
              <p className="font-medium">Não foi possível consultar a instância</p>
              <p className="text-xs text-muted-foreground">
                {statusQ.error instanceof Error ? statusQ.error.message : "A função de atendimento não respondeu."}
              </p>
            </div>
          ) : statusQ.data && !statusQ.data.configured ? (
            <div className="space-y-2 rounded-md border bg-muted/40 p-4 text-sm">
              <p className="font-medium">Credenciais da Z-API ainda não estão na função</p>
              <p className="text-xs text-muted-foreground">
                Defina ZAPI_INSTANCE_ID, ZAPI_TOKEN e ZAPI_CLIENT_TOKEN nos secrets de atendimento-zapi. Sem isso o painel da Z-API pode mostrar a instância conectada e o sistema continua sem enviar.
              </p>
            </div>
          ) : connected ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Smartphone className="h-6 w-6" />
              </div>
              <p className="font-medium">Instância conectada</p>
              {statusQ.data?.smartphoneConnected === false && (
                <p className="text-sm text-amber-700">O celular parece offline. Confira a internet do aparelho.</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="flex h-[240px] w-[240px] items-center justify-center rounded-md border bg-white p-3">
                {qrLoading && !qrValue ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : qrValue ? (
                  <img src={qrValue} alt="QR Code do WhatsApp" className="h-[220px] w-[220px] object-contain" />
                ) : (
                  <p className="max-w-[200px] text-center text-sm text-muted-foreground">
                    {qrError ?? "Toque em gerar QR code"}
                  </p>
                )}
              </div>
              {qrError && qrValue && <p className="text-center text-xs text-destructive">{qrError}</p>}
              <p className="text-center text-xs text-muted-foreground">O QR expira em cerca de 20 segundos.</p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {configured && connected ? (
              <Button variant="outline" disabled={desconectando} onClick={() => void desconectar()}>
                <Unplug className="mr-2 h-4 w-4" />
                Desconectar
              </Button>
            ) : configured ? (
              <Button
                variant="outline"
                disabled={qrLoading}
                onClick={() => {
                  autoCount.current = 0;
                  void loadQr("manual");
                }}
              >
                {qrLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Gerar QR code
              </Button>
            ) : (
              <span />
            )}
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
