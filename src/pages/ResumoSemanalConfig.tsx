import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, MessageSquareText, Search, Send, Shield, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWhatsappConexao } from "@/components/atendimento/WhatsAppConexao";
import { useAuth } from "@/hooks/useAuth";
import {
  useEnviarResumoTeste,
  useResumoDestinatarioMutations,
  useResumoDestinatarios,
  useResumoEnvios,
  useResumoPreview,
  useUsuariosResumo,
} from "@/hooks/data/useResumoSemanal";
import { montarMensagemResumo, normalizarTelefoneBR, type ModeloResumo } from "@/lib/resumo-semanal";
import type { ResumoEnvio } from "@/services/resumoSemanalService";
import { cn } from "@/lib/utils";

const TIPO_LABEL: Record<string, string> = { segunda: "Segunda", sexta: "Sexta", teste: "Teste" };

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  pmo: "PMO",
  gestor_tributario: "Gestor Tributário",
  comercial: "Comercial",
  gestor_comercial: "Gestor Comercial",
  sdr: "SDR",
  marketing: "Marketing",
  cliente: "Cliente",
};

/**
 * "(11) 9xxxx-5678": dá pra reconhecer o número sem expor ele inteiro numa
 * tela que fica aberta em reunião.
 */
function mascararWhatsapp(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]}xxxx-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) xxxx-${d.slice(6)}`;
  return d.length > 4 ? `…${d.slice(-4)}` : d;
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-semibold",
        ok
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
      )}
    >
      {children}
    </Badge>
  );
}

/**
 * Configurações → Resumo semanal por WhatsApp. Só admin: o resumo leva
 * números consolidados da carteira, então quem escolhe os destinatários é o
 * admin. A mesma regra está no menu (screen key `resumo_semanal`), no RLS das
 * tabelas (migration 20261016150000) e na Edge Function `resumo-semanal`.
 */
export default function ResumoSemanalConfig() {
  const { userRole } = useAuth();

  if (userRole !== "admin") {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-xl font-bold text-navy">Resumo semanal por WhatsApp</h1>
        <Card className="border-card-border">
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-body-text font-medium">Você não tem permissão para acessar esta página.</p>
            <p className="text-muted-foreground text-sm mt-1">Apenas administradores configuram o resumo semanal.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Conteúdo separado: os hooks (Z-API, RPC, profiles) só rodam para admin.
  return <ResumoSemanalConteudo />;
}

function ResumoSemanalConteudo() {
  const { user, profile } = useAuth();
  const [modelo, setModelo] = useState<ModeloResumo>("segunda");

  const usuariosQ = useUsuariosResumo();
  const destinatariosQ = useResumoDestinatarios();
  const enviosQ = useResumoEnvios();

  const meuWhatsapp = usuariosQ.data?.find((u) => u.user_id === user?.id)?.whatsapp ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MessageSquareText className="h-4 w-4" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-navy">Resumo semanal por WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Enviado automaticamente segunda 08:00 (abertura da semana) e sexta 17:00 (fechamento) pelo número
            conectado no Atendimento.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <EnvioCard
            modelo={modelo}
            envios={enviosQ.data ?? []}
            enviosCarregando={enviosQ.isPending}
            meuWhatsapp={meuWhatsapp}
            usuariosCarregando={usuariosQ.isPending}
          />
          <QuemRecebeCard usuariosQ={usuariosQ} destinatariosQ={destinatariosQ} />
        </div>
        <PreviaCard modelo={modelo} onModeloChange={setModelo} nome={profile?.full_name ?? null} />
      </div>

      <UltimosEnviosCard
        envios={enviosQ.data ?? []}
        carregando={enviosQ.isPending}
        erro={enviosQ.isError ? (enviosQ.error as Error)?.message ?? "erro" : null}
        usuarios={usuariosQ.data ?? []}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Envio: número da Z-API, agenda, último disparo e teste
// ---------------------------------------------------------------------------

function EnvioCard({
  modelo,
  envios,
  enviosCarregando,
  meuWhatsapp,
  usuariosCarregando,
}: {
  modelo: ModeloResumo;
  envios: ResumoEnvio[];
  enviosCarregando: boolean;
  meuWhatsapp: string | null;
  usuariosCarregando: boolean;
}) {
  const statusQ = useWhatsappConexao();
  const enviarTeste = useEnviarResumoTeste();

  // Último disparo automático (teste não conta) e o placar daquele disparo.
  const ultimo = useMemo(() => {
    const ref = envios.find((e) => e.tipo !== "teste");
    if (!ref) return null;
    const mesmo = envios.filter((e) => e.tipo === ref.tipo && e.periodo_inicio === ref.periodo_inicio);
    const ok = mesmo.filter((e) => e.status === "sucesso").length;
    return { ref, ok, falhas: mesmo.length - ok };
  }, [envios]);

  const dispararTeste = () => {
    enviarTeste.mutate(
      { modelo },
      {
        onSuccess: (r) => {
          if (r.enviados > 0) {
            toast.success("Teste enviado", {
              description: `Modelo de ${TIPO_LABEL[modelo].toLowerCase()} enviado para ${mascararWhatsapp(meuWhatsapp)}.`,
            });
          } else {
            toast.warning("Teste não enviado", { description: r.resultados?.[0]?.erro ?? r.aviso ?? "Verifique a conexão do WhatsApp." });
          }
        },
        onError: (e) =>
          toast.error("Não foi possível enviar o teste", { description: e instanceof Error ? e.message : undefined }),
      },
    );
  };

  const st = statusQ.data;
  const conectado = Boolean(st?.configured && st.connected);

  return (
    <Card className="card-base">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-muted-foreground" /> Envio
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
          <dt className="text-muted-foreground">Número</dt>
          <dd className="min-w-0">
            {statusQ.isPending ? (
              <span className="text-muted-foreground">Verificando conexão…</span>
            ) : statusQ.isError ? (
              <span className="text-destructive">
                Não foi possível consultar a Z-API: {(statusQ.error as Error)?.message ?? "erro"}
              </span>
            ) : !st?.configured ? (
              <StatusBadge ok={false}>Não configurado</StatusBadge>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge ok={conectado}>{conectado ? "Conectado" : "Desconectado"}</StatusBadge>
                {conectado && !st.smartphoneConnected && (
                  <span className="text-xs text-amber-700 dark:text-amber-400">celular sem internet</span>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Instância Z-API do Atendimento — o mesmo número dos disparos em massa.
            </p>
          </dd>

          <dt className="text-muted-foreground">Agenda</dt>
          <dd>
            Segunda 08:00 · Sexta 17:00
            <span className="block text-xs text-muted-foreground">horário de Brasília</span>
          </dd>

          <dt className="text-muted-foreground">Último envio</dt>
          <dd>
            {enviosCarregando ? (
              <span className="text-muted-foreground">Carregando…</span>
            ) : !ultimo ? (
              <span className="text-muted-foreground">Nenhum envio automático ainda.</span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums">{dataHora(ultimo.ref.executado_em)}</span>
                <span className="text-muted-foreground">· {TIPO_LABEL[ultimo.ref.tipo] ?? ultimo.ref.tipo}</span>
                <StatusBadge ok={ultimo.falhas === 0}>
                  {ultimo.falhas === 0 ? `${ultimo.ok} enviado${ultimo.ok === 1 ? "" : "s"}` : `${ultimo.falhas} falha${ultimo.falhas === 1 ? "" : "s"}`}
                </StatusBadge>
              </div>
            )}
          </dd>
        </dl>

        {st?.configured === false && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
              A Z-API não está configurada no servidor. Sem ela o resumo não sai.
            </AlertDescription>
          </Alert>
        )}
        {st?.configured && !st.connected && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
              O WhatsApp está desconectado — os próximos resumos vão falhar.{" "}
              <Link to="/atendimento" className="font-semibold underline underline-offset-2">
                Reconectar no Atendimento
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={dispararTeste}
            disabled={!meuWhatsapp || enviarTeste.isPending}
          >
            <Send className="h-3.5 w-3.5" />
            {enviarTeste.isPending ? "Enviando…" : "Enviar teste para mim"}
          </Button>
          {usuariosCarregando ? null : meuWhatsapp ? (
            <span className="text-xs text-muted-foreground">
              Modelo de {TIPO_LABEL[modelo].toLowerCase()} para {mascararWhatsapp(meuWhatsapp)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Seu usuário não tem WhatsApp.{" "}
              <Link to="/usuarios" className="font-medium text-primary underline underline-offset-2">
                Cadastre o WhatsApp em Usuários
              </Link>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Quem recebe: usuários do sistema com switch
// ---------------------------------------------------------------------------

function QuemRecebeCard({
  usuariosQ,
  destinatariosQ,
}: {
  usuariosQ: ReturnType<typeof useUsuariosResumo>;
  destinatariosQ: ReturnType<typeof useResumoDestinatarios>;
}) {
  const [busca, setBusca] = useState("");
  const { alternarUsuario, remover } = useResumoDestinatarioMutations();

  const ativosPorUsuario = useMemo(() => {
    const set = new Set<string>();
    for (const d of destinatariosQ.data ?? []) if (d.user_id && d.ativo) set.add(d.user_id);
    return set;
  }, [destinatariosQ.data]);

  // Linhas antigas (número digitado no card do Pulso, antes desta tela). Não
  // dá pra cadastrar novas, mas elas ainda recebem — então ficam visíveis
  // para o admin poder remover.
  const legados = (destinatariosQ.data ?? []).filter((d) => !d.user_id);

  const usuarios = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = usuariosQ.data ?? [];
    if (!termo) return lista;
    return lista.filter(
      (u) => u.full_name.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo),
    );
  }, [usuariosQ.data, busca]);

  const selecionados = (usuariosQ.data ?? []).filter((u) => ativosPorUsuario.has(u.user_id)).length;
  const carregando = usuariosQ.isPending || destinatariosQ.isPending;
  const erro = usuariosQ.error ?? destinatariosQ.error;

  return (
    <Card className="card-base">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3 px-4">
        <CardTitle className="text-sm font-semibold">Quem recebe</CardTitle>
        <span className="text-xs text-muted-foreground tabular-nums">
          {selecionados} selecionado{selecionados === 1 ? "" : "s"}
        </span>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar usuário"
            className="h-9 pl-8"
          />
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando usuários…</p>
        ) : erro ? (
          <p className="text-sm text-destructive">Falha ao carregar: {(erro as Error).message}</p>
        ) : usuarios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum usuário ativo encontrado.</p>
        ) : (
          <ul className="max-h-[420px] divide-y overflow-y-auto rounded-lg border">
            {usuarios.map((u) => {
              const recebe = ativosPorUsuario.has(u.user_id);
              const temWhatsapp = !!normalizarTelefoneBR(u.whatsapp);
              const pendente = alternarUsuario.isPending && alternarUsuario.variables?.userId === u.user_id;
              return (
                <li key={u.user_id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("truncate text-sm font-medium", !temWhatsapp && "text-muted-foreground")}>
                        {u.full_name || u.email}
                      </span>
                      {u.role && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                          {ROLE_LABEL[u.role] ?? u.role}
                        </Badge>
                      )}
                    </div>
                    {temWhatsapp ? (
                      <p className="text-xs text-muted-foreground tabular-nums">{mascararWhatsapp(u.whatsapp)}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Sem WhatsApp ·{" "}
                        <Link to="/usuarios" className="text-primary underline underline-offset-2">
                          Cadastre o WhatsApp em Usuários
                        </Link>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:inline">Recebe</span>
                    <Switch
                      checked={recebe}
                      // Sem WhatsApp não dá pra ligar; mas se já estava ligado
                      // (número apagado depois), deixa desligar.
                      disabled={pendente || (!temWhatsapp && !recebe)}
                      onCheckedChange={(ativo) =>
                        alternarUsuario.mutate({ userId: u.user_id, nome: u.full_name || null, ativo })
                      }
                      aria-label={`Recebe o resumo: ${u.full_name || u.email}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {legados.length > 0 && (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-xs text-muted-foreground">
              Números cadastrados à mão antes desta tela. Ainda recebem enquanto ativos — prefira marcar o usuário
              acima e remover daqui.
            </p>
            <ul className="space-y-1">
              {legados.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {d.nome || "Sem nome"}{" "}
                    <span className="text-xs text-muted-foreground tabular-nums">{mascararWhatsapp(d.whatsapp)}</span>
                    {!d.ativo && <span className="ml-1 text-xs text-muted-foreground">(inativo)</span>}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => remover.mutate(d.id)}
                    disabled={remover.isPending}
                    aria-label={`Remover ${d.nome || "número"}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Prévia em balão de WhatsApp
// ---------------------------------------------------------------------------

function PreviaCard({
  modelo,
  onModeloChange,
  nome,
}: {
  modelo: ModeloResumo;
  onModeloChange: (m: ModeloResumo) => void;
  nome: string | null;
}) {
  const previewQ = useResumoPreview(modelo);

  // Saudação com o nome de quem está olhando: cada destinatário recebe o
  // próprio nome, então a prévia mostra o "como chega pra mim".
  const texto = useMemo(() => {
    if (!previewQ.data) return null;
    return montarMensagemResumo(modelo, previewQ.data.dados, previewQ.data.segunda, nome);
  }, [previewQ.data, modelo, nome]);

  return (
    <Card className="card-base min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" /> Prévia
        </CardTitle>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={modelo}
          onValueChange={(v) => v && onModeloChange(v as ModeloResumo)}
          aria-label="Modelo da prévia"
        >
          <ToggleGroupItem value="segunda" className="h-7 px-3 text-xs">Segunda</ToggleGroupItem>
          <ToggleGroupItem value="sexta" className="h-7 px-3 text-xs">Sexta</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="rounded-xl bg-[#efeae2] p-3 sm:p-4 dark:bg-[#0b141a]">
          {previewQ.isPending ? (
            <p className="text-sm text-[#667781]">Gerando prévia com os dados atuais…</p>
          ) : previewQ.isError ? (
            <p className="text-sm text-destructive">
              Não foi possível gerar a prévia: {(previewQ.error as Error)?.message ?? "erro"}
            </p>
          ) : (
            <div className="ml-auto max-w-[95%] max-h-[640px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
              {texto}
            </div>
          )}
        </div>
        {modelo === "sexta" && previewQ.data && !previewQ.data.segunda && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Sem foto de segunda registrada nesta semana — o comparativo aparece sem variação.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Últimos envios
// ---------------------------------------------------------------------------

function UltimosEnviosCard({
  envios,
  carregando,
  erro,
  usuarios,
}: {
  envios: ResumoEnvio[];
  carregando: boolean;
  erro: string | null;
  usuarios: { full_name: string; whatsapp: string | null }[];
}) {
  // O envio guarda só o número; resolve o nome pelo perfil quando bate.
  const nomePorNumero = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usuarios) {
      const n = normalizarTelefoneBR(u.whatsapp);
      if (n) m.set(n, u.full_name);
    }
    return m;
  }, [usuarios]);

  return (
    <Card className="card-base">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold">Últimos envios</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {carregando ? (
          <p className="px-4 pb-2 text-sm text-muted-foreground">Carregando…</p>
        ) : erro ? (
          <p className="px-4 pb-2 text-sm text-destructive">Falha ao carregar: {erro}</p>
        ) : envios.length === 0 ? (
          <p className="px-4 pb-2 text-sm text-muted-foreground">Nenhum envio registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Data/hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4">Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {envios.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-4 whitespace-nowrap tabular-nums">{dataHora(e.executado_em)}</TableCell>
                    <TableCell>{TIPO_LABEL[e.tipo] ?? e.tipo}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {nomePorNumero.get(e.destinatario) ?? "—"}{" "}
                      <span className="text-xs text-muted-foreground tabular-nums">{mascararWhatsapp(e.destinatario)}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge ok={e.status === "sucesso"}>{e.status === "sucesso" ? "Enviado" : "Falha"}</StatusBadge>
                    </TableCell>
                    <TableCell className="pr-4 max-w-[280px] truncate text-xs text-muted-foreground" title={e.erro ?? undefined}>
                      {e.erro ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
