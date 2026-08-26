import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bot, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { toastError } from "@/lib/handle-error";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface BotConfigRow {
  prompt: string;
  modelo: string;
  ativo_global: boolean;
  max_respostas: number;
}

function podeEditar(role: string | undefined | null): boolean {
  return role === "admin" || role === "gestor_comercial";
}

/**
 * Configuração do robô SDR.
 *
 * O prompt é editável de propósito — o time ajusta conforme lê as conversas
 * reais. Por isso mesmo as travas NÃO vivem no prompt: teto de respostas,
 * desligamento ao responder e o kill switch global estão no banco, e nenhuma
 * edição de texto aqui as remove.
 */
export default function BotConfigPage() {
  const { userRole } = useAuth();
  const editavel = podeEditar(userRole);

  const [cfg, setCfg] = useState<BotConfigRow | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);

  useEffect(() => {
    (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
      };
    })
      .from("bot_config")
      .select("prompt, modelo, ativo_global, max_respostas")
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) toastError(error, "Não foi possível carregar a configuração");
        else setCfg(data as BotConfigRow);
        setCarregando(false);
      });
  }, []);

  const alterar = <K extends keyof BotConfigRow>(campo: K, valor: BotConfigRow[K]) => {
    setCfg((c) => (c ? { ...c, [campo]: valor } : c));
    setSujo(true);
  };

  const salvar = async () => {
    if (!cfg) return;
    setSalvando(true);
    const { error } = await (supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: boolean) => Promise<{ error: unknown }>;
        };
      };
    })
      .from("bot_config")
      .update({
        prompt: cfg.prompt,
        modelo: cfg.modelo,
        ativo_global: cfg.ativo_global,
        max_respostas: cfg.max_respostas,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", true);

    setSalvando(false);
    if (error) {
      toastError(error, "Não foi possível salvar");
      return;
    }
    setSujo(false);
    toast.success("Configuração do robô salva");
  };

  if (carregando) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!cfg) {
    return <div className="p-6 text-sm text-muted-foreground">Configuração não encontrada.</div>;
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/pipeline">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Link>
        </Button>
        <h1 className="font-display text-xl font-bold text-navy flex items-center gap-2">
          <Bot className="h-5 w-5" aria-hidden /> Robô SDR
        </h1>
      </div>

      {/* Kill switch. Fica no topo porque é o que alguém procura com pressa. */}
      <div className="rounded-lg border p-4 flex items-start gap-3">
        <ShieldAlert
          className={`h-5 w-5 shrink-0 mt-0.5 ${cfg.ativo_global ? "text-emerald-600" : "text-muted-foreground"}`}
          aria-hidden
        />
        <div className="flex-1">
          <Label htmlFor="global" className="text-sm font-semibold cursor-pointer">
            Robô ligado no sistema todo
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Desligando aqui, o robô para em <strong>todas</strong> as conversas de uma vez, sem
            precisar abrir uma por uma. Mesmo ligado, ele só fala nas conversas em que o switch
            individual estiver ativo.
          </p>
        </div>
        <Switch
          id="global"
          checked={cfg.ativo_global}
          disabled={!editavel}
          onCheckedChange={(v) => alterar("ativo_global", v)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="max">Máximo de respostas por conversa</Label>
          <Input
            id="max"
            type="number"
            min={1}
            max={50}
            value={cfg.max_respostas}
            disabled={!editavel}
            onChange={(e) => alterar("max_respostas", Number(e.target.value))}
          />
          <p className="text-[11px] text-muted-foreground">
            Atingido o limite, o robô para e a conversa fica para um humano.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="modelo">Modelo</Label>
          <Input
            id="modelo"
            value={cfg.modelo}
            disabled={!editavel}
            onChange={(e) => alterar("modelo", e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Identificador da Anthropic. Padrão: <code>claude-opus-5</code>.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prompt">Instruções do robô</Label>
        <Textarea
          id="prompt"
          value={cfg.prompt}
          disabled={!editavel}
          onChange={(e) => alterar("prompt", e.target.value)}
          className="min-h-[420px] font-mono text-xs"
        />
        <p className="text-[11px] text-muted-foreground">
          Editar aqui muda o que o robô fala, mas <strong>não</strong> remove as travas: ele
          continua parando no limite de respostas, calando quando alguém do time responde, e nunca
          respondendo a si mesmo. Essas regras vivem no sistema, não neste texto.
        </p>
      </div>

      {!editavel && (
        <p className="text-xs text-muted-foreground">
          Somente administrador ou gestor comercial pode alterar.
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={!editavel || !sujo || salvando}>
          <Save className="h-4 w-4 mr-1" />
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
