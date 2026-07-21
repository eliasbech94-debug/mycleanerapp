import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { AlertCircle, Sparkles, TrendingUp, Users, Gauge, Info } from "lucide-react";
import {
  resolveMarket, saveProviderPricing, getRecommendation, fetchOwnPreferences,
  formatMinor, classifyIndicator, validatePricingDraft,
  INDICATOR_META, DEMAND_META,
  type ResolvedMarket, type Recommendation, type ProviderPreferences,
} from "@/lib/marketPricing";

const ASSUMED_HOURS_PER_WEEK = 20;
const ASSUMED_CONVERSION_BPS = 6000; // 60%

const ERROR_LABELS: Record<string, string> = {
  no_active_market_rule: "No active market rule for this location.",
  invalid_hourly_rate: "Enter your hourly rate.",
  below_market_minimum: "Below the market minimum for your location.",
  above_market_maximum: "Above the market maximum for your location.",
  smart_bounds_required: "Smart Pricing needs a minimum and maximum.",
  smart_min_below_market: "Smart minimum is below the market minimum.",
  smart_max_above_market: "Smart maximum is above the market maximum.",
  smart_max_below_min: "Smart maximum must be greater than or equal to the minimum.",
};

export default function ProviderPricing() {
  const { user } = useAuth();
  const { isProvider, loading: rolesLoading } = useUserRoles();
  const qc = useQueryClient();
  const uid = user?.id ?? null;

  // Editable state
  const [country, setCountry] = useState("DK");
  const [region, setRegion]     = useState("");
  const [city, setCity]         = useState("");
  const [postcode, setPostcode] = useState("");
  const [hourlyMajor, setHourlyMajor] = useState("");
  const [smartOn, setSmartOn] = useState(false);
  const [smartMinMajor, setSmartMinMajor] = useState("");
  const [smartMaxMajor, setSmartMaxMajor] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // 1. Provider profile (for base_country_code fallback)
  const profileQ = useQuery({
    queryKey: ["provider_profile_country", uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("provider_profiles")
        .select("base_country_code").eq("user_id", uid!).maybeSingle();
      if (error) throw error;
      return data?.base_country_code ?? null;
    },
  });

  // 2. Existing preferences
  const prefsQ = useQuery({
    queryKey: ["provider_pricing_prefs", uid],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: () => fetchOwnPreferences(uid!),
  });

  // Hydrate editable state once
  useEffect(() => {
    if (hydrated || prefsQ.isLoading || profileQ.isLoading) return;
    const p: ProviderPreferences | null = prefsQ.data ?? null;
    if (p) {
      setCountry(p.country_code);
      setRegion(p.region ?? "");
      setCity(p.city ?? "");
      setPostcode(p.postcode ?? "");
      setHourlyMajor(String(p.hourly_rate_minor / 100));
      setSmartOn(p.smart_pricing_enabled);
      if (p.smart_min_minor != null) setSmartMinMajor(String(p.smart_min_minor / 100));
      if (p.smart_max_minor != null) setSmartMaxMajor(String(p.smart_max_minor / 100));
    } else if (profileQ.data) {
      setCountry(profileQ.data);
    }
    setHydrated(true);
  }, [hydrated, prefsQ.isLoading, prefsQ.data, profileQ.isLoading, profileQ.data]);

  // 3. Market resolution — key includes location so re-renders don't refetch
  const marketQ = useQuery<ResolvedMarket>({
    queryKey: ["market_resolve", country, region, city, postcode],
    enabled: !!country && country.length === 2,
    staleTime: 15_000,
    queryFn: () => resolveMarket({ country_code: country, region, city, postcode }),
  });

  // 4. Recommendation (depends on saved prefs; refresh on save)
  const recQ = useQuery<Recommendation>({
    queryKey: ["provider_recommendation", uid, prefsQ.data?.updated_at ?? "none"],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: () => getRecommendation(uid!),
  });

  const hourlyMinor = useMemo(() => {
    const n = parseFloat(hourlyMajor);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }, [hourlyMajor]);
  const smartMinMinor = useMemo(() => {
    const n = parseFloat(smartMinMajor);
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  }, [smartMinMajor]);
  const smartMaxMinor = useMemo(() => {
    const n = parseFloat(smartMaxMajor);
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  }, [smartMaxMajor]);

  const market = marketQ.data ?? null;
  const rec = recQ.data && !recQ.data.error ? recQ.data : null;

  const validation = useMemo(() => validatePricingDraft({
    hourly_minor: hourlyMinor,
    smart_enabled: smartOn,
    smart_min_minor: Number.isFinite(smartMinMinor) ? smartMinMinor : null,
    smart_max_minor: Number.isFinite(smartMaxMinor) ? smartMaxMinor : null,
    market,
  }), [hourlyMinor, smartOn, smartMinMinor, smartMaxMinor, market]);

  const indicator = useMemo(() => {
    if (!hourlyMinor || !rec?.recommended_minor) return null;
    return classifyIndicator(hourlyMinor, rec.recommended_minor);
  }, [hourlyMinor, rec]);

  // Save mutation with optimistic prefs update
  const saveMut = useMutation({
    mutationFn: () => saveProviderPricing({
      country_code: country,
      region: region || null,
      city: city || null,
      postcode: postcode || null,
      hourly_rate_minor: hourlyMinor,
      smart_pricing_enabled: smartOn,
      smart_min_minor: smartOn && Number.isFinite(smartMinMinor) ? smartMinMinor : null,
      smart_max_minor: smartOn && Number.isFinite(smartMaxMinor) ? smartMaxMinor : null,
    }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["provider_pricing_prefs", uid] });
      const prev = qc.getQueryData<ProviderPreferences | null>(["provider_pricing_prefs", uid]);
      qc.setQueryData<ProviderPreferences | null>(["provider_pricing_prefs", uid], (old) => ({
        user_id: uid!,
        country_code: country,
        currency: market?.currency ?? old?.currency ?? "DKK",
        region: region || null, city: city || null, postcode: postcode || null,
        hourly_rate_minor: hourlyMinor,
        smart_pricing_enabled: smartOn,
        smart_min_minor: smartOn && Number.isFinite(smartMinMinor) ? smartMinMinor : null,
        smart_max_minor: smartOn && Number.isFinite(smartMaxMinor) ? smartMaxMinor : null,
        matched_scope: market?.matched_scope ?? null,
        resolved_min_minor: market?.min_minor ?? null,
        resolved_max_minor: market?.max_minor ?? null,
        updated_at: new Date().toISOString(),
      }));
      return { prev };
    },
    onError: (err: Error, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(["provider_pricing_prefs", uid], ctx.prev);
      const msg = err.message.replace(/^.*:\s*/, "");
      toast.error(ERROR_LABELS[msg] ?? err.message);
    },
    onSuccess: () => {
      toast.success("Pricing saved");
      qc.invalidateQueries({ queryKey: ["provider_pricing_prefs", uid] });
      qc.invalidateQueries({ queryKey: ["provider_recommendation", uid] });
    },
  });

  // Loading / role gates
  if (rolesLoading) return <PricingSkeleton />;
  if (!isProvider) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card><CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            <p>Provider role required.</p>
          </div>
        </CardContent></Card>
      </div>
    );
  }
  if (!hydrated) return <PricingSkeleton />;

  const currency = market?.currency ?? null;
  const weekly = hourlyMinor * ASSUMED_HOURS_PER_WEEK * (ASSUMED_CONVERSION_BPS / 10000);
  const monthly = weekly * 4.33;
  const canSave = validation.ok && !saveMut.isPending && !marketQ.isLoading;

  // Position of user's rate on the min→max axis
  const bandPct = (() => {
    if (!market?.min_minor) return null;
    const min = market.min_minor;
    const max = market.max_minor ?? Math.max(hourlyMinor, min * 1.5);
    if (max <= min) return 100;
    return Math.max(0, Math.min(100, ((hourlyMinor - min) / (max - min)) * 100));
  })();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Professional hosting
        </div>
        <h1 className="font-serif text-3xl md:text-4xl">Your pricing</h1>
        <p className="text-muted-foreground">
          Set your hourly rate and Smart Pricing bounds. Advisory only — it does not change existing bookings
          or checkout prices.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left: market */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Your market</CardTitle>
            <CardDescription>Most specific rule wins: postcode → city → region → country.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Country</Label><Input value={country} maxLength={2}
              onChange={(e) => setCountry(e.target.value.toUpperCase())} /></div>
            <div><Label>Region</Label><Input value={region} onChange={(e) => setRegion(e.target.value)} /></div>
            <div><Label>City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div><Label>Postcode</Label><Input value={postcode} onChange={(e) => setPostcode(e.target.value)} /></div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              {marketQ.isLoading ? (
                <Skeleton className="h-4 w-full" />
              ) : market?.error || !market ? (
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" /> No active market rule.
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{market.matched_scope}</Badge>
                    <span className="text-muted-foreground">{market.currency}</span>
                  </div>
                  <div className="text-muted-foreground">
                    Min <b className="text-foreground">{formatMinor(market.min_minor, currency)}</b>
                    {market.max_minor != null && (
                      <> · Max <b className="text-foreground">{formatMinor(market.max_minor, currency)}</b></>
                    )}
                    {market.recommended_minor != null && (
                      <> · Rec <b className="text-foreground">{formatMinor(market.recommended_minor, currency)}</b></>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Middle: Recommendation */}
        <Card className="md:col-span-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Recommended price
            </CardTitle>
            <CardDescription>
              Deterministic recommendation from admin-configured rules and multipliers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recQ.isLoading ? (
              <div className="space-y-3"><Skeleton className="h-9 w-48" /><Skeleton className="h-4 w-64" /></div>
            ) : !rec ? (
              <div className="text-sm text-muted-foreground">
                No recommendation available yet — set your location and save once to compute.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-3xl font-semibold">
                    {formatMinor(rec.recommended_minor, rec.currency)}<span className="text-base text-muted-foreground">/h</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                    <Badge variant="outline">Base {formatMinor(rec.base_recommended_minor, rec.currency)}</Badge>
                    <Badge variant="outline">{rec.method}</Badge>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <Metric icon={<Users className="h-4 w-4" />}
                    label="Nearby active providers" value={String(rec.competition_score)} />
                  <Metric icon={<Gauge className="h-4 w-4" />}
                    label="Demand"
                    valueNode={<Badge className={DEMAND_META[rec.demand_level].className}>{DEMAND_META[rec.demand_level].label}</Badge>} />
                  <Metric icon={<Info className="h-4 w-4" />}
                    label="Nearby avg" value={formatMinor(rec.nearby_avg_minor, rec.currency)} />
                  <Metric icon={<Sparkles className="h-4 w-4" />}
                    label="Market confidence"
                    valueNode={<Badge variant="outline" className="capitalize">{rec.data_confidence}</Badge>} />
                </div>
                {rec.applied_multipliers.length > 0 && (
                  <div className="sm:col-span-2">
                    <p className="mb-1 text-xs text-muted-foreground">
                      Applied multipliers ({(rec.multiplier_bps_total / 100).toFixed(1)}% total)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {rec.applied_multipliers.map((m) => (
                        <Badge key={m.key} variant="secondary" className="text-xs">
                          {m.label ?? m.key} {m.bps >= 0 ? "+" : ""}{(m.bps / 100).toFixed(1)}%
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hourly rate */}
      <Card>
        <CardHeader>
          <CardTitle>Your hourly rate</CardTitle>
          <CardDescription>Live indicator based on the recommended price.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label>Hourly rate ({currency ?? "—"})</Label>
              <Input type="number" min={0} step="1" inputMode="numeric"
                value={hourlyMajor} onChange={(e) => setHourlyMajor(e.target.value)} />
            </div>
            {indicator && (
              <Badge className={INDICATOR_META[indicator].className}>
                {INDICATOR_META[indicator].emoji} {INDICATOR_META[indicator].label}
              </Badge>
            )}
          </div>

          {market?.min_minor != null && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Min {formatMinor(market.min_minor, currency)}</span>
                {market.max_minor != null && <span>Max {formatMinor(market.max_minor, currency)}</span>}
              </div>
              <Progress value={bandPct ?? 0} className="h-2" />
            </div>
          )}

          <ValidationErrors errors={validation.errors} />
        </CardContent>
      </Card>

      {/* Smart pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Smart Pricing bounds
            <Switch checked={smartOn} onCheckedChange={setSmartOn} aria-label="Enable Smart Pricing" />
          </CardTitle>
          <CardDescription>
            Set bounds now. Automatic adjustment within your bounds activates in a future phase — no prices change today.
          </CardDescription>
        </CardHeader>
        {smartOn && (
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Smart minimum ({currency ?? "—"})</Label>
              <Input type="number" inputMode="numeric" value={smartMinMajor}
                onChange={(e) => setSmartMinMajor(e.target.value)} />
            </div>
            <div>
              <Label>Smart maximum ({currency ?? "—"})</Label>
              <Input type="number" inputMode="numeric" value={smartMaxMajor}
                onChange={(e) => setSmartMaxMajor(e.target.value)} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Earnings estimate */}
      <Card>
        <CardHeader>
          <CardTitle>Estimated earnings (advisory)</CardTitle>
          <CardDescription>
            Assumes {ASSUMED_HOURS_PER_WEEK} bookable hours/week and {ASSUMED_CONVERSION_BPS / 100}% conversion.
            Gross of platform fee, taxes and expenses.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 text-sm">
          <Estimate label="Weekly" value={formatMinor(weekly, currency)} />
          <Estimate label="Monthly" value={formatMinor(monthly, currency)} />
          <Estimate label="Rate" value={`${formatMinor(hourlyMinor, currency)}/h`} />
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-end">
        <Button onClick={() => saveMut.mutate()} disabled={!canSave} size="lg" className="min-w-40">
          {saveMut.isPending ? "Saving…" : "Save pricing"}
        </Button>
      </div>
    </div>
  );
}

/* — small helpers — */

function Metric({ icon, label, value, valueNode }: {
  icon: React.ReactNode; label: string; value?: string; valueNode?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background/50 px-3 py-2">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="font-medium">{valueNode ?? value}</div>
    </div>
  );
}

function Estimate({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/50 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function ValidationErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      {errors.map((e) => (
        <div key={e} className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {ERROR_LABELS[e] ?? e}
        </div>
      ))}
    </div>
  );
}

function PricingSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-72 md:col-span-1" />
        <Skeleton className="h-72 md:col-span-2" />
      </div>
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}
