import { useCallback, useMemo, useState } from "react";

export function useRowSelection(visibleIds: string[] = []) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const selectedCount = selectedIds.size;
  const visibleSelectedCount = useMemo(
    () => visibleIds.filter((id) => selectedIds.has(id)).length,
    [visibleIds, selectedIds],
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  return {
    selectedIds,
    selectedCount,
    visibleSelectedCount,
    allVisibleSelected,
    someVisibleSelected,
    toggle,
    toggleAll,
    clear,
    isSelected,
  };
}
