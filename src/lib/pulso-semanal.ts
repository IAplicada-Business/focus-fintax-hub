import { BUSINESS_TIME_ZONE, currentMonthKey } from "@/lib/month-key";

const DIA_MS = 86_400_000;
const MONTH_LABEL = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: BUSINESS_TIME_ZONE,
});
const DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  timeZone: BUSINESS_TIME_ZONE,
});

export interface PulsoSemana {
  key: string;
  numero: number;
  inicioDia: number;
  fimDia: number;
  inicioIso: string;
  fimExclusivoIso: string;
  label: string;
}

const diasNoMes = (monthKey: string) => {
  const [ano, mes] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(ano, mes, 0, 12)).getUTCDate();
};

/**
 * Converte meia-noite de São Paulo em ISO. O Brasil não usa horário de verão
 * desde 2019; manter o offset explícito evita o navegador deslocar o dia.
 */
const inicioDiaBrt = (monthKey: string, dia: number) =>
  new Date(`${monthKey}-${String(dia).padStart(2, "0")}T00:00:00-03:00`);

/** Semanas administrativas do mês: 01–07, 08–14, 15–21, 22–28 e 29–fim. */
export function semanasDoMes(monthKey: string): PulsoSemana[] {
  const ultimoDia = diasNoMes(monthKey);
  const semanas: PulsoSemana[] = [];
  for (let inicio = 1, numero = 1; inicio <= ultimoDia; inicio += 7, numero += 1) {
    const fim = Math.min(inicio + 6, ultimoDia);
    const inicioDate = inicioDiaBrt(monthKey, inicio);
    const fimExclusivo = new Date(inicioDiaBrt(monthKey, fim).getTime() + DIA_MS);
    semanas.push({
      key: `${monthKey}-s${numero}`,
      numero,
      inicioDia: inicio,
      fimDia: fim,
      inicioIso: inicioDate.toISOString(),
      fimExclusivoIso: fimExclusivo.toISOString(),
      label: `Semana ${numero} · ${String(inicio).padStart(2, "0")}–${String(fim).padStart(2, "0")}`,
    });
  }
  return semanas;
}

export function semanaAtual(
  monthKey = currentMonthKey(),
  agora: Date | number = Date.now(),
): PulsoSemana {
  const dia = Number(
    DAY_FORMATTER.format(typeof agora === "number" ? new Date(agora) : agora),
  );
  const semanas = semanasDoMes(monthKey);
  return semanas.find((semana) => dia >= semana.inicioDia && dia <= semana.fimDia) ?? semanas[0];
}

const timestampDe = (agora: Date | number) =>
  typeof agora === "number" ? agora : agora.getTime();

/** Semanas do mês que já começaram; meses futuros ficam vazios. */
export function semanasDisponiveis(
  monthKey: string,
  agora: Date | number = Date.now(),
): PulsoSemana[] {
  const now = timestampDe(agora);
  const atual = currentMonthKey(now);
  if (monthKey > atual) return [];
  const todas = semanasDoMes(monthKey);
  if (monthKey < atual) return todas;
  return todas.filter((semana) => new Date(semana.inicioIso).getTime() <= now);
}

/** Semana corrente no mês atual; no restante, a última semana disponível. */
export function semanaPadrao(
  monthKey: string,
  agora: Date | number = Date.now(),
): PulsoSemana {
  const semanas = semanasDisponiveis(monthKey, agora);
  if (monthKey === currentMonthKey(agora)) {
    const atual = semanaAtual(monthKey, agora);
    if (semanas.some((semana) => semana.key === atual.key)) return atual;
  }
  return semanas[semanas.length - 1] ?? semanasDoMes(monthKey)[0];
}

export function mesPulsoLabel(monthKey: string): string {
  const [ano, mes] = monthKey.split("-").map(Number);
  const label = MONTH_LABEL.format(new Date(Date.UTC(ano, mes - 1, 15, 12)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function dentroDaSemana(
  value: string | null | undefined,
  semana: PulsoSemana,
): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return (
    timestamp >= new Date(semana.inicioIso).getTime() &&
    timestamp < new Date(semana.fimExclusivoIso).getTime()
  );
}
