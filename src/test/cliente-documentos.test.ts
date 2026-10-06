import { describe, expect, it } from "vitest";
import {
  CLIENTE_DOCUMENTO_TIPOS,
  formatDocumentoBytes,
  isClienteDocumentoTipo,
  pathClienteDocumento,
  sanitizeDocumentoFileName,
  validarArquivoClienteDocumento,
} from "@/lib/cliente-documentos";

describe("tipos de anexo do cliente", () => {
  it("cobre contrato, procuração, contrato social e certidão", () => {
    expect(CLIENTE_DOCUMENTO_TIPOS.map((item) => item.value)).toEqual([
      "contrato",
      "procuracao",
      "contrato_social",
      "certidao",
      "outro",
    ]);
    expect(isClienteDocumentoTipo("procuracao")).toBe(true);
    expect(isClienteDocumentoTipo("triagem")).toBe(false);
  });
});

describe("path e validação do arquivo", () => {
  it("guarda o arquivo em cadastro/{tipo} sem colidir com a triagem", () => {
    expect(pathClienteDocumento("c1", "contrato", "contrato.pdf", 1700000000000)).toBe(
      "c1/cadastro/contrato/1700000000000-contrato.pdf",
    );
    expect(pathClienteDocumento("c1", "procuracao", "a.pdf", 1)).not.toMatch(/\/triagem\//);
  });

  it("sanitiza o nome e recusa arquivo acima de 10 MB", () => {
    expect(sanitizeDocumentoFileName("contrato social (1).pdf")).toBe("contrato_social_1_.pdf");
    const ok = new File(["x"], "ok.pdf", { type: "application/pdf" });
    expect(validarArquivoClienteDocumento(ok)).toBeNull();
    const grande = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.pdf");
    expect(validarArquivoClienteDocumento(grande)).toMatch(/10 MB/);
  });

  it("formata tamanho para a lista", () => {
    expect(formatDocumentoBytes(512)).toBe("512 B");
    expect(formatDocumentoBytes(2048)).toBe("2 KB");
    expect(formatDocumentoBytes(null)).toBe("—");
  });
});
