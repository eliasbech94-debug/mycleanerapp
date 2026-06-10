import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { countries } from "@/lib/countries";
import { toast } from "sonner";
import { Save, Plus, Trash2, RefreshCw } from "lucide-react";

export type Threshold = {
  country_code: string;
  currency: string;
  min_hourly_rate: number;
  max_hourly_rate: number;
  notes: string | null;
  updated_at?: string;
};

type Props = {
  onLoaded?: (rows: Threshold[]) => void;
  canEdit: boolean;
};

export default function MarketThresholdsEditor({ onLoaded, canEdit }: Props) {
  const [rows, setRows] = useState<Threshold[]>([]);
  const [dirty, setDirty] = useState<Record<string, Threshold>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRow, setNewRow] = useState<Threshold>({
    country_code: "", currency: "", min_hourly_rate: 0, max_hourly_rate: 0, notes: "",
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("market_rate_thresholds")
      .select("*")
      .order("country_code");
    if (error) toast.error("Kunne ikke hente tærskler: " + error.message);
    const list = (data ?? []) as Threshold[];
    setRows(list);
    setDirty({});
    onLoaded?.(list);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const setField = (code: string, field: keyof Threshold, value: any) => {
    const base = dirty[code] ?? rows.find((r) => r.country_code === code);
    if (!base) return;
    setDirty({ ...dirty, [code]: { ...base, [field]: value } });
  };

  const saveAll = async () => {
    const changes = Object.values(dirty);
    if (!changes.length) return;
    setSaving(true);
    const payload = changes.map((c) => ({
      country_code: c.country_code,
      currency: c.currency.toUpperCase(),
      min_hourly_rate: Number(c.min_hourly_rate),
      max_hourly_rate: Number(c.max_hourly_rate),
      notes: c.notes ?? null,
    }));
    const { error } = await supabase
      .from("market_rate_thresholds")
      .upsert(payload, { onConflict: "country_code" });
    setSaving(false);
    if (error) { toast.error("Kunne ikke gemme: " + error.message); return; }
    toast.success(`Gemte ${changes.length} ændring(er)`);
    await load();
  };

  const addRow = async () => {
    if (!newRow.country_code || !newRow.currency) {
      toast.error("Landekode og valuta er påkrævet");
      return;
    }
    const { error } = await supabase.from("market_rate_thresholds").insert({
      country_code: newRow.country_code.toUpperCase(),
      currency: newRow.currency.toUpperCase(),
      min_hourly_rate: Number(newRow.min_hourly_rate),
      max_hourly_rate: Number(newRow.max_hourly_rate),
      notes: newRow.notes,
    });
    if (error) { toast.error("Kunne ikke tilføje: " + error.message); return; }
    toast.success("Tilføjet");
    setNewRow({ country_code: "", currency: "", min_hourly_rate: 0, max_hourly_rate: 0, notes: "" });
    await load();
  };

  const removeRow = async (code: string) => {
    if (!confirm(`Slet tærskel for ${code}?`)) return;
    const { error } = await supabase.from("market_rate_thresholds").delete().eq("country_code", code);
    if (error) { toast.error("Kunne ikke slette: " + error.message); return; }
    toast.success("Slettet");
    await load();
  };

  const valueOf = (code: string, field: keyof Threshold) => {
    const d = dirty[code];
    if (d) return (d as any)[field];
    const r = rows.find((x) => x.country_code === code);
    return r ? (r as any)[field] : "";
  };

  const dirtyCount = Object.keys(dirty).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle>Markedstærskler pr. land</CardTitle>
            <CardDescription>
              Min/max timeløn pr. land og valuta. Bookinger med provider-timeløn uden for spændet flagges.
              {!canEdit && " (kun læseadgang – kræver admin)"}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Genindlæs
            </Button>
            {canEdit && (
              <Button size="sm" onClick={saveAll} disabled={!dirtyCount || saving}>
                <Save className="h-4 w-4 mr-2" />
                Gem {dirtyCount > 0 ? `(${dirtyCount})` : ""}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Land</th>
                <th className="py-2 pr-3">Valuta</th>
                <th className="py-2 pr-3">Min timeløn</th>
                <th className="py-2 pr-3">Max timeløn</th>
                <th className="py-2 pr-3">Note</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const country = countries.find((c) => c.code === r.country_code);
                const isDirty = !!dirty[r.country_code];
                return (
                  <tr key={r.country_code} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{country?.flag ?? "🏳️"}</span>
                        <span className="font-mono">{r.country_code}</span>
                        {country && <span className="text-muted-foreground hidden md:inline">{country.name}</span>}
                        {isDirty && <Badge className="bg-orange-500 text-white text-[10px]">ændret</Badge>}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        value={valueOf(r.country_code, "currency")}
                        disabled={!canEdit}
                        onChange={(e) => setField(r.country_code, "currency", e.target.value)}
                        className="h-8 w-20 font-mono uppercase"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number" step="0.5" min={0}
                        value={valueOf(r.country_code, "min_hourly_rate")}
                        disabled={!canEdit}
                        onChange={(e) => setField(r.country_code, "min_hourly_rate", e.target.value)}
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number" step="0.5" min={0}
                        value={valueOf(r.country_code, "max_hourly_rate")}
                        disabled={!canEdit}
                        onChange={(e) => setField(r.country_code, "max_hourly_rate", e.target.value)}
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        value={valueOf(r.country_code, "notes") ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => setField(r.country_code, "notes", e.target.value)}
                        className="h-8 w-full min-w-[10rem]"
                        placeholder="—"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      {canEdit && (
                        <Button size="icon" variant="ghost" onClick={() => removeRow(r.country_code)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {canEdit && (
                <tr className="bg-muted/30">
                  <td className="py-2 pr-3">
                    <Input
                      value={newRow.country_code}
                      onChange={(e) => setNewRow({ ...newRow, country_code: e.target.value.toUpperCase() })}
                      placeholder="DK"
                      className="h-8 w-20 font-mono"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      value={newRow.currency}
                      onChange={(e) => setNewRow({ ...newRow, currency: e.target.value.toUpperCase() })}
                      placeholder="DKK"
                      className="h-8 w-20 font-mono"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number" step="0.5" min={0}
                      value={newRow.min_hourly_rate}
                      onChange={(e) => setNewRow({ ...newRow, min_hourly_rate: Number(e.target.value) || 0 })}
                      className="h-8 w-24"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number" step="0.5" min={0}
                      value={newRow.max_hourly_rate}
                      onChange={(e) => setNewRow({ ...newRow, max_hourly_rate: Number(e.target.value) || 0 })}
                      className="h-8 w-24"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      value={newRow.notes ?? ""}
                      onChange={(e) => setNewRow({ ...newRow, notes: e.target.value })}
                      placeholder="Note"
                      className="h-8 w-full min-w-[10rem]"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Button size="sm" variant="outline" onClick={addRow}>
                      <Plus className="h-4 w-4 mr-1" /> Tilføj
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
