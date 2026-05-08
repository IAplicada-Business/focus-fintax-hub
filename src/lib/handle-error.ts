import { toast } from "sonner";

export function toastError(err: unknown, fallbackMsg = "Ocorreu um erro inesperado") {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : fallbackMsg;
  toast.error(message);
}
