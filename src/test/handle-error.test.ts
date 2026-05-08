import { describe, it, expect } from "vitest";
import { toastError } from "@/lib/handle-error";

describe("toastError", () => {
  it("should not throw for Error instances", () => {
    expect(() => toastError(new Error("test error"))).not.toThrow();
  });

  it("should not throw for string errors", () => {
    expect(() => toastError("string error")).not.toThrow();
  });

  it("should not throw for unknown error types", () => {
    expect(() => toastError(42, "fallback")).not.toThrow();
    expect(() => toastError(null, "fallback")).not.toThrow();
    expect(() => toastError(undefined)).not.toThrow();
  });
});
