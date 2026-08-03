/**
 * AreaUnavailable — honest empty state for an area with no available
 * providers yet. Never fabricates results; offers a waitlist instead.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPinOff, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "@/context/LocationContext";
import LocationPicker from "./LocationPicker";

interface Props {
  /** Optional service context so we can record what was requested. */
  serviceSlug?: string | null;
  className?: string;
}

export function AreaUnavailable({ serviceSlug, className }: Props) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { location } = useLocation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const areaName =
    location.city ??
    location.postcode ??
    t("location.area.yourArea", { defaultValue: "your area" });

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("market_waitlist").insert({
      email: email.trim(),
      country_code: (location.countryCode ?? "").toUpperCase(),
      city: location.city,
      postcode: location.postcode,
      locale: i18n.language,
      role_intent: serviceSlug ?? null,
    });
    setBusy(false);
    if (error) {
      toast({
        variant: "destructive",
        title: t("location.waitlist.errorTitle", { defaultValue: "Could not sign you up" }),
        description: t("location.waitlist.errorBody", { defaultValue: "Please try again in a moment." }),
      });
      return;
    }
    setDone(true);
  }

  return (
    <div className={`rounded-2xl border border-border bg-card p-6 text-center ${className ?? ""}`}>
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MapPinOff className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="text-lg font-semibold text-foreground">
        {t("location.area.emptyTitle", {
          defaultValue: "Not available in {{area}} yet",
          area: areaName,
        })}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {t("location.area.emptyBody", {
          defaultValue:
            "We are onboarding professionals in this area. Leave your email and we will let you know the moment we go live.",
        })}
      </p>

      {done ? (
        <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
          <Check className="h-4 w-4" aria-hidden="true" />
          {t("location.waitlist.done", { defaultValue: "You are on the list — we will be in touch." })}
        </p>
      ) : (
        <form onSubmit={join} className="mx-auto mt-4 flex max-w-sm flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("location.waitlist.emailPlaceholder", { defaultValue: "your@email.com" })}
            aria-label={t("location.waitlist.emailLabel", { defaultValue: "Email address" })}
          />
          <Button type="submit" disabled={busy}>
            {t("location.waitlist.submit", { defaultValue: "Notify me" })}
          </Button>
        </form>
      )}

      <div className="mx-auto mt-6 max-w-xs">
        <LocationPicker compact />
      </div>
    </div>
  );
}

export default AreaUnavailable;
