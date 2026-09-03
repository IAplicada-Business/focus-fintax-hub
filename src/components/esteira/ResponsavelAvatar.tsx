import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { corAvatar, iniciais } from "@/lib/esteira-acompanhamento";
import { cn } from "@/lib/utils";

interface Props {
  nome: string | null | undefined;
  size?: "xs" | "sm" | "md";
  /** Mostra o nome ao lado do círculo. */
  comNome?: boolean;
  className?: string;
}

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
};

/**
 * Avatar por iniciais (profiles não tem foto — upload fica pra fase posterior).
 * Sem responsável = círculo tracejado, pra saltar aos olhos na tabela.
 */
export function ResponsavelAvatar({ nome, size = "sm", comNome = false, className }: Props) {
  const semResponsavel = !nome || nome.trim() === "";
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)} title={semResponsavel ? "Sem responsável" : nome ?? undefined}>
      <Avatar className={cn(SIZE[size], semResponsavel && "border border-dashed border-amber-400 bg-amber-50")}>
        <AvatarFallback
          className={cn("font-bold", SIZE[size], semResponsavel ? "bg-transparent text-amber-700" : corAvatar(nome))}
        >
          {semResponsavel ? "?" : iniciais(nome)}
        </AvatarFallback>
      </Avatar>
      {comNome && (
        <span className={cn("truncate text-xs", semResponsavel ? "font-medium text-amber-700" : "text-foreground")}>
          {semResponsavel ? "Sem responsável" : nome}
        </span>
      )}
    </span>
  );
}
