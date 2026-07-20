import { Badge } from "@/components/ui/badge";

type Status = "unverified" | "pending" | "approved" | "rejected" | "on_hold" | "expired" | null;

const MAP: Record<Exclude<Status, null>, { label: string; className: string }> = {
  unverified: { label: "Ikke verificeret", className: "bg-muted text-muted-foreground" },
  pending:    { label: "Under review",     className: "bg-amber-100 text-amber-900" },
  approved:   { label: "Verificeret",      className: "bg-emerald-100 text-emerald-900" },
  rejected:   { label: "Afvist",           className: "bg-red-100 text-red-900" },
  on_hold:    { label: "På hold",          className: "bg-orange-100 text-orange-900" },
  expired:    { label: "Udløbet",          className: "bg-slate-200 text-slate-900" },
};

export function IdentityStatusBadge({ status }: { status: Status }) {
  const s = status ?? "unverified";
  const m = MAP[s];
  return <Badge className={m.className} aria-label={`Identitetsstatus: ${m.label}`}>{m.label}</Badge>;
}
