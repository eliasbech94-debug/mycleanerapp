/**
 * HumanTakeoverNotice — shown once a MyCleaner Support agent has taken over a
 * conversation from the AI assistant. After this point the AI must never
 * present itself as the active handler.
 *
 * Only a first name is ever shown; the AI never borrows a human identity.
 */
import { useTranslation } from "react-i18next";
import { Clock, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HumanTakeoverNoticeProps {
  /** First name of the agent who took over. Omit while the handover is queued. */
  firstName?: string | null;
  /** Known expected response time. Never invent one. */
  expectedResponseMinutes?: number | null;
  className?: string;
}

export function HumanTakeoverNotice({
  firstName,
  expectedResponseMinutes,
  className,
}: HumanTakeoverNoticeProps) {
  const { t } = useTranslation("ai");
  const name = firstName?.trim();

  return (
    <div
      role="status"
      data-testid="human-takeover-notice"
      className={cn(
        "flex w-full max-w-full flex-col gap-1 rounded-xl border border-[hsl(var(--mkt-success))]/25",
        "bg-[hsl(var(--mkt-success))]/8 px-3 py-2 text-[12px] leading-snug",
        className,
      )}
    >
      <p className="flex items-start gap-2 font-semibold text-[hsl(var(--mkt-ink))]">
        <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--mkt-success))]" aria-hidden />
        <span className="min-w-0 break-words">
          {name ? t("handover.active", { firstName: name }) : t("handover.pending")}
        </span>
      </p>
      <p className="flex items-start gap-2 pl-6 text-[hsl(var(--mkt-ink-muted))]">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">
          {typeof expectedResponseMinutes === "number" && expectedResponseMinutes > 0
            ? t("handover.expectedResponse", { minutes: expectedResponseMinutes })
            : t("handover.expectedResponseUnknown")}
        </span>
      </p>
    </div>
  );
}

export default HumanTakeoverNotice;
