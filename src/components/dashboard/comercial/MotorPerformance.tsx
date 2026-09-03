interface Props {
  motorDiagnosticos: number;
  motorTesesAtivas: number;
  semCobertura?: number;
}

/**
 * Card escuro do motor. As metricas ficam empilhadas (nao lado a lado) para o
 * card acompanhar a altura dos vizinhos na mesma linha da grade.
 */
export function MotorPerformance({ motorDiagnosticos, motorTesesAtivas, semCobertura = 0 }: Props) {
  const metricas = [
    { val: motorDiagnosticos, label: "Diagnósticos gerados", highlight: false },
    { val: motorTesesAtivas, label: "Teses ativas no motor", highlight: false },
    { val: semCobertura, label: "Regimes sem cobertura", highlight: semCobertura > 0 },
  ];

  return (
    <div className="bg-navy rounded-[20px] px-[18px] py-4 flex flex-col">
      <div className="text-[10px] font-bold tracking-[1.2px] uppercase text-white/50 mb-1">Performance do motor</div>
      <div className="flex flex-1 flex-col justify-around divide-y divide-white/10">
        {metricas.map((m) => (
          <div key={m.label} className="flex items-baseline justify-between py-[9px]">
            <span className="text-[11px] font-medium text-white/60">{m.label}</span>
            <span className={`font-display text-[26px] font-bold leading-none ${m.highlight ? "text-red-300" : "text-white"}`}>{m.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
