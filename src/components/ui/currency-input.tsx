import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoneyBR, maskMoneyInput, parseMoneyBR } from "@/lib/money-mask";

interface CurrencyInputProps
  extends Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> {
  value: string | number;
  onValueChange: (plain: string) => void;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, className, ...props }, ref) => {
    const display = value === "" || value == null ? "" : formatMoneyBR(value);

    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-35">
          R$
        </span>
        <Input
          {...props}
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={display}
          placeholder={props.placeholder ?? "0,00"}
          className={cn("pl-10 text-right tabular-nums", className)}
          onChange={(e) => {
            const { amount, display: next } = maskMoneyInput(e.target.value);
            onValueChange(next ? amount.toFixed(2) : "");
          }}
          onBlur={(e) => {
            if (e.target.value) {
              onValueChange(parseMoneyBR(e.target.value).toFixed(2));
            }
            props.onBlur?.(e);
          }}
        />
      </div>
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";
