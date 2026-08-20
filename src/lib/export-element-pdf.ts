import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/** Limite seguro de dimensão do canvas (Chrome ~16384; usamos margem). */
const MAX_CANVAS_EDGE = 8192;

export function sanitizePdfFileName(s: string, max = 60) {
  return (s || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
}

function pickSafeScale(cssWidth: number, cssHeight: number, preferred = 2) {
  const maxDim = Math.max(cssWidth, cssHeight, 1);
  const capped = Math.floor((MAX_CANVAS_EDGE / maxDim) * 100) / 100;
  return Math.max(0.5, Math.min(preferred, capped));
}

/**
 * Captura um elemento HTML para PDF A4 multipágina.
 *
 * Por que clonar fora do DOM atual:
 * - O "Mapa Tributário" vive dentro de um Dialog Radix com
 *   `translate-x-[-50%] translate-y-[-50%]`. html2canvas falha ou gera
 *   página em branco quando algum ancestral tem CSS transform.
 * - Clonar e renderizar no body (sem transform) contorna isso.
 * - Também evita o clip de `overflow`/`max-height` do Dialog (90vh).
 */
export async function exportElementToPdf(
  source: HTMLElement,
  filename: string,
  opts?: { preferredScale?: number; footerLeft?: string },
): Promise<void> {
  if (!source) throw new Error("Elemento do mapa não encontrado na tela.");

  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  // Checkboxes/controles interativos não entram no PDF
  clone.querySelectorAll(".print\\:hidden, [data-pdf-ignore]").forEach((n) => n.remove());

  const host = document.createElement("div");
  host.setAttribute("data-pdf-export-host", "true");
  // Fora da viewport, opacidade 1 — html2canvas precisa "ver" o nó.
  // NÃO usar opacity:0 (gera PDF em branco) nem transform (quebra a captura).
  host.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "z-index:-1",
    "pointer-events:none",
    "overflow:visible",
    "transform:none",
    "filter:none",
    "background:#ffffff",
  ].join(";");

  const widthPx = Math.max(source.scrollWidth, source.offsetWidth, 794);
  clone.style.cssText = [
    `width:${widthPx}px`,
    "max-width:none",
    "height:auto",
    "max-height:none",
    "overflow:visible",
    "transform:none",
    "filter:none",
    "position:static",
    "margin:0",
    "background:#ffffff",
    "color:#111111",
  ].join(";");

  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    // Espera layout + fontes (logo SVG inline pode ainda estar resolvendo)
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        /* ignore */
      }
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const cssWidth = Math.max(clone.scrollWidth, clone.offsetWidth, widthPx);
    const cssHeight = Math.max(clone.scrollHeight, clone.offsetHeight, 1);
    if (cssHeight < 8) {
      throw new Error("O conteúdo do mapa está vazio — não há o que exportar.");
    }

    const scale = pickSafeScale(cssWidth, cssHeight, opts?.preferredScale ?? 2);

    const canvas = await html2canvas(clone, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: cssWidth,
      windowHeight: cssHeight,
      width: cssWidth,
      height: cssHeight,
    });

    if (!canvas.width || !canvas.height) {
      throw new Error("A captura do mapa veio vazia (canvas 0×0).");
    }

    // Detecta captura "em branco" (quase só branco) — sintoma clássico do transform no Dialog
    const probe = document.createElement("canvas");
    probe.width = Math.min(64, canvas.width);
    probe.height = Math.min(64, canvas.height);
    const pctx = probe.getContext("2d");
    if (pctx) {
      pctx.drawImage(canvas, 0, 0, probe.width, probe.height);
      const pixels = pctx.getImageData(0, 0, probe.width, probe.height).data;
      let nonWhite = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) nonWhite++;
      }
      if (nonWhite < 8) {
        throw new Error(
          "A captura do mapa saiu em branco. Geralmente isso acontece por CSS transform no Dialog — tente de novo; se persistir, use Ctrl+P.",
        );
      }
    }

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
    while (heightLeft > 0.5) {
      position -= pageHeightMm;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
      heightLeft -= pageHeightMm;
    }

    const pageCount = pdf.getNumberOfPages();
    const nowStr = new Date().toLocaleDateString("pt-BR");
    const footerLeft = opts?.footerLeft ?? `Fintax · Confidencial · Gerado em ${nowStr}`;
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      pdf.text(footerLeft, 10, pageHeightMm - 6);
      pdf.text(`Página ${i} de ${pageCount}`, pageWidthMm - 32, pageHeightMm - 6);
    }

    const safeName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    pdf.save(safeName);
  } finally {
    host.remove();
  }
}
