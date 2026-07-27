// Reusable, schema-driven application form. Uses only design-token components
// (shadcn), matches existing MyCleaner accessibility patterns (labelled
// inputs, focus-visible rings, aria-live status). The generic success message
// deliberately does NOT reveal whether the application already existed.
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Turnstile from "@/components/Turnstile";
import { submitCampaignApplication, trackCampaignEvent } from "@/lib/campaigns/api";
import { Loader2 } from "lucide-react";

const schema = z.object({
  full_name: z.string().trim().min(2, "Indtast dit fulde navn").max(200),
  email: z.string().trim().email("Ugyldig e-mail").max(255),
  phone: z.string().trim().max(40).optional(),
  city: z.string().trim().max(120).optional(),
  country_code: z.string().length(2),
  accepted_terms: z.literal(true, { errorMap: () => ({ message: "Du skal acceptere vilkårene" }) }),
  accepted_privacy: z.literal(true, { errorMap: () => ({ message: "Du skal acceptere privatlivspolitikken" }) }),
});

interface Props {
  campaignSlug: string;
  defaultCountry: string;
  allowedCountries: string[];
  onSubmitted?: () => void;
}

export function CampaignApplicationForm({ campaignSlug, defaultCountry, allowedCountries, onSubmitted }: Props) {
  const [values, setValues] = useState({
    full_name: "",
    email: "",
    phone: "",
    city: "",
    country_code: allowedCountries.includes(defaultCountry) ? defaultCountry : (allowedCountries[0] ?? "DK"),
    accepted_terms: false,
    accepted_privacy: false,
  });
  const [turnstile, setTurnstile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Ugyldig indtastning");
      return;
    }
    if (!turnstile) {
      setError("Bekræft venligst at du ikke er en bot");
      return;
    }
    setBusy(true);
    try {
      await trackCampaignEvent({
        campaign_slug: campaignSlug,
        event_type: "application_started",
        country_code: values.country_code,
      });
      const res = await submitCampaignApplication({
        campaign_slug: campaignSlug,
        ...parsed.data,
        turnstile_token: turnstile,
      });
      setDone(res.message);
      onSubmitted?.();
    } catch (err) {
      setError((err as Error).message || "Der opstod en fejl. Prøv igen.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Alert>
        <AlertDescription role="status" aria-live="polite">{done}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="ca-name">Fulde navn</Label>
        <Input id="ca-name" required autoComplete="name" value={values.full_name}
          onChange={(e) => setValues({ ...values, full_name: e.target.value })} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ca-email">E-mail</Label>
        <Input id="ca-email" type="email" required autoComplete="email" value={values.email}
          onChange={(e) => setValues({ ...values, email: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="ca-phone">Telefon (valgfri)</Label>
          <Input id="ca-phone" type="tel" autoComplete="tel" value={values.phone}
            onChange={(e) => setValues({ ...values, phone: e.target.value })} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ca-city">By (valgfri)</Label>
          <Input id="ca-city" value={values.city}
            onChange={(e) => setValues({ ...values, city: e.target.value })} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ca-country">Land</Label>
        <Select value={values.country_code} onValueChange={(v) => setValues({ ...values, country_code: v })}>
          <SelectTrigger id="ca-country"><SelectValue /></SelectTrigger>
          <SelectContent>
            {allowedCountries.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={values.accepted_terms}
          onCheckedChange={(v) => setValues({ ...values, accepted_terms: v === true })} />
        <span>Jeg accepterer <a className="underline" href="/regler" target="_blank" rel="noreferrer">vilkårene</a>.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={values.accepted_privacy}
          onCheckedChange={(v) => setValues({ ...values, accepted_privacy: v === true })} />
        <span>Jeg accepterer <a className="underline" href="/privatliv" target="_blank" rel="noreferrer">privatlivspolitikken</a>.</span>
      </label>
      <Turnstile onVerify={setTurnstile} />
      {error && (
        <Alert variant="destructive">
          <AlertDescription role="alert">{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sender…</> : "Send ansøgning"}
      </Button>
    </form>
  );
}
