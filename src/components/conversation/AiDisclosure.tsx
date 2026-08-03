/**
 * AiDisclosure — always-visible AI identification shown directly under the body
 * of every message that MyCleaner AI generated and sent automatically.
 *
 * Rules enforced here:
 * - Rendering is driven by the persisted `sender_type = 'ai_assistant'` only.
 *   Callers must pass an already-resolved flag; never analyse message text.
 * - The text is inline, never inside a tooltip, terms page or info menu.
 * - Calm brand tone by default. Warning red is reserved for AI answers that
 *   concern safety or serious risk (`tone="risk"`).
 */
import { useTranslation } from "react-i18next";
import { Bot, Loader2, ShieldAlert, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AiDisclosureProps {
  /** Fires the escalation flow: create/transfer a support case with full history. */
  onTalkToHuman?: () => void;
  /** True while the handover request is in flight. */
  pending?: boolean;
  /** Hide the button once a human has already taken over. */
  showAction?: boolean;
  /** "risk" only for safety-related or otherwise high-risk AI answers. */
  tone?: "calm" | "risk";
  className?: string;
}

export function AiDisclosure({
  onTalkToHuman,
  pending = false,
  showAction = true,
  tone = "calm",
  className,
}: AiDisclosureProps) {
  const { t } = useTranslation("ai");
  const risk = tone === "risk";

  return (
    <div
      data-testid="ai-disclosure"
      data-tone={tone}
      className={cn(
        "mt-2 flex w-full max-w-full flex-col gap-2 rounded-xl border px-3 py-2 text-left",
        "sm:flex-row sm:items-center sm:justify-between sm:gap-3",
        risk
          ? "border-destructive/30 bg-destructive/5"
          : "border-[hsl(var(--mkt-brand))]/20 bg-[hsl(var(--mkt-brand-soft))]",
        className,
      )}
    >
      <p className="flex min-w-0 items-start gap-2 text-[12px] leading-snug">
        {risk ? (
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        ) : (
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--mkt-brand))]" aria-hidden />
        )}
        <span className="min-w-0 break-words">
          <span
            data-testid="ai-disclosure-title"
            className={cn(
              "block font-semibold",
              risk ? "text-destructive" : "text-[hsl(var(--mkt-brand))]",
            )}
          >
            {t("disclosure.title")}
          </span>
          <span data-testid="ai-disclosure-body" className="block text-[hsl(var(--mkt-ink-muted))]">
            {t("disclosure.body")}
          </span>
        </span>
      </p>

      {showAction && onTalkToHuman ? (
        <button
          type="button"
          data-testid="ai-talk-to-human"
          onClick={onTalkToHuman}
          disabled={pending}
          className={cn(
            "tap-target inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-full px-4",
            "text-[13px] font-semibold transition-colors disabled:opacity-60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            risk
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive"
              : "bg-[hsl(var(--mkt-brand))] text-[hsl(var(--mkt-brand-on))] hover:bg-[hsl(var(--mkt-brand-hover))] focus-visible:ring-[hsl(var(--mkt-brand))]",
          )}
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              <span>{t("disclosure.requesting")}</span>
            </>
          ) : (
            <>
              <UserRound className="h-3.5 w-3.5" aria-hidden />
              <span>{t("disclosure.talkToHuman")}</span>
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

export default AiDisclosure;
