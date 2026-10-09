import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Bot, Users, Paperclip, Mic, Square, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toastError } from "@/lib/handle-error";
import { useAuth } from "@/hooks/useAuth";

const BUCKET = "atendimento-midia";
// 15 MB — mesmo limite configurado no bucket (migration 20261009090000).
const LIMITE_ANEXO_BYTES = 15 * 1024 * 1024;
// Signed URL de longa duração: midia_url fica gravado para sempre em
// atendimento_mensagens (é o que a Z-API busca e o que a própria tela usa
// depois pra exibir o anexo), então não pode expirar em pouco tempo como uma
// signed URL "normal". Trade-off documentado no CRM_UPGRADE_NOTES.md.
const SIGNED_URL_TTL_SEGUNDOS = 60 * 60 * 24 * 365 * 5; // 5 anos

type TipoAnexo = "imagem" | "audio" | "documento" | "outro";

function tipoPorMime(mime: string): TipoAnexo {
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || mime.includes("word") || mime.includes("excel") || mime.includes("sheet")) {
    return "documento";
  }
  return "outro";
}

function extensaoDoArquivo(file: File): string {
  const doNome = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : null;
  if (doNome && doNome.length <= 5) return doNome;
  const doMime = file.type.split("/")[1]?.split(";")[0]?.toLowerCase();
  return doMime && doMime.length <= 5 ? doMime : "bin";
}

// --- Gravação de áudio -------------------------------------------------
// O WhatsApp só reconhece áudio de voz em opus (ogg/webm). Sem escolher o
// formato, alguns navegadores gravam em algo que a Z-API entrega como
// arquivo pra baixar, sem player — por isso a conversão pra WAV abaixo
// quando o navegador não suporta opus. Mesma lógica usada em produção no
// projeto bz-advocacia (src/components/leads/ConversaBot.tsx).
function escolherFormatoAudio(): string {
  const preferidos = ["audio/ogg;codecs=opus", "audio/ogg", "audio/webm;codecs=opus", "audio/webm"];
  for (const tipo of preferidos) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(tipo)) {
      return tipo;
    }
  }
  return "";
}

function codificarWav(buffer: AudioBuffer): Blob {
  const canais = Math.min(buffer.numberOfChannels, 2);
  const amostras = buffer.length;
  const bloco = canais * 2;
  const tamanho = 44 + amostras * bloco;
  const view = new DataView(new ArrayBuffer(tamanho));
  const texto = (pos: number, valor: string) => {
    for (let i = 0; i < valor.length; i++) view.setUint8(pos + i, valor.charCodeAt(i));
  };
  texto(0, "RIFF");
  view.setUint32(4, tamanho - 8, true);
  texto(8, "WAVE");
  texto(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, canais, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * bloco, true);
  view.setUint16(32, bloco, true);
  view.setUint16(34, 16, true);
  texto(36, "data");
  view.setUint32(40, amostras * bloco, true);

  const dados: Float32Array[] = [];
  for (let c = 0; c < canais; c++) dados.push(buffer.getChannelData(c));
  let pos = 44;
  for (let i = 0; i < amostras; i++) {
    for (let c = 0; c < canais; c++) {
      const amostra = Math.max(-1, Math.min(1, dados[c][i]));
      view.setInt16(pos, amostra < 0 ? amostra * 0x8000 : amostra * 0x7fff, true);
      pos += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}

async function converterParaWav(blob: Blob): Promise<Blob> {
  const AudioContextCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextCtor();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return codificarWav(buffer);
  } finally {
    ctx.close();
  }
}

function formatarDuracao(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

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
  const [anexo, setAnexo] = useState<{ file: File; tipo: TipoAnexo; previewUrl: string | null } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [segundosGravando, setSegundosGravando] = useState(0);
  const fimRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

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

  // --- Anexo (arquivo escolhido ou áudio gravado) ------------------------
  const limparAnexo = () => {
    if (anexo?.previewUrl) URL.revokeObjectURL(anexo.previewUrl);
    setAnexo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selecionarArquivo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > LIMITE_ANEXO_BYTES) {
      toastError(new Error(`Arquivo maior que ${LIMITE_ANEXO_BYTES / (1024 * 1024)} MB`), "Anexo recusado");
      return;
    }
    setAnexo({
      file,
      tipo: tipoPorMime(file.type),
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    });
  };

  const limparTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const formato = escolherFormatoAudio();
      const rec = formato ? new MediaRecorder(stream, { mimeType: formato }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = rec.mimeType || formato || "audio/ogg";
        let blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size === 0) {
          toastError(new Error("Verifique o microfone e tente de novo"), "Não gravou áudio");
          return;
        }
        let ext = mime.includes("ogg") ? "ogg" : mime.includes("webm") ? "webm" : "";
        // A Z-API entrega webm como arquivo pra baixar (sem player) mesmo com
        // opus — convertendo pra WAV garante que vira nota de voz tocável.
        if (ext !== "ogg") {
          try {
            blob = await converterParaWav(blob);
            ext = "wav";
          } catch {
            ext = ext || "webm";
          }
        }
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
        setAnexo({ file, tipo: "audio", previewUrl: URL.createObjectURL(blob) });
      };
      rec.start();
      recorderRef.current = rec;
      setSegundosGravando(0);
      setGravando(true);
      timerRef.current = window.setInterval(() => setSegundosGravando((s) => s + 1), 1000);
    } catch {
      toastError(new Error("Verifique a permissão do navegador"), "Não foi possível acessar o microfone");
    }
  };

  const pararGravacao = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    limparTimer();
    setGravando(false);
  };

  const cancelarGravacao = () => {
    const rec = recorderRef.current;
    if (rec) {
      rec.onstop = null;
      rec.stop();
      rec.stream?.getTracks().forEach((t) => t.stop());
    }
    recorderRef.current = null;
    chunksRef.current = [];
    limparTimer();
    setGravando(false);
    setSegundosGravando(0);
  };

  useEffect(() => () => limparTimer(), []);

  const enviar = async () => {
    const corpo = texto.trim();
    if ((!corpo && !anexo) || !telefone || enviando) return;
    setEnviando(true);

    let tipoMsg: string = "texto";
    let midiaUrl: string | null = null;

    if (anexo) {
      const ext = extensaoDoArquivo(anexo.file);
      const caminho = `${telefone}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(caminho, anexo.file, { contentType: anexo.file.type || "application/octet-stream", upsert: false });
      if (upErr) {
        setEnviando(false);
        toastError(upErr, "Não foi possível subir o anexo");
        return;
      }
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(caminho, SIGNED_URL_TTL_SEGUNDOS);
      if (signErr || !signed?.signedUrl) {
        setEnviando(false);
        toastError(signErr ?? new Error("Signed URL vazia"), "Anexo subiu, mas não gerou o link");
        return;
      }
      tipoMsg = anexo.tipo;
      midiaUrl = signed.signedUrl;
    }

    // Insere como 'pendente'. O trigger de banco (atendimento_disparar_envio)
    // chama a Edge Function atendimento-zapi/enviar, que fala com a Z-API e
    // atualiza o status — o token da Z-API não pode passar pelo browser.
    const { error } = await (supabase as unknown as {
      from: (t: string) => { insert: (v: Record<string, unknown>) => Promise<{ error: unknown }> };
    })
      .from("atendimento_mensagens")
      .insert({
        telefone,
        direcao: "saida",
        texto: corpo || null,
        tipo: tipoMsg,
        midia_url: midiaUrl,
        status: "pendente",
        autor_id: user?.id,
      });

    setEnviando(false);
    if (error) {
      toastError(error, "Não foi possível enviar a mensagem");
      return;
    }
    setTexto("");
    limparAnexo();
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
                {m.tipo === "imagem" && m.midia_url && (
                  <a href={m.midia_url} target="_blank" rel="noreferrer" className="block mb-1">
                    <img
                      src={m.midia_url}
                      alt="Imagem enviada"
                      loading="lazy"
                      className="max-h-48 max-w-full rounded-md object-cover"
                    />
                  </a>
                )}
                {m.tipo === "audio" && m.midia_url && (
                  <audio controls src={m.midia_url} className="mb-1 h-8 max-w-full" preload="none" />
                )}
                {m.tipo !== "texto" && m.tipo !== "imagem" && m.tipo !== "audio" && (
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

      <div className="border-t p-4 space-y-2">
        {anexo && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
            {anexo.previewUrl && anexo.tipo === "imagem" ? (
              <img src={anexo.previewUrl} alt="Pré-visualização" className="h-10 w-10 rounded object-cover shrink-0" />
            ) : anexo.tipo === "audio" && anexo.previewUrl ? (
              <audio controls src={anexo.previewUrl} className="h-8 max-w-[200px]" />
            ) : (
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            )}
            <p className="text-[11px] flex-1 truncate text-muted-foreground">{anexo.file.name}</p>
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={limparAnexo} title="Remover anexo">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {gravando ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse shrink-0" aria-hidden />
            <p className="text-xs flex-1">Gravando áudio... {formatarDuracao(segundosGravando)}</p>
            <Button size="sm" variant="ghost" onClick={cancelarGravacao} title="Cancelar">
              Cancelar
            </Button>
            <Button size="sm" onClick={pararGravacao} title="Parar e anexar">
              <Square className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
              onChange={(e) => selecionarArquivo(e.target.files?.[0])}
            />
            <Button
              size="icon"
              variant="outline"
              className="shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={enviando}
              title="Anexar arquivo"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="shrink-0"
              onClick={iniciarGravacao}
              disabled={enviando || Boolean(anexo)}
              title="Gravar áudio"
            >
              <Mic className="h-4 w-4" />
            </Button>
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
            <Button size="sm" onClick={enviar} disabled={(!texto.trim() && !anexo) || enviando} title="Enviar">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
