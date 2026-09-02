import { useEnvironment } from "@/hooks/useEnvironment";
import { AMBIENTE_LABEL } from "@/lib/environments";
import { cn } from "@/lib/utils";

export function AmbienteSwitcher({ className }: { className?: string }) {
  const { ambiente, disponiveis, canSwitch, switchAmbiente } = useEnvironment();
  if (!canSwitch || !ambiente) return null;

  return (
    <div
      role="group"
      aria-label="Ambiente"
      className={cn(
        "inline-flex rounded-full border border-card-border/80 bg-muted/40 p-0.5",
        className,
      )}
    >
      {disponiveis.map((item) => {
        const active = ambiente === item;
        return (
          <button
            key={item}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) switchAmbiente(item);
            }}
            className={cn(
              "px-3 h-7 rounded-full text-[11px] font-semibold tracking-[0.04em] uppercase transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {AMBIENTE_LABEL[item]}
          </button>
        );
      })}
    </div>
  );
}
