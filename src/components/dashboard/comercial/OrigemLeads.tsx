import { Panel, BarList } from "../ui/primitives";
import { compactCurrency } from "../dashboard-utils";
import type { OrigemRow } from "@/lib/comercial-analytics";

/** De onde vêm os leads em andamento e quanto cada origem já converteu. */
export function OrigemLeads({ origens }: { origens: OrigemRow[] }) {
  const total = origens.reduce((s, o) => s + o.leads, 0);
  return (
    <Panel eyebrow="Origem" title="De onde vêm os leads" subtitle={`${total} leads ativos · potencial por origem`} className="h-full">
      {origens.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-35 italic">Sem leads ativos.</p>
      ) : (
        <BarList
          labelWidth={118}
          rows={origens.map((o) => ({
            key: o.origem,
            label: o.label,
            value: o.leads,
            display: `${o.leads} · ${compactCurrency(o.potencial)}`,
            sub: o.convertidos > 0 ? `${o.convertidos} convertido${o.convertidos > 1 ? "s" : ""}` : undefined,
            color: o.origem === "meta_ads" ? "#1c3150" : o.origem === "calculadora" ? "#c6964f" : "var(--navy)",
          }))}
        />
      )}
    </Panel>
  );
}
