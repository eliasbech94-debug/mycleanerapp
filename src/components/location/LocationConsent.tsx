/**
 * LocationConsent — soft pre-prompt shown BEFORE the browser permission
 * dialog. We always explain what we use the location for and always offer a
 * manual alternative, so the browser prompt is never a surprise.
 */
import { useTranslation } from "react-i18next";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "@/context/LocationContext";

export function LocationConsent({ onPickManually }: { onPickManually?: () => void }) {
  const { t } = useTranslation();
  const { shouldPrompt, requestGeolocation, declineGeolocation } = useLocation();

  if (!shouldPrompt) return null;

  return (
    <div
      role="region"
      aria-label={t("location.consent.title", { defaultValue: "Show services near you" })}
      className="relative rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <button
        type="button"
        onClick={declineGeolocation}
        aria-label={t("common.dismiss", { defaultValue: "Dismiss" })}
        className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <p className="font-medium text-foreground">
            {t("location.consent.title", { defaultValue: "Show services near you" })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("location.consent.body", {
              defaultValue:
                "We use your approximate location only to show available services, travel distance and prices in your area. We store your city — never your exact address — and you can change or remove it at any time.",
            })}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => void requestGeolocation()}>
              {t("location.consent.allow", { defaultValue: "Use my location" })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                declineGeolocation();
                onPickManually?.();
              }}
            >
              {t("location.consent.manual", { defaultValue: "Choose area manually" })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LocationConsent;
