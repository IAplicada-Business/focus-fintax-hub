import type { CSSProperties } from "react";
import logoGold from "@/assets/logo-agf-fintax-gold.svg";
import { formatCurrencyBR } from "@/lib/clientes-constants";
import type { MapaExecutivoData } from "@/lib/mapa-executivo";

/**
 * Página A4 (794 × 1123 px a 96 dpi) do novo Mapa Tributário — modelo
 * "Relatório Executivo · Compensações" (AGF set/2026). Estilos inline e sem
 * transform/filter para o html2canvas capturar igual à tela.
 */
export const MAPA_PAGE_WIDTH = 794;
export const MAPA_PAGE_HEIGHT = 1123;

const C = {
  preto: "#0b0b0c",
  grafite: "#161617",
  grafite2: "#232325",
  linhaEscura: "rgba(214,169,95,0.22)",
  dourado: "#c9964a",
  douradoClaro: "#e2bd7c",
  creme: "#f4efe6",
  cremeTexto: "#efe6d6",
  tinta: "#1b1b1c",
  tinta60: "#5f5a52",
  tinta35: "#9a9388",
  linhaClara: "#e4dccd",
};

const SANS = "Montserrat, 'Helvetica Neue', Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const CORES_OUTRAS = ["#141414", "#6f5d42", "#a8936f", "#3c3a36"];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function mesPorExtenso(mes: string) {
  const [ano, m] = mes.split("-");
  const idx = Number(m) - 1;
  return { mes: MESES[idx] ?? mes, ano: ano ?? "" };
}

const numero = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctLabel = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const eyebrow = (cor: string, extra?: CSSProperties): CSSProperties => ({
  fontFamily: SANS,
  fontSize: "9.5px",
  fontWeight: 600,
  letterSpacing: "3.2px",
  textTransform: "uppercase",
  color: cor,
  margin: 0,
  ...extra,
});

function Numero({ n }: { n: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "22px",
        height: "22px",
        borderRadius: "999px",
        background: C.preto,
        color: C.douradoClaro,
        fontFamily: SANS,
        fontSize: "9px",
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {n}
    </span>
  );
}

function TituloBloco({ n, titulo, direita }: { n: string; titulo: string; direita?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
        <Numero n={n} />
        <p style={eyebrow(C.tinta, { fontSize: "9px", letterSpacing: "3px" })}>{titulo}</p>
      </div>
      {direita}
    </div>
  );
}

function Check() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "18px",
        height: "18px",
        borderRadius: "999px",
        background: C.preto,
        flexShrink: 0,
        marginTop: "2px",
      }}
    >
      <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke={C.douradoClaro} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

interface Props {
  data: MapaExecutivoData;
  empresa: string;
  cnpj: string;
}

export function MapaTributarioExecutivo({ data, empresa, cnpj }: Props) {
  const { mes, ano } = mesPorExtenso(data.mes);
  const utilizadoPct = Math.max(0, Math.min(100, data.credito.pctUtilizado));
  const tributoMax = Math.max(...data.tributos.map((t) => t.valor), 1);
  const carteiraPositiva = data.carteira.map((row) => Math.max(0, row.saldo));
  const carteiraSoma = carteiraPositiva.reduce((s, v) => s + v, 0);
  let corOutra = 0;
  const corDaTese = data.carteira.map((row) => (row.atual ? C.dourado : CORES_OUTRAS[corOutra++ % CORES_OUTRAS.length]));

  return (
    <div
      className="mapa-executivo-page"
      style={{
        width: `${MAPA_PAGE_WIDTH}px`,
        height: `${MAPA_PAGE_HEIGHT}px`,
        background: C.creme,
        color: C.tinta,
        fontFamily: SANS,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Cabeçalho */}
      <div
        style={{
          background: `linear-gradient(160deg, ${C.grafite} 0%, ${C.preto} 55%, #070707 100%)`,
          color: C.cremeTexto,
          padding: "36px 56px 30px",
          position: "relative",
        }}
      >
        <svg
          width="794"
          height="120"
          viewBox="0 0 794 120"
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
          aria-hidden="true"
        >
          <path d="M300 118 C 470 90, 640 60, 794 4" fill="none" stroke={C.dourado} strokeOpacity="0.55" strokeWidth="1" />
          <path d="M330 120 C 500 96, 660 70, 794 22" fill="none" stroke={C.dourado} strokeOpacity="0.25" strokeWidth="1" />
        </svg>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
          <img src={logoGold} alt="AGF FinTax" style={{ height: "58px", width: "auto", display: "block" }} crossOrigin="anonymous" />
          <div style={{ textAlign: "right" }}>
            <p style={eyebrow(C.dourado, { fontSize: "9px" })}>Relatório executivo · Compensações</p>
            <p style={{ fontFamily: SERIF, fontSize: "27px", color: C.cremeTexto, margin: "8px 0 0", lineHeight: 1 }}>
              {mes} <span style={{ color: C.douradoClaro }}>{ano}</span>
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            marginTop: "26px",
            paddingBottom: "18px",
            borderBottom: `1px solid rgba(239,230,214,0.14)`,
          }}
        >
          <p style={{ fontSize: "24px", fontWeight: 600, color: "#ffffff", margin: 0, lineHeight: 1.15, maxWidth: "380px" }}>
            {empresa || "—"}
          </p>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            {[
              ["CNPJ", cnpj || "—"],
              ["Tese", data.teseLabel],
            ].map(([rotulo, valor]) => (
              <span
                key={rotulo}
                style={{
                  border: "1px solid rgba(239,230,214,0.28)",
                  borderRadius: "999px",
                  padding: "5px 12px",
                  fontSize: "9.5px",
                  color: "rgba(239,230,214,0.7)",
                  whiteSpace: "nowrap",
                }}
              >
                {rotulo} <strong style={{ color: "#ffffff", fontWeight: 600 }}>{valor}</strong>
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "28px", marginTop: "22px", alignItems: "stretch" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={eyebrow("rgba(239,230,214,0.7)", { fontSize: "8.5px" })}>Economia líquida no mês</p>
            <p style={{ margin: "12px 0 0", lineHeight: 1, whiteSpace: "nowrap" }}>
              <span style={{ fontSize: "22px", color: C.cremeTexto, fontWeight: 400, marginRight: "6px" }}>R$</span>
              <span style={{ fontSize: "50px", color: C.douradoClaro, fontWeight: 400, letterSpacing: "-1px" }}>
                {numero(data.economiaLiquida)}
              </span>
            </p>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "12.5px", lineHeight: 1.5, color: "rgba(239,230,214,0.78)", margin: "14px 0 0", maxWidth: "300px" }}>
              É o valor que permaneceu no caixa da empresa neste mês: tributos compensados, já descontados os honorários.
            </p>
          </div>
          <div
            style={{
              width: "310px",
              flexShrink: 0,
              border: `1px solid ${C.linhaEscura}`,
              borderRadius: "12px",
              background: "rgba(255,255,255,0.02)",
              padding: "18px 20px",
            }}
          >
            <p style={eyebrow(C.dourado, { fontSize: "8.5px", marginBottom: "10px" })}>Como chegamos a esse valor</p>
            {[
              ["Tributos compensados no mês", formatCurrencyBR(data.tributosTotal), false],
              [`Honorários AGF (${data.honorariosPctLabel})`, `− ${formatCurrencyBR(data.honorarios)}`, true],
            ].map(([rotulo, valor, muted]) => (
              <div
                key={String(rotulo)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                  padding: "8px 0",
                  borderBottom: "1px solid rgba(239,230,214,0.1)",
                  fontSize: "11px",
                  color: muted ? "rgba(239,230,214,0.6)" : C.cremeTexto,
                }}
              >
                <span>{rotulo}</span>
                <span style={{ whiteSpace: "nowrap" }}>{valor}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: "12px" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 500, color: "#ffffff" }}>Economia líquida</span>
              <span style={{ fontSize: "16px", fontWeight: 500, color: C.douradoClaro, whiteSpace: "nowrap" }}>
                {formatCurrencyBR(data.economiaLiquida)}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ height: "6px", background: `linear-gradient(90deg, #8d6630, ${C.douradoClaro} 50%, #8d6630)` }} />

      {/* Corpo */}
      <div style={{ flex: 1, padding: "24px 56px 0", display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* 01 — Crédito da tese */}
        <div>
          <TituloBloco
            n="01"
            titulo={`Crédito de ${data.teseLabel}`}
            direita={
              <p style={{ fontSize: "10px", color: C.tinta60, margin: 0, whiteSpace: "nowrap" }}>
                Crédito total recuperado <strong style={{ color: C.tinta }}>{formatCurrencyBR(data.credito.total)}</strong>
              </p>
            }
          />
          <div style={{ background: C.grafite, borderRadius: "12px", padding: "18px 22px 16px", color: C.cremeTexto }}>
            <div style={{ display: "flex", height: "16px", borderRadius: "4px", overflow: "hidden", background: C.grafite2 }}>
              <div style={{ width: `${utilizadoPct}%`, background: `linear-gradient(90deg, #a47435, ${C.douradoClaro})` }} />
              <div style={{ width: "3px", background: C.grafite }} />
              <div style={{ flex: 1, background: "#2e2d2b" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", marginTop: "16px" }}>
              {[
                {
                  rotulo: "Já utilizado",
                  valor: formatCurrencyBR(data.credito.utilizado),
                  sub: `${pctLabel(data.credito.pctUtilizado)} do crédito total`,
                  dot: C.dourado,
                  cor: "#ffffff",
                },
                {
                  rotulo: "Saldo disponível",
                  valor: formatCurrencyBR(data.credito.saldo),
                  sub: `${pctLabel(data.credito.pctSaldo)} do crédito total`,
                  dot: "#55524c",
                  cor: C.douradoClaro,
                },
                {
                  rotulo: "Fôlego do saldo",
                  valor: data.credito.folegoMeses == null ? "—" : `≈ ${data.credito.folegoMeses} ${data.credito.folegoMeses === 1 ? "mês" : "meses"}`,
                  sub: "no ritmo médio de compensação",
                  dot: null,
                  cor: "#ffffff",
                },
              ].map((item, i) => (
                <div
                  key={item.rotulo}
                  style={{
                    paddingLeft: i === 0 ? 0 : "18px",
                    borderLeft: i === 0 ? "none" : "1px solid rgba(239,230,214,0.12)",
                  }}
                >
                  <p style={{ fontSize: "9.5px", color: "rgba(239,230,214,0.65)", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                    {item.dot && <span style={{ width: "7px", height: "7px", borderRadius: "999px", background: item.dot, display: "inline-block" }} />}
                    {item.rotulo}
                  </p>
                  <p style={{ fontSize: "18px", color: item.cor, margin: "8px 0 0", fontWeight: 400, whiteSpace: "nowrap" }}>{item.valor}</p>
                  <p style={{ fontSize: "8.5px", color: "rgba(239,230,214,0.5)", margin: "6px 0 0" }}>{item.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 02 + 03 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "36px" }}>
          <div>
            <TituloBloco n="02" titulo="Tributos compensados no mês" />
            {data.tributos.length === 0 ? (
              <p style={{ fontSize: "10.5px", color: C.tinta60, margin: "6px 0 12px" }}>Nenhum tributo compensado nesta competência.</p>
            ) : (
              data.tributos.map((t) => (
                <div
                  key={t.tributo}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "72px 1fr 92px 40px",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 0",
                    borderBottom: `1px solid ${C.linhaClara}`,
                    fontSize: "10.5px",
                  }}
                >
                  <span style={{ color: C.tinta }}>{t.tributo}</span>
                  <span style={{ height: "6px", borderRadius: "999px", background: "#e7ddcc", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${Math.max(4, (t.valor / tributoMax) * 100)}%`, background: `linear-gradient(90deg, #a47435, ${C.dourado})`, borderRadius: "999px" }} />
                  </span>
                  <span style={{ textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{formatCurrencyBR(t.valor)}</span>
                  <span style={{ textAlign: "right", color: C.tinta35, fontSize: "9.5px" }}>{pctLabel(t.pct)}</span>
                </div>
              ))
            )}
            <div
              style={{
                marginTop: "12px",
                background: C.preto,
                borderRadius: "8px",
                padding: "10px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "11px",
              }}
            >
              <span style={{ color: "#ffffff", fontWeight: 500 }}>Total do mês</span>
              <span style={{ color: C.douradoClaro, fontWeight: 600 }}>{formatCurrencyBR(data.tributosTotal)}</span>
            </div>
          </div>

          <div>
            <TituloBloco n="03" titulo="Situação fiscal" />
            {[
              ["Situação fiscal", data.fiscal.situacaoFiscal],
              ["Obrigações retificadas", data.fiscal.obrigacoesRetificadas],
              ["Crédito tributário", data.fiscal.creditoTributario],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} style={{ display: "flex", gap: "12px", padding: "8px 0", borderBottom: `1px solid ${C.linhaClara}` }}>
                <Check />
                <div>
                  <p style={eyebrow(C.tinta35, { fontSize: "7.5px", letterSpacing: "1.6px" })}>{rotulo}</p>
                  <p style={{ fontSize: "12px", fontWeight: 500, color: C.tinta, margin: "3px 0 0" }}>{valor}</p>
                </div>
              </div>
            ))}
            <p style={{ fontSize: "8.5px", color: C.tinta60, margin: "10px 0 0", lineHeight: 1.5 }}>{data.fiscal.baseLegal}</p>
          </div>
        </div>

        {/* 04 — Carteira */}
        <div>
          <TituloBloco
            n="04"
            titulo="Carteira de créditos da empresa"
            direita={<p style={{ fontSize: "10px", color: C.tinta60, margin: 0 }}>Saldos disponíveis por tese</p>}
          />
          <div style={{ display: "flex", height: "14px", borderRadius: "4px", overflow: "hidden", background: "#e7ddcc", gap: "2px" }}>
            {data.carteira.map((row, i) =>
              carteiraPositiva[i] > 0 ? (
                <div
                  key={row.codigo}
                  style={{ width: `${(carteiraPositiva[i] / (carteiraSoma || 1)) * 100}%`, background: corDaTese[i] }}
                />
              ) : null,
            )}
          </div>
          <div style={{ display: "flex", gap: "18px", marginTop: "14px", alignItems: "stretch" }}>
            <div style={{ flex: 1, display: "flex", flexWrap: "wrap", rowGap: "12px" }}>
              {data.carteira.map((row, i) => (
                <div
                  key={row.codigo}
                  style={{
                    width: "50%",
                    boxSizing: "border-box",
                    paddingLeft: i % 2 === 0 ? 0 : "18px",
                    paddingRight: "12px",
                    borderLeft: i % 2 === 0 ? "none" : `1px solid ${C.linhaClara}`,
                  }}
                >
                  <p style={{ fontSize: "10px", color: C.tinta60, margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: corDaTese[i], display: "inline-block", flexShrink: 0 }} />
                    {row.label}
                  </p>
                  <p style={{ fontSize: "16px", fontWeight: 600, color: C.tinta, margin: "6px 0 0", whiteSpace: "nowrap" }}>
                    {formatCurrencyBR(row.saldo)}
                  </p>
                  {row.atual && <p style={{ fontSize: "8.5px", color: C.tinta35, margin: "3px 0 0" }}>Tese deste mapa</p>}
                </div>
              ))}
            </div>
            <div
              style={{
                width: "200px",
                flexShrink: 0,
                background: C.preto,
                borderRadius: "10px",
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <p style={eyebrow(C.dourado, { fontSize: "7.5px", letterSpacing: "2.2px" })}>Saldo total disponível</p>
              <p style={{ fontSize: "18px", color: C.douradoClaro, fontWeight: 600, margin: "10px 0 0", whiteSpace: "nowrap" }}>
                {formatCurrencyBR(data.saldoTotalDisponivel)}
              </p>
            </div>
          </div>
        </div>

        <p style={{ fontSize: "8.5px", fontStyle: "italic", color: C.tinta60, margin: "auto 0 16px" }}>
          * Os saldos e valores apresentados podem sofrer alterações em razão da atualização monetária pela taxa SELIC.
        </p>
      </div>

      {/* Rodapé */}
      <div style={{ background: C.preto, borderTop: `1px solid ${C.dourado}`, padding: "16px 56px", fontSize: "10px" }}>
        <span style={{ color: C.dourado, fontWeight: 600 }}>AGF FinTax</span>
        <span style={{ color: "rgba(239,230,214,0.6)" }}> · Confidencial</span>
      </div>
    </div>
  );
}
