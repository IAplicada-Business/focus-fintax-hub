import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BatchDeleteBarProps {
  count: number;
  onConfirm: () => void | Promise<void>;
  title?: string;
  description: string;
  disabled?: boolean;
}

export function BatchDeleteBar({
  count,
  onConfirm,
  title = "Confirmar exclusão",
  description,
  disabled,
}: BatchDeleteBarProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (count === 0) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
      <p className="text-sm font-medium text-foreground">
        {count} selecionado{count === 1 ? "" : "s"}
      </p>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" disabled={disabled || busy}>
            <Trash2 className="h-4 w-4" />
            Excluir {count} selecionado{count === 1 ? "" : "s"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
              disabled={busy}
              className="bg-[#c8001e] hover:bg-[#a30019] text-white"
            >
              {busy ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
