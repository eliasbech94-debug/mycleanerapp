import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ProviderTaxProfile } from "@/lib/invoices";

const COUNTRIES = ["DK","SE","NO","FI","DE","NL","BE","FR","ES","IT","PL","GB"];

export function ProviderTaxProfileTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProviderTaxProfile>({
    country_code: "DK", provider_type: "private", vat_registered: false,
    vat_number: "", business_name: "", business_address: "", tax_id: "",
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await (supabase as any).from("provider_tax_profiles")
        .select("*").eq("provider_user_id", user.id).maybeSingle();
      if (data) setForm({
        country_code: data.country_code, provider_type: data.provider_type,
        vat_registered: data.vat_registered, vat_number: data.vat_number ?? "",
        business_name: data.business_name ?? "", business_address: data.business_address ?? "",
        tax_id: data.tax_id ?? "",
      });
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Ikke logget ind");
      const payload = { ...form, provider_user_id: user.id };
      const { error } = await (supabase as any).from("provider_tax_profiles")
        .upsert(payload, { onConflict: "provider_user_id" });
      if (error) throw error;
      toast.success("Skatteoplysninger gemt");
    } catch (e: any) {
      toast.error(e.message ?? "Kunne ikke gemme");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skatteoplysninger (marketplace)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Bruges når MyCleaner udsteder platformgebyr-fakturaen til dig. Angiv dit land, om du er
          privat eller erhverv, og om du er momsregistreret. Har du et gyldigt EU-VAT-nummer,
          anvender vi reverse charge på gebyret.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Land</Label>
            <Select value={form.country_code} onValueChange={(v) => setForm({ ...form, country_code: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.provider_type} onValueChange={(v: any) => setForm({ ...form, provider_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Privat</SelectItem>
                <SelectItem value="business">Erhverv</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label>Momsregistreret</Label>
            <p className="text-xs text-muted-foreground">Sæt til hvis du har et gyldigt VAT/moms-nummer.</p>
          </div>
          <Switch checked={form.vat_registered} onCheckedChange={(v) => setForm({ ...form, vat_registered: v })} />
        </div>
        {form.vat_registered && (
          <div>
            <Label>VAT-nummer</Label>
            <Input value={form.vat_number ?? ""} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} placeholder="DK12345678" />
          </div>
        )}
        {form.provider_type === "business" && (
          <>
            <div>
              <Label>Firmanavn</Label>
              <Input value={form.business_name ?? ""} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
            </div>
            <div>
              <Label>Firmaadresse</Label>
              <Input value={form.business_address ?? ""} onChange={(e) => setForm({ ...form, business_address: e.target.value })} />
            </div>
            <div>
              <Label>CVR / Tax ID</Label>
              <Input value={form.tax_id ?? ""} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
            </div>
          </>
        )}
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Gem
        </Button>
      </CardContent>
    </Card>
  );
}
