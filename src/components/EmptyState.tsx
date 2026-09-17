import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-12 h-12 rounded-full bg-[rgba(8,17,29,0.06)] flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="text-sm font-semibold text-[rgba(15,17,23,0.4)]">{title}</p>
      {subtitle && <p className="text-xs text-[rgba(15,17,23,0.25)] mt-1">{subtitle}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
