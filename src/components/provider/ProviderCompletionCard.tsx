import { CheckCircle2, Circle, Clock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useCountryPath } from "@/lib/countryPath";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

export type CompletionRow = {
  key: string;
  label: string;
  status: "complete" | "pending" | "incomplete";
  hint?: string;
  href?: string;
};

const STATUS_META = {
  complete: { Icon: CheckCircle2, fg: C.teal, label: "Klar" },
  pending: { Icon: Clock, fg: "#8a5a00", label: "Afventer" },
  incomplete: { Icon: Circle, fg: "#8a2e1c", label: "Mangler" },
} as const;

export function ProviderCompletionCard({
  completionPct,
  status,
  rows,
}: {
  completionPct: number;
  status: string;
  rows: CompletionRow[];
}) {
  const localize = useCountryPath();
  const complete = rows.filter((r) => r.status === "complete").length;
  return (
    <div className="rounded-2xl border-2 bg-white p-6" style={{ borderColor: C.ink }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: C.orange }}>
            Onboarding · {status.replace(/_/g, " ")}
          </div>
          <div className="mt-1 font-display text-2xl" style={{ color: C.ink }}>
            {completionPct}% færdig
          </div>
          <div className="text-xs opacity-70">{complete}/{rows.length} krav opfyldt</div>
        </div>
        <Link
          to={localize("/bliv-cleaner")}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ background: C.orange, color: C.ink }}
        >
          Fortsæt <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, completionPct)}%`, background: C.teal }}
          data-testid="completion-bar"
        />
      </div>

      <ul className="mt-5 divide-y" style={{ borderColor: `${C.ink}18` }}>
        {rows.map((r) => {
          const { Icon, fg, label } = STATUS_META[r.status];
          const inner = (
            <div className="flex items-center gap-3 py-3">
              <Icon className="h-4 w-4 flex-shrink-0" style={{ color: fg }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: C.ink }}>{r.label}</div>
                {r.hint && <div className="text-xs opacity-60 truncate">{r.hint}</div>}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: fg }}>{label}</span>
              {r.href && <ArrowRight className="h-3.5 w-3.5 opacity-40" />}
            </div>
          );
          return (
            <li key={r.key}>
              {r.href ? (
                <Link to={r.href} className="block hover:bg-black/[0.02] px-1 -mx-1 rounded">{inner}</Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
