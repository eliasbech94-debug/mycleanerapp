import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Standard dashboard page frame.
 *
 * Width: capped at 1600px and centred so cards keep sane line lengths on very
 * wide monitors while still using the full remaining viewport on 1280–1600px
 * desktops. `min-w-0` on every wrapper keeps wide children (tables, charts)
 * inside the grid track instead of pushing the page sideways.
 */
export const DashboardPage = ({ title, description, actions, children, className }: Props) => (
  <div
    className={cn(
      "mx-auto w-full min-w-0 max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8",
      className,
    )}
  >
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="font-display text-2xl text-foreground sm:text-3xl">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);
