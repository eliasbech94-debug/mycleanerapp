import { Badge } from "@/components/ui/badge";
import type { RulePackStatus } from "@/lib/accounting";
import { RULE_PACK_STATUS_LABELS } from "@/lib/accounting/admin";

const VARIANTS: Record<RulePackStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  in_review: "bg-accent text-accent-foreground border-border",
  approved: "bg-secondary text-secondary-foreground border-border",
  published: "bg-primary text-primary-foreground border-transparent",
  retired: "bg-destructive/10 text-destructive border-destructive/30",
};

export function RulePackStatusBadge({ status }: { status: RulePackStatus }) {
  return (
    <Badge variant="outline" className={VARIANTS[status]}>
      {RULE_PACK_STATUS_LABELS[status]}
    </Badge>
  );
}

export function countryFlag(countryCode: string): string {
  if (!/^[A-Za-z]{2}$/.test(countryCode)) return "🏳️";
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split("")
      .map((char) => 0x1f1a5 + char.charCodeAt(0)),
  );
}
