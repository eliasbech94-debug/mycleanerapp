import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const DashboardPage = ({ title, description, actions, children, className }: Props) => (
  <div className={cn("p-4 sm:p-6 lg:p-8 space-y-6", className)}>
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-display text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    <div>{children}</div>
  </div>
);
