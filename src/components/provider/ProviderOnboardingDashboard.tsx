import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BadgeCheck, FileText, LifeBuoy, Lock, ShieldCheck, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/dashboard/primitives";
import { useCountryPath } from "@/lib/countryPath";
import type { ProviderActivation } from "@/lib/provider/activation";

const STEP_ICON: Record<string, typeof BadgeCheck> = {
  profile: BadgeCheck,
  identity: ShieldCheck,
  stripe: Wallet,
  documents: FileText,
  support: LifeBuoy,
  appeal: FileText,
};

/**
 * Restricted onboarding dashboard for providers whose profile is not active.
 *
 * Shows status, the concrete next steps and nothing else. There are no
 * booking, customer or financial-operations controls here — not even disabled
 * ones — so no dead or half-live buttons can be rendered. The server enforces
 * the same rule independently (`_shared/providerGate.ts`).
 */
export function ProviderOnboardingDashboard({
  activation,
}: {
  activation: ProviderActivation;
}) {
  const { t } = useTranslation("provider");
  const localize = useCountryPath();
  const state = activation.state;

  return (
    <div className="grid gap-5 lg:gap-6" data-testid="provider-onboarding-dashboard">
      <SectionCard
        title={t("activation.restricted.title")}
        description={t("activation.restricted.description")}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("activation.statusLabel")}</span>
            <Badge
              variant={activation.tone === "destructive" ? "destructive" : "secondary"}
              data-testid="provider-activation-status"
            >
              {t(`activation.states.${state}.title`)}
            </Badge>
            <Badge variant="outline">{t("activation.badge")}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(`activation.states.${state}.description`)}
          </p>
        </div>
      </SectionCard>

      <SectionCard title={t("activation.checklistTitle")}>
        <ul className="grid gap-3">
          {activation.nextSteps.map((step) => {
            const Icon = STEP_ICON[step.id] ?? BadgeCheck;
            return (
              <li
                key={step.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="truncate text-sm font-medium text-foreground">
                    {t(`activation.steps.${step.id}`)}
                  </span>
                </span>
                <Button asChild size="sm" variant={step.primary ? "default" : "outline"}>
                  <Link to={localize(step.to)}>{t(`activation.steps.${step.id}`)}</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard title={t("activation.lockedTitle")}>
        <p className="flex items-start gap-3 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t("activation.lockedDescription")}
        </p>
      </SectionCard>
    </div>
  );
}

export default ProviderOnboardingDashboard;
