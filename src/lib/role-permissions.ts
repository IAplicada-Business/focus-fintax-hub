export const EDITABLE_STAGES_COMERCIAL = [
  "qualificado",
  "apresentacao",
  "triagem",
  "contrato_emitido",
  "contrato_assinado",
];

export function canEditLead(role: string | null, stage: string): boolean {
  if (!role) return false;
  if (role === "admin" || role === "pmo") return true;
  if (role === "comercial") return EDITABLE_STAGES_COMERCIAL.includes(stage);
  return false;
}

export function canDragInPipeline(role: string | null): boolean {
  if (!role) return false;
  if (role === "gestor_tributario") return false;
  return ["admin", "pmo", "comercial"].includes(role);
}

export function isReadOnlyRoute(role: string | null, path: string): boolean {
  if (!role || role === "admin" || role === "pmo") return false;
  if (role === "comercial" && path.startsWith("/clientes")) return true;
  if (role === "gestor_tributario" && path.startsWith("/pipeline")) return true;
  return false;
}
