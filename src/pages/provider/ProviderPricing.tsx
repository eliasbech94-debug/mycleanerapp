import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  resolveMarket, saveProviderPricing, getRecommendation,
  formatMinor, classifyIndicator, INDICATOR_META,
  type ResolvedMarket, type Recommendation,
} from "@/lib/marketPricing";

const ASSUMED_HOURS_PER_WEEK = 20;
const ASSUMED_CONVERSION_BPS = 6000; // 60%

export default function ProviderPricing() {
  const { user } = useAuth();
  const { isProvider, loading: rolesLoading } = useUserRoles();

  const [country, setCountry] = useState("DK");
  const [region, setRegion]     = useState("");
  const [city, setCity]         = useState("");
  const [postcode, setPostcode] = useState("");

  const [hourlyMajor, setHourlyMajor] = useState<string>("");
  const [smartOn, setSmartOn] = useState(false);
  const [smartMinMajor, setSmartMinMajor] = useState<string>("");
  const [smartMaxMajor, setSmartMaxMajor] = useState<string>("");

  const [market, setMarket] = useState<ResolvedMarket | null>(null);
  const [rec, setRec]       = useState<Recommendation | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // load existing preferences + provider base
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [prefs, pp] = await Promise.all([
        supabase.from("provider_pricing_preferences").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("provider_profiles").select("base_country_code").eq("user_id", user.id).maybeSingle(),
      ]);
      const p = prefs.data;
      const base = pp.data?.base_country_code;
      if (p) {
        setCountry(p.country_code);
        setRegion(p.region ?? "");
        setCity(p.city ?? "");
        setPostcode(p.postcode ?? "");
        setHourlyMajor((p.hourly_rate_minor / 100).toString());
        setSmartOn(p.smart_pricing_enabled);
        if (p.smart_min_minor != null) setSmartMinMajor((p.smart_min_minor / 100).toString());
        if (p.smart_max_minor != null) setSmartMaxMajor((p.smart_max_minor / 100).toString());
      } else if (base) {
        setCountry(base);
      }
      setLoading(false);
    })();
  }, [user]);

  // resolve market whenever location changes
  useEffect(() => {
    if (!country) return;
    resolveMarket({ country_code: country, region, city, postcode })
      .then(setMarket)
      .catch(() => setMarket(null));
  }, [country, region, city, postcode]);

  // fetch recommendation
  useEffect(() => {
    if (!user) return;
    getRecommendation(user.id).then(setRec).catch(() => setRec(null));
  }, [user, market?.matched_scope, market?.min_minor]);

  const hourlyMinor = useMemo(() => {
    const n = parseFloat(hourlyMajor);
    return isNaN(n) ? 0 : Math.round(n * 100);
  }, [hourlyMajor]);

  const indicator = useMemo(() => {
    if (!hourlyMinor || !rec?.recommended_minor) return null;
    return classifyIndicator(hourlyMinor, rec.recommended_minor);
  }, [hourlyMinor, rec]);

  const minMinor = market?.min_minor ?? null;
  const maxMinor = market?.max_minor ?? null;
  const currency = market?.currency ?? null;

  const belowMin = minMinor != null && hourlyMinor > 0 && hourlyMinor < minMinor;
  const aboveMax = maxMinor != null && hourlyMinor > maxMinor;

  const smartInvalid = smartOn && (
    !smartMinMajor || !smartMaxMajor
    || Math.round(parseFloat(smartMinMajor) * 100) < (minMinor ?? 0)
    || Math.round(parseFloat(smartMaxMajor) * 100) < Math.round(parseFloat(smartMinMajor) * 100)
    || (maxMinor != null && Math.round(parseFloat(smartMaxMajor) * 100) > maxMinor)
  );

  const canSave = !!hourlyMinor && !belowMin && !aboveMax && !smartInvalid && !!market && !market.error;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await saveProviderPricing({
        country_code: country,
        region: region || null,
        city: city || null,
        postcode: postcode || null,
        hourly_rate_minor: hourlyMinor,
        smart_pricing_enabled: smartOn,
        smart_min_minor: smartOn ? Math.round(parseFloat(smartMinMajor) * 100) : null,
        smart_max_minor: smartOn ? Math.round(parseFloat(smartMaxMajor) * 100) : null,
      });
      toast.success("Pricing saved");
      if (user) getRecommendation(user.id).then(setRec).catch(() => {});
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (rolesLoading || loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isProvider) return <div className="p-8">Provider role required.</div>;

  const weekly = hourlyMinor * ASSUMED_HOURS_PER_WEEK * (ASSUMED_CONVERSION_BPS / 10000);
  const monthly = weekly * 4.33;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-serif">Pricing</h1>
        <p className="text-muted-foreground">
          Set your hourly rate and Smart Pricing bounds. This is your profile-facing rate — it does not change
          existing bookings or checkout prices.
        </p>
      </header>

      {/* Location */}
      <Card>
        <CardHeader><CardTitle>Your market</CardTitle>
          <CardDescription>The most specific rule wins: postcode → city → region → country.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>Country (ISO)</Label><Input value={country} maxLength={2}
            onChange={e => setCountry(e.target.value.toUpperCase())} /></div>
          <div><Label>Region</Label><Input value={region} onChange={e => setRegion(e.target.value)} /></div>
          <div><Label>City</Label><Input value={city} onChange={e => setCity(e.target.value)} /></div>
          <div><Label>Postcode</Label><Input value={postcode} onChange={e => setPostcode(e.target.value)} /></div>
          <div className="col-span-2 text-sm">
            {market?.error && <Badge variant="destructive">No active market rule</Badge>}
            {market && !market.error && (
              <div className="flex items-center gap-2">
                <Badge>Matched: {market.matched_scope}</Badge>
                <span className="text-muted-foreground">
                  Minimum {formatMinor(market.min_minor, currency)}/h
                  {market.max_minor != null && <> · Max {formatMinor(market.max_minor, currency)}/h</>}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recommended */}
      {rec && !rec.error && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">⭐ Recommended price</CardTitle>
            <CardDescription>
              Advisory only. Automatic price adjustment activates in a future phase.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-2xl font-semibold">{formatMinor(rec.recommended_minor, rec.currency)}/h</div>
              <div className="text-muted-foreground">Based on {rec.matched_scope} data · {rec.method}</div>
            </div>
            <div className="space-y-1">
              <div>Demand: <Badge variant="secondary">{rec.demand_level}</Badge></div>
              <div>Nearby active providers: {rec.competition_score}</div>
              <div>Data confidence: {rec.data_confidence}
                {rec.fallback_reason && <span className="text-muted-foreground"> ({rec.fallback_reason})</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hourly rate */}
      <Card>
        <CardHeader><CardTitle>Your hourly rate</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Hourly rate ({currency ?? "—"})</Label>
              <Input type="number" min={0} step="1" value={hourlyMajor}
                onChange={e => setHourlyMajor(e.target.value)} />
            </div>
            {indicator && (
              <Badge className={`${INDICATOR_META[indicator].color} text-white`}>
                {INDICATOR_META[indicator].emoji} {INDICATOR_META[indicator].label}
              </Badge>
            )}
          </div>
          {belowMin && (
            <p className="text-sm text-destructive">
              The minimum hourly price in your market is {formatMinor(minMinor, currency)}/h.
            </p>
          )}
          {aboveMax && (
            <p className="text-sm text-destructive">
              The maximum hourly price in your market is {formatMinor(maxMinor, currency)}/h.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Smart pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Smart Pricing
            <Switch checked={smartOn} onCheckedChange={setSmartOn} />
          </CardTitle>
          <CardDescription>
            Set bounds now. Automatic adjustment within your bounds will activate in a future phase — no prices
            change automatically today.
          </CardDescription>
        </CardHeader>
        {smartOn && (
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label>Smart minimum ({currency ?? "—"})</Label>
              <Input type="number" value={smartMinMajor} onChange={e => setSmartMinMajor(e.target.value)} />
            </div>
            <div>
              <Label>Smart maximum ({currency ?? "—"})</Label>
              <Input type="number" value={smartMaxMajor} onChange={e => setSmartMaxMajor(e.target.value)} />
            </div>
            {smartInvalid && (
              <p className="col-span-2 text-sm text-destructive">
                Smart bounds must stay within market min/max, and max must be ≥ min.
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Estimated earnings */}
      <Card>
        <CardHeader>
          <CardTitle>Estimated earnings (advisory)</CardTitle>
          <CardDescription>
            Estimates only. Assumes {ASSUMED_HOURS_PER_WEEK} bookable hours per week and{" "}
            {ASSUMED_CONVERSION_BPS / 100}% conversion. Gross of platform fee, taxes and expenses.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 text-sm">
          <div><div className="text-muted-foreground">Weekly</div>
            <div className="text-xl font-semibold">{formatMinor(weekly, currency)}</div></div>
          <div><div className="text-muted-foreground">Monthly</div>
            <div className="text-xl font-semibold">{formatMinor(monthly, currency)}</div></div>
          <div><div className="text-muted-foreground">Rate used</div>
            <div className="text-xl font-semibold">{formatMinor(hourlyMinor, currency)}/h</div></div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center justify-end gap-2">
        <Button onClick={onSave} disabled={!canSave || saving}>
          {saving ? "Saving…" : "Save pricing"}
        </Button>
      </div>
    </div>
  );
}
