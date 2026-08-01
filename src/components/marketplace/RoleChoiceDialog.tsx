/**
 * RoleChoiceDialog — "How would you like to use MyCleaner?"
 *
 * Routes each account type into its own explicit signup flow. Provider intent
 * is carried in the URL all the way through auth and email confirmation, so a
 * cleaner can never accidentally fall back to customer onboarding.
 */
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, Briefcase } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

const CUSTOMER_SIGNUP = "/login?mode=signup&role=customer&redirect=%2Fcustomer%2Fregister";
const PROVIDER_SIGNUP = "/login?mode=signup&role=provider&redirect=%2Fbliv-cleaner";

export function RoleChoiceDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();

  function go(path: string) {
    onOpenChange(false);
    navigate(path);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-surface="marketplace">
        <DialogHeader>
          <DialogTitle className="font-heading text-[22px] text-[hsl(var(--mkt-ink))]">
            {t("role.title", "How would you like to use MyCleaner?")}
          </DialogTitle>
          <DialogDescription className="text-[hsl(var(--mkt-ink-muted))]">
            {t("role.subtitle", "You can switch later from your profile.")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => go(CUSTOMER_SIGNUP)}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-5 text-left transition hover:border-[hsl(var(--mkt-brand))] hover:shadow-[var(--mkt-shadow-lift)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="font-heading text-[17px] text-[hsl(var(--mkt-ink))]">
              {t("role.customer.title", "I need cleaning")}
            </span>
            <span className="text-[13px] text-[hsl(var(--mkt-ink-muted))]">
              {t("role.customer.body", "Book a verified cleaner in your area.")}
            </span>
          </button>

          <button
            type="button"
            onClick={() => go(PROVIDER_SIGNUP)}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] p-5 text-left transition hover:border-[hsl(var(--mkt-brand))] hover:shadow-[var(--mkt-shadow-lift)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--mkt-brand))]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--mkt-brand-soft))] text-[hsl(var(--mkt-brand))]">
              <Briefcase className="h-5 w-5" />
            </span>
            <span className="font-heading text-[17px] text-[hsl(var(--mkt-ink))]">
              {t("role.provider.title", "I offer cleaning services")}
            </span>
            <span className="text-[13px] text-[hsl(var(--mkt-ink-muted))]">
              {t("role.provider.body", "Grow your cleaning business on MyCleaner.")}
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
