import { useEffect, useState, useRef, useCallback } from "react";
import logoFocus from "@/assets/logo-focus-fintax.svg";
import logoFocusWhite from "@/assets/logo-focus-fintax-white.png";
import { useParams } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

interface Tese {
  tese_nome: string;
  estimativa_minima: number;
  estimativa_maxima: number;
  percentual_minimo: number;
  percentual_maximo: number;
  descricao_comercial?: string;
}

interface DiagnosticoData {
  lead: {
    empresa: string;
    nome: string;
    segmento: string;
    faturamento_faixa: string;
    regime_tributario: string;
    whatsapp: string;
    criado_em: string;
  };
  relatorio: {
    teses_identificadas: Tese[];
    estimativa_total_minima: number;
    estimativa_total_maxima: number;
    score: number;
    criado_em: string;
  } | null;
}

import { SEGMENTO_LABELS, FATURAMENTO_MIDPOINTS } from "@/lib/pipeline-constants";


const NICHE_IMAGES: Record<string, string> = {
  supermercado: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=1200&q=80&auto=format&fit=crop",
  farmacia: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&q=80&auto=format&fit=crop",
  pet: "https://images.unsplash.com/photo-1601758003122-53c40e686a19?w=1200&q=80&auto=format&fit=crop",
  materiais_construcao: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80&auto=format&fit=crop",
  outros: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80&auto=format&fit=crop",
};

const TESE_DESCRICOES_FALLBACK: Record<string, string> = {
  "PIS/COFINS Insumos": "Produtos com tributação concentrada na indústria — o varejo pode ter direito à restituição de valores pagos indevidamente na cadeia.",
  "Exclusão ICMS da Base PIS/COFINS": "Decisão histórica do STF (RE 574.706 — Tema 69): o ICMS não compõe o faturamento para fins de PIS/COFINS. Risco baixíssimo — jurisprudência consolidada.",
  "Subvenção ICMS (IRPJ/CSLL)": "Incentivos fiscais de ICMS podem ser excluídos da base de IRPJ e CSLL, gerando economia tributária relevante.",
  "Reporto / PIS-COFINS Acumulado": "Regime tributário para modernização e créditos acumulados de PIS/COFINS passíveis de compensação administrativa.",
  "Exclusão ICMS-ST": "O ICMS retido por substituição tributária não representa receita — logo, não deve compor a base de PIS/COFINS.",
};

function formatValue(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `R$ ${Math.round(v / 1_000)} mil`;
  return `R$ ${v}`;
}

function formatHeroNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",");
  if (n >= 1_000) return Math.round(n / 1_000).toLocaleString("pt-BR");
  return n.toString();
}

function heroSuffix(n: number): string {
  if (n >= 1_000_000) return " mi";
  if (n >= 1_000) return " mil";
  return "";
}

function useAnimatedCounter(target: number, duration = 1600, startDelay = 600) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (target <= 0) return;
    const timeout = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4);
        setValue(Math.round(ease * target));
        if (progress < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }, startDelay);
    return () => {
      clearTimeout(timeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, startDelay]);

  return value;
}

function useFonts() {
  useEffect(() => {
    const id = "diagnostico-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
  }, []);
}

function useStyles() {
  useEffect(() => {
    const id = "diagnostico-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      :root {
        --dg-navy: #0a1564;
        --dg-red: #c8001e;
        --dg-ink: #111827;
        --dg-surface: #ffffff;
        --dg-page: #f7f7f5;
        --dg-gold: #b8860b;
        --dg-green: #00c853;
        --dg-border: rgba(17,24,39,0.09);
        --dg-ink-60: rgba(17,24,39,0.6);
        --dg-ink-30: rgba(17,24,39,0.3);
        --dg-ink-10: rgba(17,24,39,0.1);
      }
      @keyframes dg-fadeUp {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .dg-fade-up {
        opacity: 0;
        animation: dg-fadeUp 0.55s ease-out forwards;
      }
      .dg-d1 { animation-delay: 0.1s; }
      .dg-d2 { animation-delay: 0.2s; }
      .dg-d3 { animation-delay: 0.3s; }
      .dg-d4 { animation-delay: 0.4s; }
      .dg-d5 { animation-delay: 0.5s; }
      .dg-d6 { animation-delay: 0.6s; }
      .dg-d7 { animation-delay: 0.7s; }
      .dg-d8 { animation-delay: 0.8s; }
      @media print {
        @page { margin: 0; size: A4; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .dg-page { background: #fff !important; }
        .dg-fade-up { opacity: 1 !important; animation: none !important; }
        .dg-cta-section, .dg-cta-buttons { display: none !important; }
        .dg-hero-img { height: 160px !important; }
        *, *::before, *::after { transition: none !important; animation: none !important; }
      }
      @media (max-width: 600px) {
        .dg-total-inner { flex-direction: column !important; text-align: center !important; }
        .dg-total-inner > div:last-child { margin-top: 16px; }
        .dg-hero-text h1 { font-size: 28px !important; }
        .dg-tese-grid { grid-template-columns: 1fr !important; }
        .dg-tese-right { text-align: left !important; margin-top: 8px; }
        .dg-stamps { gap: 16px !important; }
        .dg-cta-buttons { flex-direction: column !important; }
      }
    `;
    document.head.appendChild(style);
  }, []);
}


const WhatsAppSVG = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export default function Diagnostico() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<DiagnosticoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [barsVisible, setBarsVisible] = useState(false);

  useFonts();
  useStyles();

  useEffect(() => {
    if (!token) return;
    supabase
      .rpc("get_diagnostico_by_token", { _token: token })
      .then(({ data: result, error: err }) => {
        if (err || !result || !(result as any).lead) {
          setError(true);
        } else {
          setData(result as unknown as DiagnosticoData);
        }
        setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    if (data) {
      const t = setTimeout(() => setBarsVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f7f5", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ color: "var(--dg-ink-60)", fontSize: 14 }}>Carregando diagnóstico...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f7f5", fontFamily: "'DM Sans', sans-serif", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 48, opacity: 0.3 }}>📄</div>
        <h1 style={{ color: "var(--dg-ink)", fontSize: 20, fontWeight: 600 }}>Diagnóstico não encontrado</h1>
        <p style={{ color: "var(--dg-ink-60)", fontSize: 13 }}>O link pode estar incorreto ou o diagnóstico ainda não foi gerado.</p>
        <a href="/" style={{ color: "var(--dg-red)", fontSize: 13, textDecoration: "underline" }}>Voltar à página inicial</a>
      </div>
    );
  }

  const { lead, relatorio } = data;
  const teses = (relatorio?.teses_identificadas || []).filter((t) => t.estimativa_maxima > 0);
  const minTotal = relatorio?.estimativa_total_minima || 0;
  const maxTotal = relatorio?.estimativa_total_maxima || 0;
  const maxTese = Math.max(...teses.map((t) => t.estimativa_maxima), 1);
  const midpoint = FATURAMENTO_MIDPOINTS[lead.faturamento_faixa] || 1_000_000;
  const multiplier = midpoint > 0 ? (maxTotal / midpoint).toFixed(1).replace(".", ",") : "0";

  return <DiagnosticoContent
    lead={lead}
    teses={teses}
    minTotal={minTotal}
    maxTotal={maxTotal}
    maxTese={maxTese}
    multiplier={multiplier}
    barsVisible={barsVisible}
    relatorio={relatorio}
  />;
}

interface ContentProps {
  lead: DiagnosticoData["lead"];
  teses: Tese[];
  minTotal: number;
  maxTotal: number;
  maxTese: number;
  multiplier: string;
  barsVisible: boolean;
  relatorio: DiagnosticoData["relatorio"];
}

function DiagnosticoContent({ lead, teses, minTotal, maxTotal, maxTese, multiplier, barsVisible, relatorio }: ContentProps) {
  const animMin = useAnimatedCounter(minTotal);
  const animMax = useAnimatedCounter(maxTotal);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPDF = useCallback(async () => {
    const element = document.querySelector('.dg-page') as HTMLElement;
    if (!element || downloading) return;
    setDownloading(true);

    // Hide CTA section and disable animations for capture
    const ctaSection = element.querySelector('.dg-cta-section') as HTMLElement;
    const fadeEls = element.querySelectorAll('.dg-fade-up') as NodeListOf<HTMLElement>;
    
    if (ctaSection) ctaSection.style.display = 'none';
    fadeEls.forEach(el => {
      el.style.opacity = '1';
      el.style.animation = 'none';
    });

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f7f7f5',
        logging: false,
        allowTaint: false,
      });

      const imgWidth = 210; // A4 mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageHeight = 297; // A4 mm
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      let heightLeft = imgHeight;
      let position = 0;
      const imgData = canvas.toDataURL('image/jpeg', 0.92);

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const empresa = lead.empresa.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
      pdf.save(`diagnostico-${empresa}.pdf`);
    } catch (err) {
      if (import.meta.env.DEV) console.error('PDF generation error:', err);
      // Fallback to print
      window.print();
    } finally {
      // Restore elements
      if (ctaSection) ctaSection.style.display = '';
      fadeEls.forEach(el => {
        el.style.opacity = '';
        el.style.animation = '';
      });
      setDownloading(false);
    }
  }, [downloading, lead.empresa]);

  const whatsappMsg = encodeURIComponent(
    `Olá! Acabei de receber o diagnóstico tributário da Focus FinTax para ${lead.empresa}. O potencial estimado de recuperação é de ${formatValue(minTotal)} a ${formatValue(maxTotal)}. Gostaria de agendar a análise completa.`
  );
  const whatsappUrl = `https://wa.me/5521999999999?text=${whatsappMsg}`;
  const segLabel = SEGMENTO_LABELS[lead.segmento] || lead.segmento;
  const heroImg = NICHE_IMAGES[lead.segmento] || NICHE_IMAGES.outros;
  const reportDate = relatorio?.criado_em ? new Date(relatorio.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="dg-page" style={{
      minHeight: "100vh",
      background: "#f7f7f5",
      color: "var(--dg-ink)",
      fontFamily: "'DM Sans', sans-serif",
      overflowX: "hidden",
    }}>
      {/* Header */}
      <header className="dg-header dg-fade-up dg-d1" style={{
        background: "#0a1564",
        padding: "16px 48px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <img src={logoFocusWhite} alt="Focus FinTax" style={{ height: 64, width: "auto" }} />
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 100, padding: "6px 16px",
          fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 500,
          letterSpacing: 2, textTransform: "uppercase",
          color: "rgba(255,255,255,0.8)",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: "#00c853",
            display: "inline-block",
          }} />
          Diagnóstico Gerado
        </div>
      </header>

      {/* Hero Image */}
      <div className="dg-hero-img dg-fade-up dg-d2" style={{
        position: "relative", height: 240, overflow: "hidden",
      }}>
        <img
          src={heroImg}
          alt={`Segmento ${segLabel}`}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(10,21,100,0.5) 0%, rgba(10,21,100,0.85) 100%)",
        }} />
        <div className="dg-hero-text" style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "32px 48px",
        }}>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500,
            letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.7)",
            marginBottom: 8,
          }}>
            Diagnóstico Tributário · Estimativa Preliminar
          </div>
          <h1 style={{
            fontFamily: "'DM Serif Display', serif", fontSize: 36,
            fontWeight: 400, lineHeight: 1.15, color: "#fff", marginBottom: 4,
          }}>
            {lead.empresa}
          </h1>
          <p style={{
            fontFamily: "'DM Serif Display', serif", fontStyle: "italic",
            fontSize: 18, color: "rgba(255,255,255,0.8)", marginBottom: 8,
          }}>
            identificamos <span style={{ color: "#f5c842" }}>oportunidades reais</span>
          </p>
          <p style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1,
            color: "rgba(255,255,255,0.6)", textTransform: "uppercase",
          }}>
            {lead.regime_tributario} · Período de 60 meses
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Total card */}
        {maxTotal > 0 && (
          <div className="dg-total-card dg-fade-up dg-d3" style={{
            background: "#0a1564", borderRadius: 16, padding: "36px 40px",
            marginBottom: 32, color: "#fff",
          }}>
            <div className="dg-total-inner" style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500,
                  letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.6)",
                  marginBottom: 12,
                }}>
                  Potencial total de recuperação tributária estimado
                </div>
                <div style={{
                  fontFamily: "'DM Serif Display', serif", fontSize: 44,
                  lineHeight: 1, marginBottom: 8,
                }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 20, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, verticalAlign: "top", marginRight: 4 }}>R$</span>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>{formatHeroNumber(animMin)}{heroSuffix(minTotal)}</span>
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 24, margin: "0 12px" }}>→</span>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 20, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, verticalAlign: "top", marginRight: 4 }}>R$</span>
                  <span>{formatHeroNumber(animMax)}{heroSuffix(maxTotal)}</span>
                </div>
                <div style={{
                  fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.5,
                }}>
                  Estimativa conservadora a agressiva — {teses.length} teses identificadas
                </div>
              </div>
              <div style={{
                background: "rgba(184,134,11,0.15)", border: "1px solid rgba(184,134,11,0.4)",
                borderRadius: 12, padding: "16px 24px", textAlign: "center",
                flexShrink: 0,
              }}>
                <div style={{
                  fontFamily: "'DM Serif Display', serif", fontSize: 36,
                  color: "#f5c842", lineHeight: 1,
                }}>
                  {multiplier}×
                </div>
                <div style={{
                  fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 500,
                  color: "rgba(255,255,255,0.6)", marginTop: 4, letterSpacing: 0.5,
                }}>
                  faturamentos<br />mensais
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section row */}
        {teses.length > 0 && (
          <div className="dg-fade-up dg-d4" style={{
            display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
          }}>
            <span style={{
              fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 500,
              letterSpacing: 3, textTransform: "uppercase", color: "var(--dg-ink-60)",
              whiteSpace: "nowrap",
            }}>
              {teses.length} teses identificadas
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--dg-ink-10)" }} />
            <span style={{
              fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 500,
              letterSpacing: 3, textTransform: "uppercase", color: "var(--dg-ink-60)",
              whiteSpace: "nowrap",
            }}>
              {lead.regime_tributario} · {segLabel}
            </span>
          </div>
        )}

        {/* Tese cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 36 }}>
          {teses.map((t, i) => {
            const barWidth = Math.round((t.estimativa_maxima / maxTese) * 100);
            const desc = t.descricao_comercial || TESE_DESCRICOES_FALLBACK[t.tese_nome] || "Tese tributária com potencial de recuperação de créditos para o seu segmento.";
            const stripeColor = i === 0 ? "#c8001e" : i === 1 ? "#0a1564" : "var(--dg-ink-10)";

            return (
              <div key={i} className={`dg-tese-card dg-fade-up`} style={{
                background: "#ffffff",
                border: "1px solid rgba(17,24,39,0.09)",
                borderLeft: `4px solid ${stripeColor}`,
                borderRadius: 12,
                padding: "20px 24px",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 16,
                alignItems: "center",
                animationDelay: `${0.35 + i * 0.08}s`,
              }}>
                <div className="dg-tese-grid" style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500,
                    letterSpacing: 2, color: "#c8001e", marginBottom: 4,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    TESE {String(i + 1).padStart(2, "0")}
                    <span style={{ display: "block", width: 20, height: 1, background: "rgba(200,0,30,0.3)" }} />
                  </div>
                  <div style={{
                    fontSize: 15, fontWeight: 600, lineHeight: 1.3,
                    color: "var(--dg-ink)", marginBottom: 4,
                  }}>
                    {t.tese_nome}
                  </div>
                  <div style={{
                    fontSize: 12, color: "var(--dg-ink-60)", lineHeight: 1.6,
                    maxWidth: 480,
                  }}>
                    {desc}
                  </div>
                  <div style={{
                    marginTop: 12, height: 3, background: "var(--dg-ink-10)",
                    borderRadius: 2, overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      background: "linear-gradient(90deg, #c8001e 0%, #e8001e 100%)",
                      borderRadius: 2,
                      width: barsVisible ? `${barWidth}%` : "0%",
                      transition: "width 1.4s cubic-bezier(0.16,1,0.3,1)",
                      transitionDelay: `${0.3 + i * 0.12}s`,
                    }} />
                  </div>
                </div>
                <div className="dg-tese-right" style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{
                    fontSize: 9, fontFamily: "'DM Mono', monospace", fontWeight: 500,
                    letterSpacing: 2, textTransform: "uppercase",
                    color: "var(--dg-ink-30)", marginBottom: 4,
                  }}>
                    Estimativa 5 anos
                  </div>
                  <div style={{ lineHeight: 1.2 }}>
                    <div style={{ fontSize: 14, color: "var(--dg-ink-60)", fontWeight: 500 }}>
                      {formatValue(t.estimativa_minima)}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--dg-ink-30)", display: "block", margin: "1px 0" }}>até</span>
                    <div style={{ fontSize: 18, color: "var(--dg-ink)", fontWeight: 600 }}>
                      {formatValue(t.estimativa_maxima)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Disclaimer */}
        <div className="dg-disclaimer dg-fade-up dg-d6" style={{
          background: "rgba(184,134,11,0.08)",
          border: "1px solid rgba(184,134,11,0.2)",
          borderLeft: "4px solid var(--dg-gold)",
          borderRadius: 10,
          padding: "16px 20px",
          marginBottom: 40,
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
        }}>
          <svg style={{ width: 18, height: 18, flexShrink: 0, marginTop: 1 }} viewBox="0 0 24 24" fill="none" stroke="var(--dg-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          <p style={{ fontSize: 12, color: "var(--dg-ink-60)", lineHeight: 1.7 }}>
            <strong style={{ color: "var(--dg-gold)", fontWeight: 600 }}>Análise Estimada · Dados Declarados</strong><br />
            Os valores acima são projeções preliminares com base no faturamento e regime informados, calculadas a partir de médias históricas de empresas do mesmo segmento. A análise completa e definitiva requer acesso às declarações fiscais, Speds e balancetes contábeis. Prazo legal para recuperação: <strong style={{ color: "var(--dg-gold)", fontWeight: 600 }}>5 anos retroativos</strong>. Cada mês sem análise reduz o período recuperável.
          </p>
        </div>

        {/* CTA Section */}
        <div className="dg-cta-section dg-fade-up dg-d7" style={{ textAlign: "center", marginBottom: 40 }}>
          <p style={{
            fontFamily: "'DM Serif Display', serif", fontSize: 26,
            color: "var(--dg-ink)", marginBottom: 6, lineHeight: 1.3,
          }}>
            Transforme esse potencial em caixa real.
          </p>
          <p style={{ fontSize: 13, color: "var(--dg-ink-60)", marginBottom: 28 }}>
            Avaliamos seus documentos em 48h. Se não recuperarmos, você não paga nada.
          </p>
          <div className="dg-cta-buttons" style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "14px 28px", borderRadius: 10,
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14,
              background: "#c8001e", color: "#fff",
              boxShadow: "0 4px 20px rgba(200,0,30,0.3)",
              textDecoration: "none", border: "none", cursor: "pointer",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <WhatsAppSVG />
              Quero minha análise completa
            </a>
            <button onClick={handleDownloadPDF} disabled={downloading} style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "14px 28px", borderRadius: 10,
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14,
              background: "transparent", color: "var(--dg-ink-60)",
              border: "1px solid var(--dg-ink-10)", cursor: "pointer",
              transition: "transform 0.2s, background 0.2s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.background = "var(--dg-ink-10)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.background = "transparent"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {downloading ? 'Gerando PDF…' : 'Baixar diagnóstico'}
            </button>
          </div>
        </div>

        {/* Trust stamps */}
        <div className="dg-stamps dg-fade-up dg-d8" style={{
          display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap",
        }}>
          {["Processos amparados pelo STF", "Sem custo inicial · Só no sucesso", "Prazo legal: 5 anos retroativos", "Confidencialidade total"].map((text) => (
            <div key={text} style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 11, color: "var(--dg-ink-30)", fontWeight: 500, letterSpacing: 0.5,
            }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--dg-ink-30)" }} />
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="dg-footer" style={{
        background: "#0a1564",
        padding: "20px 48px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 11,
        color: "rgba(255,255,255,0.5)",
        letterSpacing: 0.5,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={logoFocus} alt="Focus FinTax" style={{ height: 36, width: "auto", opacity: 0.85 }} />
          <span>Focus FinTax LTDA · Grupo Focus · A Contabilidade do Supermercado</span>
        </div>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{reportDate}</span>
      </footer>
    </div>
  );
}
