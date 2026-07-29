import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * EmptyState — standard "nothing here yet" placeholder for dashboard
 * sections. Semantic tokens only. Optional icon + CTA.
 */
export const EmptyState = ({ icon: Icon, title, description, action, className }: Props) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center",
      className,
    )}
  >
    {Icon && (
      <span
        aria-hidden
        className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-background text-muted-foreground"
      >
        <Icon className="h-5 w-5" />
      </span>
    )}
    <p className="font-display text-lg text-foreground">{title}</p>
    {description && (
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
