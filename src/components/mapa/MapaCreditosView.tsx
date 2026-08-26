import type { Ref } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  calcularTotais,
  type ClienteMapa,
  type LinhaMapa,
} from "@/lib/mapa-creditos";

export interface MapaCreditosViewProps {
  cliente: ClienteMapa;
  /** Já filtradas pelo chamador. */
  linhas: LinhaMapa[];
  /**
   * Presente = página autenticada: mostra a coluna "No cálculo" e permite editar.
   * Ausente = página pública: a coluna nem existe. É controle de operação, o
   * cliente não deve ver.
   */
  onToggleIncluir?: (teseId: string, next: boolean) => void;
  /** true quando o filtro de teses escondeu algo — muda só o texto do estado vazio. */
  filtroAtivo?: boolean;
  /** Nó capturado por exportElementToPdf. A página pública não passa. */
  printRef?: Ref<HTMLDivElement>;
}

/**
 * O Mapa Tributário imprimível, sem nenhum controle de navegação.
 *
 * Usado por /clientes/:id/mapa-creditos (time, com edição) e por /mapa/:token
 * (cliente, read-only). Um componente só: se fossem dois, os números que o
 * cliente vê divergiriam dos que o time vê.
 */
export default function MapaCreditosView({
  cliente,
  linhas,
  onToggleIncluir,
  filtroAtivo = false,
  printRef,
}: MapaCreditosViewProps) {
  const totais = calcularTotais(linhas);

  return (
    <div
      ref={printRef}
      id="mapa-creditos-pdf"
      style={{ width: "794px", margin: "0 auto", background: "white", color: "#111" }}
    >
      {/* Letterhead */}
      <div
        style={{
          background: "#0a1564",
          color: "white",
          padding: "28px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "24px",
        }}
      >
        <p
          style={{
            fontFamily: "Barlow, sans-serif",
            fontSize: "38px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            margin: 0,
          }}
        >
          FinTax
        </p>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "1px", margin: 0 }}>
            MAPA DE CRÉDITOS TRIBUTÁRIOS
          </p>
        </div>
      </div>

      {/* Identificação */}
      <div
        style={{
          padding: "20px 32px",
          borderBottom: "1px solid #e5e7eb",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px 24px",
          fontSize: "12px",
        }}
      >
        <div>
          <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>Razão Social</p>
          <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>{cliente.empresa || "—"}</p>
        </div>
        <div>
          <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>CNPJ</p>
          <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>{cliente.cnpj || "—"}</p>
        </div>
        <div>
          <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>Data Apuração</p>
          <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>
            {cliente.data_apuracao
              ? new Date(cliente.data_apuracao).toLocaleDateString("pt-BR")
              : "—"}
          </p>
        </div>
        <div>
          <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", margin: 0 }}>Gerado em</p>
          <p style={{ fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>
            {new Date().toLocaleDateString("pt-BR")}
          </p>
        </div>
      </div>

      {/* Tabela — espelho da aba "Detalhamento por Cliente" da planilha SISTEMA */}
      <div style={{ padding: "24px 32px" }}>
        {linhas.length === 0 ? (
          <p style={{ padding: "24px 0", textAlign: "center", color: "#6b7280", fontSize: "13px" }}>
            Sem créditos apurados registrados{filtroAtivo ? " para as teses filtradas" : ""}.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow style={{ background: "#0a1564" }}>
                {onToggleIncluir && (
                  <TableHead style={{ color: "white", fontSize: "11px" }}>No cálculo</TableHead>
                )}
                <TableHead style={{ color: "white", fontSize: "11px" }}>Tese Tributária</TableHead>
                <TableHead style={{ color: "white", fontSize: "11px" }}>Status</TableHead>
                <TableHead style={{ color: "white", fontSize: "11px", textAlign: "right" }}>Crédito Inicial Apurado</TableHead>
                <TableHead style={{ color: "white", fontSize: "11px", textAlign: "right" }}>Valor Compensado</TableHead>
                <TableHead style={{ color: "white", fontSize: "11px", textAlign: "right" }}>Saldo Final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l, i) => {
                const pctUtilizado = l.valor_apurado_inicial > 0
                  ? (Number(l.total_compensado) / Number(l.valor_apurado_inicial)) * 100
                  : 0;
                const incluido = typeof l.incluir_no_calculo === "boolean"
                  ? l.incluir_no_calculo
                  : l.tese_codigo === "INSUMOS" || l.tese_codigo === "SUBVENCAO";
                const statusKey = l.status_utilizacao
                  || (Number(l.total_compensado) <= 0 ? "a_utilizar" : Number(l.saldo_final) <= 0 ? "utilizado" : "em_uso");
                return (
                  <TableRow
                    key={l.tese_id}
                    style={{
                      background: i % 2 === 0 ? "#f9fafb" : "white",
                      borderBottom: "1px solid #eee",
                      opacity: incluido ? 1 : 0.55,
                    }}
                  >
                    {onToggleIncluir && (
                      <TableCell style={{ padding: "8px 10px" }} className="print:hidden">
                        <Checkbox
                          checked={incluido}
                          onCheckedChange={(v) => onToggleIncluir(l.tese_id, !!v)}
                          disabled={l.tese_codigo === "REPORTO"}
                        />
                      </TableCell>
                    )}
                    <TableCell style={{ fontSize: "12px", padding: "8px 10px" }}>
                      <div style={{ fontWeight: 600, color: "#0a1564" }}>{l.tese_label}</div>
                      <div style={{ fontSize: "10px", color: "#6b7280" }}>
                        {l.tese_codigo}
                        {l.tese_codigo === "REPORTO" && (
                          <span style={{ marginLeft: "8px", padding: "1px 6px", borderRadius: "4px", background: "#f1f5f9", color: "#475569" }}>
                            possíveis futuros
                          </span>
                        )}
                        {!l.visivel_cliente && l.tese_codigo !== "REPORTO" && (
                          <span style={{ marginLeft: "8px", padding: "1px 6px", borderRadius: "4px", background: "#f1f5f9", color: "#475569" }}>
                            interno
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell style={{ padding: "8px 10px" }}>
                      <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[statusKey] || STATUS_STYLE.a_utilizar}`}>
                        {STATUS_LABEL[statusKey] || statusKey}
                      </span>
                    </TableCell>
                    <TableCell style={{ fontSize: "12px", textAlign: "right", padding: "8px 10px", fontWeight: 500 }}>
                      {formatCurrencyBR(Number(l.valor_apurado_inicial))}
                    </TableCell>
                    <TableCell style={{ fontSize: "12px", textAlign: "right", padding: "8px 10px" }}>
                      {l.tese_codigo === "REPORTO" ? (
                        <>
                          <span style={{ color: "#6b7280" }}>—</span>
                          <div style={{ fontSize: "9px", color: "#6b7280" }}>não compensa</div>
                        </>
                      ) : (
                        <>
                          {formatCurrencyBR(Number(l.total_compensado))}
                          <div style={{ fontSize: "9px", color: "#6b7280" }}>{pctUtilizado.toFixed(1)}% do apurado</div>
                        </>
                      )}
                    </TableCell>
                    <TableCell
                      style={{
                        fontSize: "12px",
                        textAlign: "right",
                        padding: "8px 10px",
                        fontWeight: 700,
                        color: Number(l.tese_codigo === "REPORTO" ? l.valor_apurado_inicial : l.saldo_final) > 0 ? "#0a1564" : "#6b7280",
                      }}
                    >
                      {formatCurrencyBR(
                        Number(l.tese_codigo === "REPORTO" ? l.valor_apurado_inicial : l.saldo_final)
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow style={{ background: "#e0e7ff", fontWeight: 700 }}>
                <TableCell colSpan={3} style={{ fontSize: "13px", padding: "10px", color: "#0a1564" }}>
                  TOTAL NO CÁLCULO
                </TableCell>
                <TableCell style={{ fontSize: "13px", textAlign: "right", padding: "10px", color: "#0a1564" }}>
                  {formatCurrencyBR(totais.apurado)}
                </TableCell>
                <TableCell style={{ fontSize: "13px", textAlign: "right", padding: "10px", color: "#0a1564" }}>
                  {formatCurrencyBR(totais.compensado)}
                </TableCell>
                <TableCell style={{ fontSize: "13px", textAlign: "right", padding: "10px", color: "#0a1564" }}>
                  {formatCurrencyBR(totais.saldo)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>

      {/* Rodapé com resumo executivo */}
      {linhas.length > 0 && (
        <div
          style={{
            padding: "16px 32px 24px",
            borderTop: "1px solid #e5e7eb",
            fontSize: "11px",
            color: "#6b7280",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
          }}
        >
          <div>
            <p style={{ textTransform: "uppercase", letterSpacing: "1.5px", margin: 0, fontSize: "9px" }}>Teses ativas</p>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>{linhas.length}</p>
          </div>
          <div>
            <p style={{ textTransform: "uppercase", letterSpacing: "1.5px", margin: 0, fontSize: "9px" }}>% utilizado</p>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>
              {totais.apurado > 0 ? ((totais.compensado / totais.apurado) * 100).toFixed(1) : "0"}%
            </p>
          </div>
          <div>
            <p style={{ textTransform: "uppercase", letterSpacing: "1.5px", margin: 0, fontSize: "9px" }}>Saldo a compensar</p>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "#0a1564", margin: "2px 0 0" }}>
              {formatCurrencyBR(totais.saldo)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
