import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { currentMonthKey } from "@/lib/month-key";
import {
  LIMPAR,
  MESES_CURTOS,
  aoEscolherAno,
  aoEscolherMes,
  listarAnos,
} from "@/lib/competencia-select";

interface MonthPickerProps {
  /** Competência no formato `YYYY-MM`; string vazia = sem seleção. */
  value: string;
  onChange: (yyyyMm: string) => void;
  /** Oferece a opção "—" para zerar a competência (filtros). */
  clearable?: boolean;
  /** Aplicado ao par; use `w-full` para o par ocupar a linha inteira. */
  className?: string;
  /** Aplicado aos dois campos — altura em formulário e em célula de tabela. */
  triggerClassName?: string;
  "aria-label"?: string;
}

/**
 * Competência `YYYY-MM` em dois campos independentes — mês e ano —, com os
 * meses em português (não depende do idioma do sistema operacional).
 */
export function MonthPicker({
  value,
  onChange,
  clearable = true,
  className,
  triggerClassName,
  "aria-label": ariaLabel,
}: MonthPickerProps) {
  const parsed = String(value || "").match(/^(\d{4})-(\d{2})/);
  const mes = parsed ? parsed[2] : "";
  const ano = parsed ? Number(parsed[1]) : undefined;

  // Ano escolhido antes do mês: o par ainda não forma uma competência, então
  // fica aqui até o mês chegar, em vez de emitir um valor pela metade.
  const [anoPendente, setAnoPendente] = useState<number | undefined>(undefined);
  const anoVisivel = ano ?? anoPendente;
  const anoCorrente = Number(currentMonthKey().slice(0, 4));

  const trocarMes = (v: string) => {
    const proxima = aoEscolherMes(v, anoVisivel, anoCorrente);
    setAnoPendente(v === LIMPAR ? anoVisivel : undefined);
    if (proxima !== null) onChange(proxima);
  };

  const trocarAno = (v: string) => {
    const proxima = aoEscolherAno(v, mes);
    setAnoPendente(proxima === null ? Number(v) : undefined);
    if (proxima !== null) onChange(proxima);
  };

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Select value={mes || undefined} onValueChange={trocarMes}>
        <SelectTrigger
          className={cn("h-8 min-w-[4.5rem] flex-1 px-2.5 text-xs", triggerClassName)}
          aria-label={ariaLabel ? `${ariaLabel} — mês` : "Mês"}
        >
          <SelectValue placeholder="Mês" />
        </SelectTrigger>
        <SelectContent>
          {clearable && <SelectItem value={LIMPAR}>—</SelectItem>}
          {MESES_CURTOS.map((m) => (
            <SelectItem key={m.v} value={m.v}>{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={anoVisivel ? String(anoVisivel) : undefined} onValueChange={trocarAno}>
        <SelectTrigger
          className={cn("h-8 min-w-[5rem] flex-1 px-2.5 text-xs", triggerClassName)}
          aria-label={ariaLabel ? `${ariaLabel} — ano` : "Ano"}
        >
          <SelectValue placeholder="Ano" />
        </SelectTrigger>
        <SelectContent>
          {clearable && <SelectItem value={LIMPAR}>—</SelectItem>}
          {listarAnos(anoVisivel, anoCorrente).map((a) => (
            <SelectItem key={a} value={String(a)}>{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
