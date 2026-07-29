import { Link } from "react-router-dom";
import { LucideIcon, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  icon: LucideIcon;
  to: string;
  badge?: string;
  className?: string;
}

/**
 * QuickActionCard — large tappable navigation tile used in dashboard
 * quick-action grids. Design tokens only. Min 44px tap target on mobile.
 */
export const QuickActionCard = ({ title, description, icon: Icon, to, badge, className }: Props) => (
  <Link
    to={to}
    className={cn(
      "group flex min-h-[88px] items-center gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5",
      "transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      className,
    )}
  >
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15"
    >
      <Icon className="h-5 w-5" />
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {badge}
          </span>
        )}
      </div>
      {description && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
      )}
    </div>
    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
  </Link>
);
