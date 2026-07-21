import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, THead, TR } from "@/components/ui/table";
import { toast } from "sonner";
import { formatMinor } from "@/lib/marketPricing";

type Rule = {
  id: string;
  country_code: string;
  region: string | null;
  city: string | null;
  postcode: string | null;
  currency: string;
  min_price_minor: number;
  max_price_minor: number | null;
  recommended_price_minor: number | null;
  active: boolean;
  updated_at: string;
};

type Multiplier = {
  id: string;
  country_code: string | null;
  kind: string;
  key: string | null;
  multiplier_bps: number;
  active: boolean;
};

const NEW_RULE: Partial<Rule> = { country_code: "DK", currency: "DKK", active: true };
const NEW_MULT: Partial<Multiplier> = { kind: "weekend", multiplier_bps: 11000, active: true };

export default function AdminPricing() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [mults, setMults] = useState<Multiplier[]>([]);
  const [newRule, setNewRule] = useState<Partial<Rule>>(NEW_RULE);
  const [newMult, setNewMult] = useState<Partial<Multiplier>>(NEW_MULT);

  async function load() {
    const [r, m] = await Promise.all([
      supabase.from("market_pricing_rules").select("*").order("country_code").order("region")
        .order("city").order("postcode").limit(500),
      supabase.from("market_pricing_multipliers").select("*").order("country_code").order("kind").limit(200),
    ]);
    if (r.data) setRules(r.data as unknown as Rule[]);
    if (m.data) setMults(m.data as unknown as Multiplier[]);
  }
  useEffect(() => { load(); }, []);

  async function saveRule() {
    if (!newRule.country_code || !newRule.currency || newRule.min_price_minor == null) {
      return toast.error("Country, currency and min price required");
    }
    const { error } = await supabase.from("market_pricing_rules").insert({
      country_code: newRule.country_code.toUpperCase(),
      region: newRule.region || null,
      city: newRule.city || null,
      postcode: newRule.postcode || null,
      currency: newRule.currency.toUpperCase(),
      min_price_minor: Number(newRule.min_price_minor),
      max_price_minor: newRule.max_price_minor != null ? Number(newRule.max_price_minor) : null,
      recommended_price_minor: newRule.recommended_price_minor != null ? Number(newRule.recommended_price_minor) : null,
      active: newRule.active ?? true,
    });
    if (error) return toast.error(error.message);
    toast.success("Rule added");
    setNewRule(NEW_RULE);
    load();
  }

  async function toggleRule(id: string, active: boolean) {
    const { error } = await supabase.from("market_pricing_rules").update({ active }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function saveMult() {
    if (!newMult.kind || newMult.multiplier_bps == null) return toast.error("Kind and bps required");
    const { error } = await supabase.from("market_pricing_multipliers").insert({
      country_code: newMult.country_code ? newMult.country_code.toUpperCase() : null,
      kind: newMult.kind,
      key: newMult.key || null,
      multiplier_bps: Number(newMult.multiplier_bps),
      active: newMult.active ?? true,
    });
    if (error) return toast.error(error.message);
    toast.success("Multiplier added");
    setNewMult(NEW_MULT);
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
        <h1 className="text-3xl font-serif">Pricing rules</h1>
        <p className="text-muted-foreground">
          Marketplace-only advisory rules. Not linked to checkout, bookings or payouts.
        </p>
      </header>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Market rules</TabsTrigger>
          <TabsTrigger value="multipliers">Multipliers</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>New rule</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-4 gap-3">
              <div><Label>Country</Label>
                <Input value={newRule.country_code ?? ""} maxLength={2}
                  onChange={e => setNewRule({ ...newRule, country_code: e.target.value })} /></div>
              <div><Label>Currency</Label>
                <Input value={newRule.currency ?? ""} maxLength={3}
                  onChange={e => setNewRule({ ...newRule, currency: e.target.value })} /></div>
              <div><Label>Region</Label>
                <Input value={newRule.region ?? ""} onChange={e => setNewRule({ ...newRule, region: e.target.value })} /></div>
              <div><Label>City</Label>
                <Input value={newRule.city ?? ""} onChange={e => setNewRule({ ...newRule, city: e.target.value })} /></div>
              <div><Label>Postcode</Label>
                <Input value={newRule.postcode ?? ""} onChange={e => setNewRule({ ...newRule, postcode: e.target.value })} /></div>
              <div><Label>Min (minor)</Label>
                <Input type="number" value={newRule.min_price_minor ?? ""}
                  onChange={e => setNewRule({ ...newRule, min_price_minor: Number(e.target.value) })} /></div>
              <div><Label>Max (minor)</Label>
                <Input type="number" value={newRule.max_price_minor ?? ""}
                  onChange={e => setNewRule({ ...newRule, max_price_minor: e.target.value ? Number(e.target.value) : null })} /></div>
              <div><Label>Recommended (minor)</Label>
                <Input type="number" value={newRule.recommended_price_minor ?? ""}
                  onChange={e => setNewRule({ ...newRule, recommended_price_minor: e.target.value ? Number(e.target.value) : null })} /></div>
              <div className="col-span-4"><Button onClick={saveRule}>Add rule</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Active rules ({rules.length})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto text-sm">
              <table className="w-full">
                <thead className="text-left text-muted-foreground">
                  <tr><th>Country</th><th>Region</th><th>City</th><th>Postcode</th>
                    <th>Cur</th><th>Min</th><th>Max</th><th>Rec</th><th>Active</th></tr>
                </thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id} className="border-t">
                      <td>{r.country_code}</td><td>{r.region ?? "—"}</td><td>{r.city ?? "—"}</td>
                      <td>{r.postcode ?? "—"}</td><td>{r.currency}</td>
                      <td>{formatMinor(r.min_price_minor, r.currency)}</td>
                      <td>{formatMinor(r.max_price_minor, r.currency)}</td>
                      <td>{formatMinor(r.recommended_price_minor, r.currency)}</td>
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
            <CardHeader><CardTitle>New multiplier</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-4 gap-3">
              <div><Label>Country (blank = global)</Label>
                <Input value={newMult.country_code ?? ""} maxLength={2}
                  onChange={e => setNewMult({ ...newMult, country_code: e.target.value })} /></div>
              <div><Label>Kind</Label>
                <Input value={newMult.kind ?? ""} placeholder="weekend | holiday | demand | region"
                  onChange={e => setNewMult({ ...newMult, kind: e.target.value })} /></div>
              <div><Label>Key</Label>
                <Input value={newMult.key ?? ""} placeholder="e.g. 2026-12-24 or 'high'"
                  onChange={e => setNewMult({ ...newMult, key: e.target.value })} /></div>
              <div><Label>Multiplier bps</Label>
                <Input type="number" value={newMult.multiplier_bps ?? ""}
                  onChange={e => setNewMult({ ...newMult, multiplier_bps: Number(e.target.value) })} /></div>
              <div className="col-span-4"><Button onClick={saveMult}>Add multiplier</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Multipliers ({mults.length})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto text-sm">
              <table className="w-full">
                <thead className="text-left text-muted-foreground">
                  <tr><th>Country</th><th>Kind</th><th>Key</th><th>Bps</th><th>Active</th></tr>
                </thead>
                <tbody>
                  {mults.map(m => (
                    <tr key={m.id} className="border-t">
                      <td>{m.country_code ?? "global"}</td>
                      <td><Badge variant="outline">{m.kind}</Badge></td>
                      <td>{m.key ?? "—"}</td>
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
