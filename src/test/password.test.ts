import { describe, expect, it } from "vitest";
import { SENHA_MIN, gerarSenha, validarSenha } from "@/lib/password";

describe("gerarSenha", () => {
  it("respeita o tamanho pedido e o piso de 8", () => {
    expect(gerarSenha(14)).toHaveLength(14);
    expect(gerarSenha(20)).toHaveLength(20);
    expect(gerarSenha(4)).toHaveLength(8);
    expect(gerarSenha()).toHaveLength(14);
  });

  it("tem maiúscula, minúscula, dígito e símbolo", () => {
    for (let i = 0; i < 50; i++) {
      const s = gerarSenha();
      expect(s).toMatch(/[A-Z]/);
      expect(s).toMatch(/[a-z]/);
      expect(s).toMatch(/[0-9]/);
      expect(s).toMatch(/[!@#$%&*?]/);
    }
  });

  it("não usa caracteres ambíguos (I, l, 1, O, 0)", () => {
    for (let i = 0; i < 50; i++) {
      expect(gerarSenha()).not.toMatch(/[Il1O0]/);
    }
  });

  it("não repete a mesma senha", () => {
    const geradas = new Set(Array.from({ length: 30 }, () => gerarSenha()));
    expect(geradas.size).toBe(30);
  });

  it("nunca sai abaixo do mínimo aceito pelo backend", () => {
    expect(gerarSenha(1).length).toBeGreaterThanOrEqual(SENHA_MIN);
  });
});

describe("validarSenha", () => {
  it("recusa vazia e curta, aceita a partir do mínimo", () => {
    expect(validarSenha("")).toBe("Informe uma senha");
    expect(validarSenha("abc")).toContain("pelo menos");
    expect(validarSenha("abcdef")).toBeNull();
    expect(validarSenha(gerarSenha())).toBeNull();
  });
});
