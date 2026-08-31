import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRowSelection } from "@/hooks/useRowSelection";

describe("useRowSelection", () => {
  it("toggles individual ids and reports visible selection", () => {
    const { result } = renderHook(() => useRowSelection(["a", "b", "c"]));

    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.someVisibleSelected).toBe(true);
    expect(result.current.allVisibleSelected).toBe(false);

    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });

  it("selects and clears all visible ids", () => {
    const { result } = renderHook(() => useRowSelection(["a", "b"]));

    act(() => result.current.toggleAll(["a", "b"]));
    expect(result.current.allVisibleSelected).toBe(true);
    expect(result.current.selectedCount).toBe(2);

    act(() => result.current.toggleAll(["a", "b"]));
    expect(result.current.selectedCount).toBe(0);
    expect(result.current.allVisibleSelected).toBe(false);

    act(() => result.current.toggleAll(["a", "b"]));
    act(() => result.current.clear());
    expect(result.current.selectedCount).toBe(0);
  });
});
