import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Bot, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toastError } from "@/lib/handle-error";
import { useAuth } from "@/hooks/useAuth";

export interface AtendimentoMensagem {
  id: string;
  direcao: "entrada" | "saida";
  texto: string | null;
  tipo: "texto" | "imagem" | "audio" | "documento" | "outro";
  midia_url: string | null;
  status: "recebida" | "pendente" | "enviada" | "falha";
  origem: "humano" | "bot";
  erro: string | null;
  criado_em: string;
}

interface Conversa {
  telefone: string | null;
  bot_ativo: boolean;
  leads_compartilhando: number;
  mensagens: AtendimentoMensagem[];
}

/** Rótulo do que não é texto. Mensagem feia é melhor que mensagem que some. */
const TIPO_LABEL: Record<string, string> = {
  imagem: "🖼️ Imagem",
  audio: "🎤 Áudio",
  documento: "📎 Documento",
  outro: "📦 Anexo",
};

function horaCurta(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Conversa de WhatsApp de um lead.
 *
 * O telefone normalizado NUNCA é calculado aqui: vem da RPC atendimento_conversa,
 * junto com as mensagens. Se a UI tivesse a própria cópia da regra de
 * normalização, ela divergiria da do banco e a conversa apareceria vazia sem
 * ninguém entender por quê.
 */
export default function AtendimentoTab({ whatsapp }: { whatsapp: string | null }) {
  const { user } = useAuth();
  const [conversa, setConversa] = useState<Conversa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    if (!whatsapp) {
      setConversa(null);
      setCarregando(false);
      return;
    }
    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, string>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc("atendimento_conversa", { p_whatsapp: whatsapp });

    if (error) {
      toastError(error, "Não foi possível carregar a conversa");
      setCarregando(false);
      return;
    }
    const bruto = Array.isArray(data) ? data[0] : data;
    setConversa(bruto as Conversa);
    setCarregando(false);
  }, [whatsapp]);

  useEffect(() => {
    setCarregando(true);
    carregar();
  }, [carregar]);

  // Realtime filtrado pelo telefone que a RPC devolveu — não por um valor que a
  // UI tenha calculado.
  const telefone = conversa?.telefone ?? null;
  useEffect(() => {
    if (!telefone) return;
    const canal = supabase
      .channel(`atendimento-${telefone}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atendimento_mensagens", filter: `telefone=eq.${telefone}` },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [telefone, carregar]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversa?.mensagens.length]);

  const alternarBot = async (ligado: boolean) => {
    if (!telefone) return;
    // Otimista: o switch responde na hora e o realtime confirma depois.
    setConversa((c) => (c ? { ...c, bot_ativo: ligado } : c));
    const { error } = await (supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => Promise<{ error: unknown }>;
        };
      };
    })
      .from("atendimento_conversas")
      .update({ bot_ativo: ligado, atualizado_em: new Date().toISOString() })
      .eq("telefone", telefone);

    if (error) {
      toastError(error, "Não foi possível alterar o robô");
      carregar();
    }
  };

  const enviar = async () => {
    const corpo = texto.trim();
    if (!corpo || !telefone || enviando) return;
    setEnviando(true);

    // Insere como 'pendente'. O trigger avisa o n8n, que envia pela Z-API e
    // atualiza o status — o token não pode passar pelo browser.
    const { error } = await (supabase as unknown as {
      from: (t: string) => { insert: (v: Record<string, unknown>) => Promise<{ error: unknown }> };
    })
      .from("atendimento_mensagens")
      .insert({
        telefone,
        direcao: "saida",
        texto: corpo,
        status: "pendente",
        autor_id: user?.id,
      });

    setEnviando(false);
    if (error) {
      toastError(error, "Não foi possível enviar a mensagem");
      return;
    }
    setTexto("");
    carregar();
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!whatsapp || !conversa?.telefone) {
    return (
      <div className="p-6 text-center space-y-1">
        <p className="text-sm font-medium text-foreground">Sem WhatsApp válido</p>
        <p className="text-xs text-muted-foreground">
          Cadastre um número no lead para abrir a conversa.
        </p>
      </div>
    );
  }

  const { mensagens, leads_compartilhando: compartilhando } = conversa;

  return (
    <div className="flex flex-col h-full min-h-0">
      {compartilhando > 1 && (
        <div className="mx-6 mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2">
          <Users className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
          <p className="text-[11px] text-amber-800">
            Este número aparece em <strong>{compartilhando} registros de lead</strong>. A conversa é
            a mesma pessoa, então ela aparece igual em todos.
          </p>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-6 space-y-2">
        {mensagens.length === 0 && (
          <p className="py-12 text-center text-xs text-muted-foreground">
            Nenhuma mensagem ainda. O histórico começa quando o lead escrever ou você enviar.
          </p>
        )}

        {mensagens.map((m) => {
          const minha = m.direcao === "saida";
          return (
            <div key={m.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 ${
                  minha ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                } ${m.status === "falha" ? "border border-destructive" : ""}`}
              >
                {m.tipo !== "texto" && (
                  <p className="text-[11px] font-medium opacity-80">
                    {TIPO_LABEL[m.tipo] || TIPO_LABEL.outro}
                    {m.midia_url && (
                      <>
                        {" · "}
                        <a href={m.midia_url} target="_blank" rel="noreferrer" className="underline">
                          abrir
                        </a>
                      </>
                    )}
                  </p>
                )}
                {minha && m.origem === "bot" && (
                  <p className="text-[10px] font-semibold opacity-80 flex items-center gap-1">
                    <Bot className="h-3 w-3" aria-hidden /> Robô
                  </p>
                )}
                {m.texto && <p className="text-xs whitespace-pre-wrap break-words">{m.texto}</p>}
                <div className="mt-0.5 flex items-center gap-1 justify-end">
                  <span className="text-[10px] opacity-70">{horaCurta(m.criado_em)}</span>
                  {minha && m.status === "pendente" && (
                    <span className="text-[10px] opacity-70">· enviando</span>
                  )}
                  {minha && m.status === "falha" && (
                    <span className="text-[10px] font-semibold text-destructive" title={m.erro || ""}>
                      · falhou
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      <div className="mx-6 mt-2 flex items-center gap-2 rounded-md border bg-muted/40 p-2">
        <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
        <Label htmlFor="bot-switch" className="text-[11px] flex-1 cursor-pointer">
          Robô SDR nesta conversa
          {conversa.bot_ativo && (
            <span className="block text-[10px] text-muted-foreground">
              Responder aqui assume o atendimento e desliga o robô.
            </span>
          )}
        </Label>
        <Switch
          id="bot-switch"
          checked={conversa.bot_ativo}
          onCheckedChange={alternarBot}
        />
      </div>

      <div className="border-t p-4 flex items-end gap-2">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder="Escreva uma mensagem... (Enter envia, Shift+Enter quebra linha)"
          className="min-h-[60px] max-h-[140px] text-xs resize-none"
        />
        <Button size="sm" onClick={enviar} disabled={!texto.trim() || enviando} title="Enviar">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
