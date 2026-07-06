import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// -----------------------------------------------------------------------------
// Tipos (espelham o retorno do submit-calculadora-lead / calc-motor)
// -----------------------------------------------------------------------------

interface DreRubrica { rubrica: string; valor: number; pct: number }
interface DreGrupo { grupo: string; subtotal: number; subtotal_pct: number; rubricas: DreRubrica[] }
interface DreOutput {
  faturamento: number;
  cmv: number;
  resultado_bruto: number;
  grupos: DreGrupo[];
  total_despesas_op: number;
  total_despesas_op_pct: number;
  resultado_antes_impostos: number;
  resultado_antes_impostos_pct: number;
}
interface IbsCbsOutput {
  base_venda: number;
  debito: { isento: number; reducao: number; cheia: number; seletivo: number; total: number };
  credito_bruto: { compras: number; folha_beneficios: number; adm: number; vendas: number; financeiras: number; total: number };
  exclusao: { rubricas: { rubrica: string; valor: number }[]; total: number };
  saldo: number;
  saldo_a_pagar: number;
  cbs_saldo: number;
  ibs_saldo: number;
}
interface Resultado {
  dre: DreOutput;
  reforma: IbsCbsOutput;
  ibs_cbs_estimado: number;
  economia_potencial_anual: number;
}

// -----------------------------------------------------------------------------
// Config visual — reusa da LP
// -----------------------------------------------------------------------------

// Palette da LP raiz (public/lp.html) — cinematic dark
const BG = "#06081f";                  // deep near-black navy
const SURFACE = "#0e1235";              // card/form surface
const CARD = "#101434";                 // card interno
const NAVY = "#010f69";                 // brand navy (badges)
const RED = "#d04545";                  // brand red da LP
const TEXT = "#e8ebff";                 // texto principal claro
const TEXT_MUTED = "rgba(232,235,255,.6)";
const BORDER = "rgba(255,255,255,.08)";
const LOGO_WHITE = "/images/logo-focus-fintax-white.png";

// Legado — usados em pontos internos onde não vale reescrever
const GRANADA = RED;
const CREAM = BG;

// Faixas de faturamento (mesmo set da LP raiz — dropdown)
const FATURAMENTO_FAIXAS = [
  { label: "Até R$ 500 mil", value: 350_000 },
  { label: "R$ 500 mil – R$ 1M", value: 750_000 },
  { label: "R$ 1M – R$ 5M", value: 2_500_000 },
  { label: "R$ 5M – R$ 20M", value: 10_000_000 },
  { label: "Acima de R$ 20M", value: 25_000_000 },
];

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const fmtBRLCent = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;

const maskTel = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length > 6) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length > 0) return `(${d}`;
  return "";
};

// UTMs do URL
function readUtms() {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source: p.get("utm_source") ?? undefined,
    utm_medium: p.get("utm_medium") ?? undefined,
    utm_campaign: p.get("utm_campaign") ?? undefined,
    utm_term: p.get("utm_term") ?? undefined,
    utm_content: p.get("utm_content") ?? undefined,
  };
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function Calculadora() {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [segmento, setSegmento] = useState("supermercado");
  const [regime, setRegime] = useState<"" | "simples" | "presumido" | "real">("");
  // faturamento agora é dropdown — armazena o midpoint numérico da faixa
  const [faturamentoFaixa, setFaturamentoFaixa] = useState<number | null>(null);
  const [jaFaz, setJaFaz] = useState<"" | "sim" | "nao">("");
  const [lgpd, setLgpd] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Calculadora da Reforma Tributária para Supermercados | Focus FinTax";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Descubra em 30 segundos quanto seu supermercado vai pagar de IBS/CBS na Reforma Tributária.");
    // Carrega Inter da Google Fonts pra bater com a LP raiz
    if (!document.getElementById("gf-inter")) {
      const link = document.createElement("link");
      link.id = "gf-inter";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const handleSubmit = async () => {
    const fat = faturamentoFaixa ?? 0;

    if (nome.trim().length < 3) { toast.error("Nome muito curto (mínimo 3 caracteres)."); return; }
    if (telefone.replace(/\D/g, "").length < 10) { toast.error("Telefone incompleto."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast.error("E-mail inválido."); return; }
    if (!regime) { toast.error("Selecione o regime tributário."); return; }
    if (!faturamentoFaixa) { toast.error("Selecione a faixa de faturamento."); return; }
    if (!jaFaz) { toast.error("Informe se já faz recuperação tributária."); return; }
    if (!lgpd) { toast.error("Aceite a política de privacidade (LGPD)."); return; }

    setSubmitting(true);
    try {
      const utms = readUtms();
      const { data, error } = await supabase.functions.invoke("submit-calculadora-lead", {
        body: {
          nome: nome.trim(),
          telefone,
          email: email.trim(),
          segmento,
          regime,
          faturamento_mensal: fat,
          ja_faz_recuperacao: jaFaz === "sim",
          aceite_lgpd: true,
          ...utms,
        },
      });

      if (error) throw error;
      if (!data || (data as any).error) throw new Error((data as any)?.error || "Erro no cálculo");

      const payload = data as { success: boolean; lead_id: string; resultado: any };
      const dre = payload.resultado.dre as DreOutput;
      const reforma = payload.resultado.reforma as IbsCbsOutput;
      setResultado({
        dre,
        reforma,
        ibs_cbs_estimado: payload.resultado.ibs_cbs_estimado,
        economia_potencial_anual: payload.resultado.economia_potencial_anual,
      });
      setLeadId(payload.lead_id);
      // Meta Pixel: Lead evento (se pixel estiver carregado)
      if (typeof (window as any).fbq === "function") {
        (window as any).fbq("track", "Lead", {
          content_name: "Calculadora Reforma Tributária",
          content_category: segmento,
        });
      }
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) {
      console.error("Calculadora submit err:", e);
      // Mostra a mensagem real da API pra ajudar debug
      const msg = e?.context?.error ?? e?.message ?? "Erro desconhecido";
      toast.error("Não foi possível calcular agora.", {
        description: `Detalhes: ${String(msg).slice(0, 200)}. Se persistir, contate a Focus pelo WhatsApp.`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const faturamentoNum = faturamentoFaixa ?? 0;

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", color: TEXT }}>
      {/* Header público — logo real Focus (PNG white) */}
      <header style={{ borderBottom: `1px solid ${BORDER}`, background: "rgba(6,8,31,.85)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <img
              src={LOGO_WHITE}
              alt="Focus FinTax"
              style={{ height: 96, width: "auto", display: "block", margin: "-14px 0" }}
            />
          </Link>
          <a href="#form-calc" style={{ fontSize: 12, fontWeight: 600, color: TEXT, textDecoration: "none", padding: "8px 18px", borderRadius: 999, border: `1px solid ${RED}`, background: "transparent" }}>
            Calcular agora
          </a>
        </div>
      </header>

      {/* HERO — cinematic dark */}
      <section style={{ padding: "72px 24px 48px", background: `radial-gradient(ellipse at top, ${SURFACE} 0%, ${BG} 60%)` }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: RED, marginBottom: 14 }}>
            Grupo Focus · Reforma Tributária 2026
          </p>
          <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 800, lineHeight: 1.1, color: TEXT, marginBottom: 22 }}>
            Quanto seu supermercado vai pagar de imposto{" "}
            <span style={{ color: RED, fontStyle: "italic" }}>na Reforma?</span>
          </h1>
          <p style={{ fontSize: 17, color: TEXT_MUTED, maxWidth: 640, margin: "0 auto 12px" }}>
            Descubra em 30 segundos o impacto do IBS/CBS na sua rede — com base em 12 anos de dados Focus do segmento supermercadista.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 28, marginTop: 22, fontSize: 12, color: "rgba(232,235,255,.5)", flexWrap: "wrap" }}>
            <span>✓ 12 anos de expertise</span>
            <span>✓ R$ 26M recuperados</span>
            <span>✓ 180+ supermercados</span>
          </div>
        </div>
      </section>

      {/* FORM — card dark */}
      <section id="form-calc" style={{ padding: "40px 24px 80px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto", background: SURFACE, borderRadius: 20, padding: 32, boxShadow: "0 30px 80px -30px rgba(0,0,0,.6)", border: `1px solid ${BORDER}` }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Preencha e receba seu diagnóstico</h2>
          <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 24 }}>7 campos rápidos. Você recebe a estimativa na próxima tela.</p>

          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Nome completo *">
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como você se chama" style={inputStyle} />
            </Field>
            <Field label="WhatsApp *">
              <input value={telefone} onChange={(e) => setTelefone(maskTel(e.target.value))} placeholder="(00) 00000-0000" style={inputStyle} />
            </Field>
            <Field label="E-mail *">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" style={inputStyle} />
            </Field>
            <Field label="Segmento *">
              <select value={segmento} onChange={(e) => setSegmento(e.target.value)} style={inputStyle}>
                <option value="supermercado">Supermercado</option>
              </select>
              <p style={{ fontSize: 10, color: "rgba(232,235,255,.4)", marginTop: 4 }}>Outros segmentos em breve (farmácia, atacado).</p>
            </Field>
            <Field label="Regime tributário *">
              <select value={regime} onChange={(e) => setRegime(e.target.value as any)} style={inputStyle}>
                <option value="">Selecione...</option>
                <option value="simples">Simples Nacional</option>
                <option value="presumido">Lucro Presumido</option>
                <option value="real">Lucro Real</option>
              </select>
            </Field>
            <Field label="Faturamento mensal *">
              <select
                value={faturamentoFaixa ?? ""}
                onChange={(e) => setFaturamentoFaixa(e.target.value ? Number(e.target.value) : null)}
                style={inputStyle}
              >
                <option value="">Selecione a faixa...</option>
                {FATURAMENTO_FAIXAS.map((f) => (
                  <option key={f.label} value={f.value}>{f.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Já faz recuperação tributária? *">
              <div style={{ display: "flex", gap: 12 }}>
                <RadioBtn checked={jaFaz === "sim"} onClick={() => setJaFaz("sim")} label="Sim" />
                <RadioBtn checked={jaFaz === "nao"} onClick={() => setJaFaz("nao")} label="Não" />
              </div>
            </Field>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: TEXT_MUTED, marginTop: 4 }}>
              <input type="checkbox" checked={lgpd} onChange={(e) => setLgpd(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                Concordo com o uso dos meus dados para receber o diagnóstico e ser contatado pela Focus.{" "}
                <Link to="/privacidade" style={{ color: RED, textDecoration: "underline" }}>Política de privacidade</Link>.
              </span>
            </label>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                marginTop: 8, padding: "16px 20px", borderRadius: 12, border: "none",
                background: submitting ? "rgba(208,69,69,.5)" : RED, color: "white", fontWeight: 700, fontSize: 15,
                cursor: submitting ? "wait" : "pointer",
                boxShadow: "0 8px 24px -6px rgba(208,69,69,.4)",
                letterSpacing: 0.3,
              }}
            >
              {submitting ? "Calculando com 12 anos de dados Focus..." : "Calcular meu diagnóstico"}
            </button>
          </div>
        </div>
      </section>

      {/* RESULTADO — só renderiza depois de submit */}
      {resultado && (
        <div ref={resultRef} style={{ padding: "40px 24px 80px" }}>
          <ResultadoView resultado={resultado} lead_id={leadId} nome={nome} regime={regime} segmento={segmento} />
        </div>
      )}

      {/* Autoridade */}
      <section style={{ padding: "60px 24px", background: SURFACE, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: RED, marginBottom: 12 }}>Autoridade</p>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: TEXT, marginBottom: 16 }}>Por que Focus FinTax</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24, marginTop: 24 }}>
            <Kpi n="12" label="anos de expertise em tributário" />
            <Kpi n="R$ 26M" label="recuperados para clientes" />
            <Kpi n="180+" label="supermercados atendidos" />
            <Kpi n="98%" label="taxa de retorno positivo" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: "48px 24px", background: BG, color: TEXT_MUTED }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center", fontSize: 12 }}>
          <img src={LOGO_WHITE} alt="Focus FinTax" style={{ height: 72, width: "auto", margin: "0 auto 16px", display: "block" }} />
          <p>Grupo Focus · A Contabilidade do Supermercado</p>
          <p style={{ marginTop: 12, opacity: 0.6 }}>© {new Date().getFullYear()} — Focus FinTax. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Componentes auxiliares
// -----------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${BORDER}`,
  fontSize: 14, fontFamily: "inherit", background: CARD, color: TEXT,
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 8, display: "block" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function RadioBtn({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: "12px 14px", borderRadius: 10,
        border: `1.5px solid ${checked ? RED : BORDER}`,
        background: checked ? RED : CARD, color: checked ? "white" : TEXT,
        fontWeight: 600, fontSize: 13, cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Kpi({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <p style={{ fontSize: 34, fontWeight: 800, color: TEXT, marginBottom: 4 }}>{n}</p>
      <p style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.35 }}>{label}</p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ResultadoView — 5 blocos
// -----------------------------------------------------------------------------

function ResultadoView({
  resultado,
  lead_id,
  nome,
  regime,
  segmento: _segmento,
}: {
  resultado: Resultado;
  lead_id: string | null;
  nome: string;
  regime: string;
  segmento: string;
}) {
  const { dre, reforma } = resultado;
  const fat = dre.faturamento;
  const pdfRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  // Impostos atuais estimados (regime real presumido): ~ (PIS+COFINS+ICMS) baseline.
  // Simples proxy: 8-11% do faturamento como carga total antes da Reforma.
  const cargaAtualPct = regime === "real" ? 0.115 : regime === "presumido" ? 0.09 : 0.06;
  const impostoAtual = fat * cargaAtualPct;
  const impostoReforma = reforma.saldo_a_pagar; // negativo/zero = a receber; positivo = a pagar
  const delta = ((impostoReforma - impostoAtual) / Math.max(impostoAtual, 1)) * 100;

  const sanitizeFileName = (s: string) =>
    (s || "cliente")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);

  const handleDownloadPdf = async () => {
    const el = pdfRef.current;
    if (!el || downloading) return;
    setDownloading(true);

    // Mesma técnica dos PRs #34/#38/#43: neutraliza overflow/max-height/vh
    // dos ancestrais pra capturar o conteúdo inteiro (não só a viewport).
    const modified: { el: HTMLElement; prop: string; prev: string }[] = [];
    const force = (n: HTMLElement, prop: string, value: string) => {
      modified.push({ el: n, prop, prev: n.style.getPropertyValue(prop) });
      n.style.setProperty(prop, value, "important");
    };
    let node: HTMLElement | null = el;
    while (node && node !== document.body) {
      const cs = window.getComputedStyle(node);
      if (["auto", "scroll", "hidden"].includes(cs.overflow) || ["auto", "scroll", "hidden"].includes(cs.overflowY)) {
        force(node, "overflow", "visible");
        force(node, "overflow-y", "visible");
      }
      if (cs.maxHeight && cs.maxHeight !== "none") force(node, "max-height", "none");
      if (cs.height && cs.height.endsWith("vh")) force(node, "height", "auto");
      node = node.parentElement;
    }
    force(el, "height", "auto");
    force(el, "max-height", "none");
    force(el, "overflow", "visible");

    try {
      await new Promise((r) => setTimeout(r, 50));
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
        height: el.scrollHeight,
        width: el.scrollWidth,
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidthMm = 210;
      const pageHeightMm = 297;
      const imgWidthMm = pageWidthMm;
      const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;
      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      let heightLeft = imgHeightMm;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
      heightLeft -= pageHeightMm;
      while (heightLeft > 0) {
        position -= pageHeightMm;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
        heightLeft -= pageHeightMm;
      }
      const pageCount = pdf.getNumberOfPages();
      const nowStr = new Date().toLocaleDateString("pt-BR");
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`Focus FinTax · Diagnóstico da Reforma Tributária · ${nowStr}`, 10, pageHeightMm - 6);
        pdf.text(`Página ${i} de ${pageCount}`, pageWidthMm - 32, pageHeightMm - 6);
      }
      const nomeSan = sanitizeFileName(nome);
      const dataStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      pdf.save(`Diagnostico_Reforma_${nomeSan}_${dataStr}.pdf`);
      toast.success("PDF gerado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF", { description: "Tenta usar Ctrl+P como fallback." });
    } finally {
      for (const { el: n, prop, prev } of modified) {
        if (prev) n.style.setProperty(prop, prev);
        else n.style.removeProperty(prop);
      }
      setDownloading(false);
    }
  };

  return (
    <div ref={pdfRef} style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gap: 20 }}>
      {/* BLOCO 1 — Card destaque */}
      <div style={{ background: NAVY, color: "white", borderRadius: 20, padding: "40px 32px", textAlign: "center" }}>
        <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", opacity: 0.7, marginBottom: 8 }}>
          Diagnóstico para {nome}
        </p>
        <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 6 }}>
          Sua rede paga hoje aproximadamente
        </p>
        <p style={{ fontSize: 40, fontWeight: 800, marginBottom: 20 }}>
          {fmtBRL(impostoAtual)}<span style={{ fontSize: 16, opacity: 0.7 }}>/mês em impostos</span>
        </p>
        <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 6 }}>
          Na Reforma Tributária (2033+) vai pagar
        </p>
        <p style={{ fontSize: 40, fontWeight: 800, color: impostoReforma <= impostoAtual ? "#84e5b3" : GRANADA }}>
          {fmtBRL(impostoReforma)}<span style={{ fontSize: 16, opacity: 0.7 }}>/mês</span>
        </p>
        <p style={{ marginTop: 16, fontSize: 14, opacity: 0.9 }}>
          Variação: <strong>{delta > 0 ? "+" : ""}{delta.toFixed(0)}%</strong>
          {impostoReforma < impostoAtual && (
            <span style={{ marginLeft: 8, color: "#84e5b3" }}>· Economia potencial anual: {fmtBRL((impostoAtual - impostoReforma) * 12)}</span>
          )}
        </p>
      </div>

      {/* BLOCO 2 — Comparativo DRE lado a lado */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, boxShadow: "0 20px 50px -20px rgba(0,0,0,.5)" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 4 }}>DRE — cenário atual vs Reforma</h3>
        <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 20 }}>Valores mensais estimados sobre R$ {fmtBRL(fat)} de faturamento.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <DreColuna titulo="Hoje (PIS/COFINS/ICMS)" dre={dre} destaque={impostoAtual} destaqueLabel="Impostos estimados" />
          <DreColuna titulo="Reforma (IBS/CBS 2033+)" dre={dre} destaque={impostoReforma} destaqueLabel="Saldo IBS/CBS" cor={GRANADA} />
        </div>
      </div>

      {/* BLOCO 3 — Detalhamento IBS/CBS */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, boxShadow: "0 20px 50px -20px rgba(0,0,0,.5)" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Detalhamento IBS/CBS</h3>
        <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 20 }}>Débito sobre vendas, crédito ampliado e saldo mensal.</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
          <MetricaCard label="Débito total" valor={reforma.debito.total} cor={GRANADA} />
          <MetricaCard label="Crédito bruto" valor={reforma.credito_bruto.total} cor="#0a8548" />
          <MetricaCard label="Exclusões" valor={reforma.exclusao.total} cor="#a86400" nota={`${reforma.exclusao.rubricas.length} rubricas`} />
        </div>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: TEXT_MUTED, marginBottom: 10 }}>Créditos ampliados por origem</p>
          <table style={{ width: "100%", fontSize: 13 }}>
            <tbody>
              <LinhaTabela label="Sobre compras (CMV)" v={reforma.credito_bruto.compras} />
              <LinhaTabela label="Sobre folha (benefícios: VT, VR, plano de saúde, uniformes, exames)" v={reforma.credito_bruto.folha_beneficios} />
              <LinhaTabela label="Sobre despesas administrativas" v={reforma.credito_bruto.adm} />
              <LinhaTabela label="Sobre despesas com vendas" v={reforma.credito_bruto.vendas} />
              <LinhaTabela label="Sobre despesas financeiras" v={reforma.credito_bruto.financeiras} />
              <LinhaTabela label="Total crédito bruto" v={reforma.credito_bruto.total} bold />
            </tbody>
          </table>
        </div>

        <div style={{ background: "rgba(208,69,69,.10)", border: `1px solid rgba(208,69,69,.25)`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: TEXT_MUTED, marginBottom: 10 }}>
            Rubricas EXCLUÍDAS do crédito ({reforma.exclusao.rubricas.length} itens)
          </p>
          <table style={{ width: "100%", fontSize: 13 }}>
            <tbody>
              {reforma.exclusao.rubricas.map((r) => <LinhaTabela key={r.rubrica} label={r.rubrica} v={r.valor} />)}
              <LinhaTabela label="Total exclusão" v={reforma.exclusao.total} bold />
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 8 }}>
            Estas rubricas geram despesa mas não crédito na Reforma. Cadastro tributário correto é essencial.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <MetricaCard label="Split CBS (federal, 31,4%)" valor={Math.abs(reforma.cbs_saldo)} cor={NAVY} nota={reforma.saldo < 0 ? "a pagar" : "a recuperar"} />
          <MetricaCard label="Split IBS (subnacional, 68,6%)" valor={Math.abs(reforma.ibs_saldo)} cor={NAVY} nota={reforma.saldo < 0 ? "a pagar" : "a recuperar"} />
        </div>
      </div>

      {/* BLOCO 4 — Impacto por departamento */}
      <ImpactoDepartamentos />

      {/* BLOCO 5 — Timeline transição ICMS */}
      <TimelineIcms />

      {/* CTAs finais */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 8 }}>
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          style={{
            padding: "14px 20px", borderRadius: 10, border: "none",
            background: downloading ? "rgba(199,55,55,.6)" : GRANADA, color: "white",
            fontWeight: 700, fontSize: 14,
            cursor: downloading ? "wait" : "pointer",
          }}
        >
          {downloading ? "Gerando PDF..." : "Baixar diagnóstico em PDF"}
        </button>
        <a
          href={`https://wa.me/5521971655550?text=${encodeURIComponent(
            `Olá, Focus! Fiz o diagnóstico da Reforma na calculadora. Meu cadastro: ${lead_id ?? "-"}. Faturamento ${fmtBRL(fat)}/mês, saldo IBS/CBS estimado ${fmtBRL(impostoReforma)}/mês. Quero conversar.`
          )}`}
          target="_blank" rel="noreferrer"
          style={{
            padding: "14px 20px", borderRadius: 10, border: `1.5px solid ${BORDER}`,
            background: CARD, color: TEXT, fontWeight: 700, fontSize: 14,
            textAlign: "center", textDecoration: "none",
          }}
        >
          Agendar reunião no WhatsApp
        </a>
      </div>

      <p style={{ fontSize: 11, color: TEXT_MUTED, textAlign: "center", marginTop: 4 }}>
        Estimativa baseada em 12 anos de dados Focus. Diagnóstico definitivo requer análise da DRE real da empresa.
      </p>
    </div>
  );
}

function DreColuna({ titulo, dre, destaque, destaqueLabel, cor = "#84e5b3" }: { titulo: string; dre: DreOutput; destaque: number; destaqueLabel: string; cor?: string }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, background: CARD }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: cor, marginBottom: 10 }}>{titulo}</p>
      <table style={{ width: "100%", fontSize: 13, color: TEXT }}>
        <tbody>
          <LinhaTabela label="Faturamento" v={dre.faturamento} bold />
          <LinhaTabela label="(-) CMV" v={-dre.cmv} />
          <LinhaTabela label="Resultado Bruto" v={dre.resultado_bruto} bold />
          {dre.grupos.map((g) => <LinhaTabela key={g.grupo} label={`(-) ${g.grupo}`} v={-g.subtotal} />)}
          <LinhaTabela label="Total Desp. Op." v={-dre.total_despesas_op} bold />
          <LinhaTabela label="Resultado antes impostos" v={dre.resultado_antes_impostos} bold />
          <tr><td colSpan={2}><hr style={{ margin: "8px 0", border: 0, borderTop: `1px solid ${BORDER}` }} /></td></tr>
          <LinhaTabela label={destaqueLabel} v={-destaque} bold color={cor} />
        </tbody>
      </table>
    </div>
  );
}

function LinhaTabela({ label, v, bold, color }: { label: string; v: number; bold?: boolean; color?: string }) {
  return (
    <tr>
      <td style={{ padding: "3px 0", fontWeight: bold ? 700 : 400, color: color ?? "inherit" }}>{label}</td>
      <td style={{ padding: "3px 0", textAlign: "right", fontWeight: bold ? 700 : 400, fontVariantNumeric: "tabular-nums", color: color ?? "inherit" }}>
        {fmtBRLCent(v)}
      </td>
    </tr>
  );
}

function MetricaCard({ label, valor, cor, nota }: { label: string; valor: number; cor: string; nota?: string }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, background: CARD }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: cor }}>{fmtBRL(valor)}</p>
      {nota && <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>{nota}</p>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Bloco 4 — Impacto por departamento (auto-fetch)
// -----------------------------------------------------------------------------

interface DepartRow {
  departamento: string;
  pct_mix_faturamento: number;
  aliquota_atual: number;
  aliquota_2027: number;
  tem_imposto_seletivo: boolean | null;
  variacao_pp: number;
  impacto_preco_pct: number;
}

function ImpactoDepartamentos() {
  const [rows, setRows] = useState<DepartRow[]>([]);
  useEffect(() => {
    (supabase as any)
      .from("reforma_aliquotas_departamento")
      .select("departamento, pct_mix_faturamento, aliquota_atual, aliquota_2027, tem_imposto_seletivo, variacao_pp, impacto_preco_pct")
      .eq("ativo", true)
      .order("ordem", { ascending: true })
      .then(({ data }: any) => setRows((data as DepartRow[]) ?? []));
  }, []);

  if (!rows.length) return null;

  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, boxShadow: "0 20px 50px -20px rgba(0,0,0,.5)" }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Impacto por departamento</h3>
      <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 16 }}>
        Como a Reforma afeta cada seção do supermercado — mudança na alíquota efetiva e impacto no preço final.
      </p>
      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, minWidth: 640, color: TEXT }}>
          <thead>
            <tr style={{ background: CARD, textAlign: "left" }}>
              <th style={thStyle}>Departamento</th>
              <th style={{ ...thStyle, textAlign: "right" }}>% Mix</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Alíquota hoje</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Alíquota 2027</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Variação (p.p.)</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Impacto no preço</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const positivo = r.variacao_pp > 0;
              return (
                <tr key={r.departamento} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={tdStyle}>
                    {r.departamento}
                    {r.tem_imposto_seletivo && <span style={{ marginLeft: 6, fontSize: 10, background: GRANADA, color: "white", padding: "2px 6px", borderRadius: 4 }}>IS</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmtPct(r.pct_mix_faturamento)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmtPct(r.aliquota_atual)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmtPct(r.aliquota_2027)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: positivo ? GRANADA : "#0a8548", fontWeight: 700 }}>
                    {positivo ? "+" : ""}{r.variacao_pp.toFixed(1)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: positivo ? GRANADA : "#0a8548", fontWeight: 700 }}>
                    {positivo ? "+" : ""}{fmtPct(r.impacto_preco_pct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: TEXT_MUTED };
const tdStyle: React.CSSProperties = { padding: "10px 10px", fontVariantNumeric: "tabular-nums" };

// -----------------------------------------------------------------------------
// Bloco 5 — Timeline transição ICMS
// -----------------------------------------------------------------------------

function TimelineIcms() {
  const marcos = [
    { ano: 2026, label: "Alíquota teste", pct: 0 },
    { ano: 2027, label: "IBS/CBS iniciam", pct: 0 },
    { ano: 2029, label: "-10% ICMS", pct: 10 },
    { ano: 2030, label: "-20% ICMS", pct: 20 },
    { ano: 2031, label: "-30% ICMS", pct: 30 },
    { ano: 2032, label: "-40% ICMS", pct: 40 },
    { ano: 2033, label: "ICMS extinto", pct: 100 },
  ];
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, boxShadow: "0 20px 50px -20px rgba(0,0,0,.5)" }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Timeline de transição do ICMS</h3>
      <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 20 }}>
        Redução gradativa do ICMS entre 2029 e 2033. IBS/CBS substituem PIS/COFINS/ICMS/ISS.
      </p>
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", padding: "20px 10px 40px" }}>
        <div style={{ position: "absolute", top: 40, left: 20, right: 20, height: 3, background: BORDER }} />
        {marcos.map((m) => (
          <div key={m.ano} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 2, flex: 1 }}>
            <div
              style={{
                width: 20, height: 20, borderRadius: 999,
                background: m.pct === 100 ? RED : m.pct > 0 ? "#84e5b3" : "rgba(232,235,255,.2)",
                border: `3px solid ${SURFACE}`, boxShadow: "0 0 0 1px rgba(255,255,255,.15)",
              }}
            />
            <p style={{ fontSize: 12, fontWeight: 800, color: TEXT, marginTop: 12 }}>{m.ano}</p>
            <p style={{ fontSize: 10, color: TEXT_MUTED, textAlign: "center", maxWidth: 80, marginTop: 2 }}>{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
