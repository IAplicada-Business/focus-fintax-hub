import { describe, it, expect } from "vitest";
import { phoneDigits, phonesMatch } from "@/lib/phone-match";

describe("phone-match", () => {
  it("strips non-digits", () => {
    expect(phoneDigits("(21) 98114-3032")).toBe("21981143032");
  });

  it("matches formatted lead whatsapp with normalized conversa", () => {
    expect(phonesMatch("(21) 98114-3032", "5521981143032")).toBe(true);
    expect(phonesMatch("21981143032", "5521981143032")).toBe(true);
    expect(phonesMatch("21981143032", "11988887777")).toBe(false);
  });
});
