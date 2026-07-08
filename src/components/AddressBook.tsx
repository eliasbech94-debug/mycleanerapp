import { useEffect, useState } from "react";
import { CheckCircle2, Home, Loader2, MapPin, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import {
  ACCESS_METHOD_LABEL, AccessMethod, CustomerAddress, listAddresses,
  PLACE_TYPE_LABEL, PlaceType,
} from "@/lib/customerAddresses";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

type Props = {
  /** Optional: when used as a picker (e.g. in booking flow). */
  selectable?: boolean;
  selectedId?: string | null;
  onSelect?: (a: CustomerAddress) => void;
  /** Hide compact wrapper styling when embedded. */
  compact?: boolean;
};

export default function AddressBook({ selectable, selectedId, onSelect, compact }: Props) {
  const { user, profile } = useAuth();
  const userCountry = (profile?.country_code || "DK").toLowerCase();
  const [items, setItems] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CustomerAddress | "new" | null>(null);

  async function reload() {
    if (!user) return;
    setLoading(true);
    try {
      const data = await listAddresses(user.id);
      setItems(data);
    } catch (e: any) {
      toast.error(e.message || "Kunne ikke hente adresser");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, [user?.id]);

  async function makePrimary(a: CustomerAddress) {
    const { error } = await supabase
      .from("customer_addresses" as any)
      .update({ is_primary: true })
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Markeret som primær");
    reload();
  }

  async function remove(a: CustomerAddress) {
    if (!confirm(`Slet adressen "${a.label}"?`)) return;
    const { error } = await supabase
      .from("customer_addresses" as any)
      .delete()
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Adresse slettet");
    reload();
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-10">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {items.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed bg-white p-6 text-center" style={{ borderColor: `${C.ink}33` }}>
          <MapPin className="mx-auto mb-2 h-6 w-6 opacity-60" />
          <div className="font-display text-lg">Ingen gemte adresser endnu</div>
          <div className="mt-1 text-sm opacity-70">Tilføj en adresse, så du kan booke hurtigere næste gang.</div>
        </div>
      )}

      {items.map((a) => {
        const isSelected = selectable && selectedId === a.id;
        return (
          <div
            key={a.id}
            onClick={() => selectable && onSelect?.(a)}
            className={`rounded-2xl border-2 bg-white p-4 transition ${selectable ? "cursor-pointer hover:-translate-y-0.5" : ""}`}
            style={{
              borderColor: isSelected ? C.teal : a.is_primary ? C.orange : `${C.ink}22`,
              background: isSelected ? `${C.mint}40` : "white",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl"
                  style={{ background: a.is_primary ? C.orange : C.teal, color: C.cream }}
                >
                  {a.place_type === "business" ? <Star className="h-5 w-5" /> : <Home className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-display text-lg leading-tight">{a.label}</span>
                    {a.is_primary && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em]" style={{ background: C.orange, color: C.ink }}>
                        <Star className="h-2.5 w-2.5" /> Primær
                      </span>
                    )}
                    <span className="rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]" style={{ borderColor: `${C.ink}33` }}>
                      {PLACE_TYPE_LABEL[a.place_type]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm opacity-80">{a.address}</div>

                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                    {a.has_pets && (
                      <span className="rounded-full px-2 py-0.5" style={{ background: `${C.mint}80`, color: C.ink }}>🐾 {a.pet_details || "Kæledyr"}</span>
                    )}
                    {a.has_children && (
                      <span className="rounded-full px-2 py-0.5" style={{ background: `${C.mint}80`, color: C.ink }}>👶 Børn</span>
                    )}
                    {a.access_method !== "home" && (
                      <span className="rounded-full px-2 py-0.5" style={{ background: `${C.cream}`, color: C.ink, border: `1px solid ${C.ink}22` }}>
                        🔑 {ACCESS_METHOD_LABEL[a.access_method]}
                      </span>
                    )}
                    {a.parking_info && (
                      <span className="rounded-full px-2 py-0.5" style={{ background: `${C.cream}`, color: C.ink, border: `1px solid ${C.ink}22` }}>🅿️ {a.parking_info}</span>
                    )}
                    {a.size_sqm && (
                      <span className="rounded-full px-2 py-0.5" style={{ background: `${C.cream}`, color: C.ink, border: `1px solid ${C.ink}22` }}>{a.size_sqm} m²</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-shrink-0 flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                {isSelected && <CheckCircle2 className="h-5 w-5" style={{ color: C.teal }} />}
                {!a.is_primary && (
                  <button
                    type="button"
                    onClick={() => makePrimary(a)}
                    className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-70 hover:opacity-100"
                  >
                    Gør primær
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  className="rounded-full border-2 p-1.5 hover:bg-black/5"
                  style={{ borderColor: `${C.ink}33` }}
                  title="Rediger"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(a)}
                  className="rounded-full border-2 p-1.5 hover:bg-red-50"
                  style={{ borderColor: `${C.ink}33` }}
                  title="Slet"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => setEditing("new")}
        className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] shadow-[4px_4px_0_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5"
        style={{ background: C.ink, color: C.cream }}
      >
        <Plus className="h-4 w-4" /> Tilføj adresse
      </button>

      {editing && (
        <AddressDialog
          initial={editing === "new" ? null : editing}
          isFirst={items.length === 0}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

/* ---------------- Dialog ---------------- */
function AddressDialog({
  initial, isFirst, onClose, onSaved,
}: {
  initial: CustomerAddress | null;
  isFirst: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, profile } = useAuth();
  const userCountry = (profile?.country_code || "DK").toLowerCase();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    label: initial?.label ?? "Hjem",
    address: initial?.address ?? "",
    address_place_id: initial?.address_place_id ?? null as string | null,
    lat: initial?.lat ?? null as number | null,
    lng: initial?.lng ?? null as number | null,
    is_primary: initial?.is_primary ?? isFirst,
    place_type: (initial?.place_type ?? "private") as PlaceType,
    size_sqm: initial?.size_sqm ?? null as number | null,
    rooms: initial?.rooms ?? null as number | null,
    floor: initial?.floor ?? "",
    has_pets: initial?.has_pets ?? false,
    pet_details: initial?.pet_details ?? "",
    has_children: initial?.has_children ?? false,
    parking_info: initial?.parking_info ?? "",
    access_method: (initial?.access_method ?? "home") as AccessMethod,
    access_code: initial?.access_code ?? "",
    access_instructions: initial?.access_instructions ?? "",
    wifi_name: initial?.wifi_name ?? "",
    wifi_password: initial?.wifi_password ?? "",
    cleaning_supplies_available: initial?.cleaning_supplies_available ?? false,
    notes: initial?.notes ?? "",
  });
  const [addrValid, setAddrValid] = useState(!!initial?.address_place_id);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!user) return;
    if (!form.address.trim()) return toast.error("Adresse er påkrævet");
    if (form.address && !addrValid && !initial) {
      return toast.error("Vælg en gyldig adresse fra listen");
    }
    if (!form.label.trim()) return toast.error("Giv adressen et navn (fx Hjem)");

    setSaving(true);
    const payload: any = {
      ...form,
      label: form.label.trim(),
      address: form.address.trim(),
      floor: form.floor || null,
      pet_details: form.pet_details || null,
      parking_info: form.parking_info || null,
      access_code: form.access_code || null,
      access_instructions: form.access_instructions || null,
      wifi_name: form.wifi_name || null,
      wifi_password: form.wifi_password || null,
      notes: form.notes || null,
      user_id: user.id,
    };
    const q = initial
      ? supabase.from("customer_addresses" as any).update(payload).eq("id", initial.id)
      : supabase.from("customer_addresses" as any).insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(initial ? "Adresse opdateret" : "Adresse tilføjet");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border-4 bg-white p-6 shadow-[10px_10px_0_rgba(0,0,0,0.2)]"
        style={{ borderColor: C.ink }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">{initial ? "Rediger adresse" : "Ny adresse"}</h2>
          <button onClick={onClose} className="rounded-full border-2 p-1.5" style={{ borderColor: `${C.ink}33` }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <Row label="Navn på adressen">
            <input
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="Fx Hjem, Sommerhus, Kontor"
              className="w-full bg-transparent text-base focus:outline-none"
            />
          </Row>

          <Row label="Adresse">
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => { set("address", v); setAddrValid(false); }}
              onSelect={(p) => {
                set("address", p.address);
                set("address_place_id", p.placeId);
                set("lat", p.lat ?? null);
                set("lng", p.lng ?? null);
                setAddrValid(true);
              }}
              onValidityChange={setAddrValid}
              isValid={addrValid}
              placeholder="Vej, nr., by"
              countries={["dk"]}
            />
          </Row>

          <Row label="Type af sted">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PLACE_TYPE_LABEL) as PlaceType[]).map((t) => (
                <Chip key={t} active={form.place_type === t} onClick={() => set("place_type", t)}>
                  {PLACE_TYPE_LABEL[t]}
                </Chip>
              ))}
            </div>
          </Row>

          <div className="grid grid-cols-3 gap-3">
            <Row label="Størrelse (m²)">
              <input type="number" value={form.size_sqm ?? ""} onChange={(e) => set("size_sqm", e.target.value ? Number(e.target.value) : null)} className="w-full bg-transparent focus:outline-none" />
            </Row>
            <Row label="Værelser">
              <input type="number" value={form.rooms ?? ""} onChange={(e) => set("rooms", e.target.value ? Number(e.target.value) : null)} className="w-full bg-transparent focus:outline-none" />
            </Row>
            <Row label="Etage">
              <input value={form.floor} onChange={(e) => set("floor", e.target.value)} placeholder="3. sal th" className="w-full bg-transparent focus:outline-none" />
            </Row>
          </div>

          <Row label="Adgang for cleaner">
            <select
              value={form.access_method}
              onChange={(e) => set("access_method", e.target.value as AccessMethod)}
              className="w-full bg-transparent focus:outline-none"
            >
              {(Object.keys(ACCESS_METHOD_LABEL) as AccessMethod[]).map((m) => (
                <option key={m} value={m}>{ACCESS_METHOD_LABEL[m]}</option>
              ))}
            </select>
          </Row>

          {(form.access_method === "code" || form.access_method === "key_box") && (
            <Row label="Kode">
              <input value={form.access_code} onChange={(e) => set("access_code", e.target.value)} placeholder="Fx 1234" className="w-full bg-transparent focus:outline-none" />
            </Row>
          )}

          <Row label="Adgangsinstruktioner (valgfri)">
            <textarea
              value={form.access_instructions}
              onChange={(e) => set("access_instructions", e.target.value)}
              rows={2}
              placeholder="Fx: Ring på dør B, nøglen ligger under måtten"
              className="w-full resize-none bg-transparent focus:outline-none"
            />
          </Row>

          <div className="grid grid-cols-2 gap-3">
            <Toggle label="Kæledyr i hjemmet" checked={form.has_pets} onChange={(v) => set("has_pets", v)} />
            <Toggle label="Børn i hjemmet" checked={form.has_children} onChange={(v) => set("has_children", v)} />
          </div>

          {form.has_pets && (
            <Row label="Detaljer om kæledyr">
              <input value={form.pet_details} onChange={(e) => set("pet_details", e.target.value)} placeholder="Fx 1 hund, allergivenlig" className="w-full bg-transparent focus:outline-none" />
            </Row>
          )}

          <Row label="Parkering">
            <input value={form.parking_info} onChange={(e) => set("parking_info", e.target.value)} placeholder="Fx Gratis ved døren / betalingszone" className="w-full bg-transparent focus:outline-none" />
          </Row>

          <Toggle
            label="Rengøringsmidler står klar"
            checked={form.cleaning_supplies_available}
            onChange={(v) => set("cleaning_supplies_available", v)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Row label="WiFi-navn (valgfri)">
              <input value={form.wifi_name} onChange={(e) => set("wifi_name", e.target.value)} className="w-full bg-transparent focus:outline-none" />
            </Row>
            <Row label="WiFi-kode (valgfri)">
              <input value={form.wifi_password} onChange={(e) => set("wifi_password", e.target.value)} className="w-full bg-transparent focus:outline-none" />
            </Row>
          </div>

          <Row label="Andre bemærkninger">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="w-full resize-none bg-transparent focus:outline-none"
            />
          </Row>

          <Toggle label="Markér som primær adresse" checked={form.is_primary} onChange={(v) => set("is_primary", v)} />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-full border-2 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ borderColor: C.ink }}>
            Annullér
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] shadow-[4px_4px_0_rgba(0,0,0,0.18)] disabled:opacity-50"
            style={{ background: C.orange, color: C.ink }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Gem adresse
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block rounded-xl border-2 bg-white p-3" style={{ borderColor: `${C.ink}22` }}>
      <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">{label}</div>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] transition"
      style={{
        background: active ? C.ink : "transparent",
        color: active ? C.cream : C.ink,
        borderColor: active ? C.ink : `${C.ink}33`,
      }}
    >
      {children}
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 rounded-xl border-2 bg-white px-3 py-2.5 text-left"
      style={{ borderColor: checked ? C.teal : `${C.ink}22` }}
    >
      <span className="text-sm font-bold">{label}</span>
      <span
        className="grid h-5 w-9 place-items-center rounded-full transition"
        style={{ background: checked ? C.teal : `${C.ink}22` }}
      >
        <span
          className="h-3.5 w-3.5 rounded-full bg-white transition"
          style={{ transform: checked ? "translateX(8px)" : "translateX(-8px)" }}
        />
      </span>
    </button>
  );
}
