import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatMinor } from "@/lib/marketPricing";

type Scope = "country" | "region" | "city" | "postcode";

type Rule = {
  id: string;
  country_code: string;
  scope: Scope;
  region: string | null;
  city: string | null;
  postcode: string | null;
  currency: string;
  min_hourly_minor: number;
  max_hourly_minor: number | null;
  recommended_hourly_minor: number | null;
  active: boolean;
};

type Multiplier = {
  id: string;
  country_code: string;
  key: string;
  label: string | null;
  multiplier_bps: number;
  active: boolean;
};

const NEW_RULE = {
  country_code: "DK", currency: "DKK", scope: "country" as Scope,
  region: "", city: "", postcode: "",
  min_hourly_minor: "" as string | number,
  max_hourly_minor: "" as string | number,
  recommended_hourly_minor: "" as string | number,
  active: true,
};
const NEW_MULT = { country_code: "DK", key: "weekend", label: "", multiplier_bps: 11000, active: true };

function inferScope(r: { region: string; city: string; postcode: string }): Scope {
  if (r.postcode) return "postcode";
  if (r.city) return "city";
  if (r.region) return "region";
  return "country";
}

export default function AdminPricing() {
  const { t } = useTranslation("admin");
  const [rules, setRules] = useState<Rule[]>([]);
  const [mults, setMults] = useState<Multiplier[]>([]);
  const [newRule, setNewRule] = useState({ ...NEW_RULE });
  const [newMult, setNewMult] = useState({ ...NEW_MULT });

  async function load() {
    const [r, m] = await Promise.all([
      supabase.from("market_pricing_rules").select("*")
        .order("country_code").order("scope").order("region").order("city").order("postcode").limit(500),
      supabase.from("market_pricing_multipliers").select("*")
        .order("country_code").order("key").limit(200),
    ]);
    if (r.data) setRules(r.data as unknown as Rule[]);
    if (m.data) setMults(m.data as unknown as Multiplier[]);
  }
  useEffect(() => { load(); }, []);

  async function saveRule() {
    const scope = inferScope(newRule);
    const min = Number(newRule.min_hourly_minor);
    if (!newRule.country_code || !newRule.currency || !min) {
      return toast.error(t("pages.adminPricing.requiredFields"));
    }
    const { error } = await supabase.from("market_pricing_rules").insert({
      country_code: newRule.country_code.toUpperCase(),
      currency: newRule.currency.toUpperCase(),
      scope,
      region: newRule.region || null,
      city: newRule.city || null,
      postcode: newRule.postcode || null,
      min_hourly_minor: min,
      max_hourly_minor: newRule.max_hourly_minor ? Number(newRule.max_hourly_minor) : null,
      recommended_hourly_minor: newRule.recommended_hourly_minor ? Number(newRule.recommended_hourly_minor) : null,
      active: newRule.active,
    });
    if (error) return toast.error(error.message);
    toast.success(t("pages.adminPricing.ruleAdded"));
    setNewRule({ ...NEW_RULE });
    load();
  }

  async function toggleRule(id: string, active: boolean) {
    const { error } = await supabase.from("market_pricing_rules").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function saveMult() {
    if (!newMult.country_code || !newMult.key || newMult.multiplier_bps == null) {
      return toast.error(t("pages.adminPricing.multiplierRequiredFields"));
    }
    const { error } = await supabase.from("market_pricing_multipliers").insert({
      country_code: newMult.country_code.toUpperCase(),
      key: newMult.key,
      label: newMult.label || null,
      multiplier_bps: Number(newMult.multiplier_bps),
      active: newMult.active,
    });
    if (error) return toast.error(error.message);
    toast.success(t("pages.adminPricing.multiplierAdded"));
    setNewMult({ ...NEW_MULT });
    load();
  }

  async function toggleMult(id: string, active: boolean) {
    const { error } = await supabase.from("market_pricing_multipliers").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-serif">{t("pages.adminPricing.title")}</h1>
        <p className="text-muted-foreground">
          {t("pages.adminPricing.subtitle")}
        </p>
      </header>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">{t("pages.adminPricing.marketRules")}</TabsTrigger>
          <TabsTrigger value="multipliers">{t("pages.adminPricing.multipliers")}</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t("pages.adminPricing.newRule")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-4 gap-3">
              <div><Label>{t("pages.adminPricing.country")}</Label>
                <Input value={newRule.country_code} maxLength={2}
                  onChange={e => setNewRule({ ...newRule, country_code: e.target.value })} /></div>
              <div><Label>{t("pages.adminPricing.currency")}</Label>
                <Input value={newRule.currency} maxLength={3}
                  onChange={e => setNewRule({ ...newRule, currency: e.target.value })} /></div>
              <div><Label>{t("pages.adminPricing.region")}</Label>
                <Input value={newRule.region} onChange={e => setNewRule({ ...newRule, region: e.target.value })} /></div>
              <div><Label>{t("pages.adminPricing.city")}</Label>
                <Input value={newRule.city} onChange={e => setNewRule({ ...newRule, city: e.target.value })} /></div>
              <div><Label>{t("pages.adminPricing.postcode")}</Label>
                <Input value={newRule.postcode} onChange={e => setNewRule({ ...newRule, postcode: e.target.value })} /></div>
              <div><Label>{t("pages.adminPricing.minMinor")}</Label>
                <Input type="number" value={newRule.min_hourly_minor}
                  onChange={e => setNewRule({ ...newRule, min_hourly_minor: e.target.value })} /></div>
              <div><Label>{t("pages.adminPricing.maxMinor")}</Label>
                <Input type="number" value={newRule.max_hourly_minor}
                  onChange={e => setNewRule({ ...newRule, max_hourly_minor: e.target.value })} /></div>
              <div><Label>{t("pages.adminPricing.recommendedMinor")}</Label>
                <Input type="number" value={newRule.recommended_hourly_minor}
                  onChange={e => setNewRule({ ...newRule, recommended_hourly_minor: e.target.value })} /></div>
              <div className="col-span-4">
                <p className="mb-2 text-xs text-muted-foreground">
                  {t("pages.adminPricing.scopeAutoDetected")} <b>{inferScope(newRule)}</b> {t("pages.adminPricing.scopeHint")}
                </p>
                <Button onClick={saveRule}>{t("pages.adminPricing.addRule")}</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("pages.adminPricing.activeRules", { count: rules.length })}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto text-sm">
              <table className="w-full">
                <thead className="text-left text-muted-foreground">
                  <tr><th>{t("pages.adminPricing.country")}</th><th>{t("pages.adminPricing.scope")}</th><th>{t("pages.adminPricing.region")}</th><th>{t("pages.adminPricing.city")}</th><th>{t("pages.adminPricing.postcode")}</th>
                    <th>{t("pages.adminPricing.cur")}</th><th>{t("pages.adminPricing.min")}</th><th>{t("pages.adminPricing.max")}</th><th>{t("pages.adminPricing.rec")}</th><th>{t("pages.adminPricing.active")}</th></tr>
                </thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id} className="border-t">
                      <td>{r.country_code}</td>
                      <td><Badge variant="outline">{r.scope}</Badge></td>
                      <td>{r.region ?? "—"}</td><td>{r.city ?? "—"}</td><td>{r.postcode ?? "—"}</td>
                      <td>{r.currency}</td>
                      <td>{formatMinor(r.min_hourly_minor, r.currency)}</td>
                      <td>{formatMinor(r.max_hourly_minor, r.currency)}</td>
                      <td>{formatMinor(r.recommended_hourly_minor, r.currency)}</td>
                      <td><Switch checked={r.active} onCheckedChange={v => toggleRule(r.id, v)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="multipliers" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t("pages.adminPricing.newMultiplier")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-4 gap-3">
              <div><Label>{t("pages.adminPricing.country")}</Label>
                <Input value={newMult.country_code} maxLength={2}
                  onChange={e => setNewMult({ ...newMult, country_code: e.target.value })} /></div>
              <div><Label>{t("pages.adminPricing.key")}</Label>
                <Input value={newMult.key} placeholder="weekend | holiday:2026-12-24 | demand:high"
                  onChange={e => setNewMult({ ...newMult, key: e.target.value })} /></div>
              <div><Label>{t("pages.adminPricing.label")}</Label>
                <Input value={newMult.label}
                  onChange={e => setNewMult({ ...newMult, label: e.target.value })} /></div>
              <div><Label>{t("pages.adminPricing.multiplierBps")}</Label>
                <Input type="number" value={newMult.multiplier_bps}
                  onChange={e => setNewMult({ ...newMult, multiplier_bps: Number(e.target.value) })} /></div>
              <div className="col-span-4"><Button onClick={saveMult}>{t("pages.adminPricing.addMultiplier")}</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("pages.adminPricing.multipliersCount", { count: mults.length })}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto text-sm">
              <table className="w-full">
                <thead className="text-left text-muted-foreground">
                  <tr><th>{t("pages.adminPricing.country")}</th><th>{t("pages.adminPricing.key")}</th><th>{t("pages.adminPricing.label")}</th><th>{t("pages.adminPricing.bps")}</th><th>{t("pages.adminPricing.active")}</th></tr>
                </thead>
                <tbody>
                  {mults.map(m => (
                    <tr key={m.id} className="border-t">
                      <td>{m.country_code}</td>
                      <td><Badge variant="outline">{m.key}</Badge></td>
                      <td>{m.label ?? "—"}</td>
                      <td>{m.multiplier_bps}</td>
                      <td><Switch checked={m.active} onCheckedChange={v => toggleMult(m.id, v)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
