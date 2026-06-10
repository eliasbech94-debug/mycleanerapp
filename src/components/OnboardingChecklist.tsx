import { CheckCircle2, Circle, Clock, ArrowRight, Sparkles } from "lucide-react";
import { ReactNode } from "react";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

export type ChecklistStatus = "complete" | "pending" | "incomplete";

export type ChecklistItem = {
  key: string;
  title: string;
  description: string;
  status: ChecklistStatus;
  actionLabel?: string;
  onAction?: () => void;
};

const STATUS_META: Record<ChecklistStatus, { label: string; bg: string; fg: string; Icon: typeof CheckCircle2 }> = {
  complete:   { label: "Fuldført",     bg: C.mint,     fg: C.ink,   Icon: CheckCircle2 },
  pending:    { label: "Afventer",     bg: "#ffe9b8",  fg: "#8a5a00", Icon: Clock },
  incomplete: { label: "Ufuldstændig", bg: "#f5dccf",  fg: "#8a2e1c", Icon: Circle },
};

export default function OnboardingChecklist({
  title = "Kom godt i gang",
  subtitle,
  items,
  footer,
}: {
  title?: string;
  subtitle?: string;
  items: ChecklistItem[];
  footer?: ReactNode;
}) {
  const completed = items.filter((i) => i.status === "complete").length;
  const total = items.length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const allDone = completed === total;

  return (
    <div className="rounded-2xl border-2 bg-white p-5 sm:p-6" style={{ borderColor: `${C.ink}22` }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: allDone ? C.teal : C.orange }}>
            <Sparkles className="h-3 w-3" /> Onboarding
          </div>
          <h3 className="mt-1 font-display text-2xl leading-tight" style={{ color: C.ink }}>
            {allDone ? "Du er klar — alt er på plads ✨" : title}
          </h3>
          {subtitle && !allDone && (
            <p className="mt-1 text-sm opacity-70" style={{ color: C.ink }}>{subtitle}</p>
          )}
        </div>
        <div className="text-right">
          <div className="font-display text-2xl leading-none" style={{ color: C.ink }}>{completed}/{total}</div>
          <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.18em] opacity-60">trin færdige</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full" style={{ background: `${C.ink}11` }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: allDone ? C.teal : C.orange }}
        />
      </div>

      {/* Items */}
      <ul className="mt-5 divide-y" style={{ borderColor: `${C.ink}1a` }}>
        {items.map((it) => {
          const meta = STATUS_META[it.status];
          const Icon = meta.Icon;
          return (
            <li key={it.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span
                className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl"
                style={{ background: meta.bg, color: meta.fg }}
              >
                <Icon className="h-4 w-4" strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold" style={{ color: C.ink }}>{it.title}</span>
                  <span
                    className="hidden flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] sm:inline-flex"
                    style={{ background: meta.bg, color: meta.fg }}
                  >
                    {meta.label}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs opacity-70" style={{ color: C.ink }}>{it.description}</div>
              </div>
              {it.status !== "complete" && it.actionLabel && it.onAction && (
                <button
                  onClick={it.onAction}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition hover:-translate-y-0.5"
                  style={{ borderColor: C.ink, color: C.ink }}
                >
                  {it.actionLabel} <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {footer && <div className="mt-4 border-t pt-4" style={{ borderColor: `${C.ink}1a` }}>{footer}</div>}
    </div>
  );
}
