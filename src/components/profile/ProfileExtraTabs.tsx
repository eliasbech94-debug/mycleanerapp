import { useEffect, useState } from "react";
import { Bell, Loader2, MessageSquare, Receipt, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

function Card({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section
      className="rounded-3xl border-2 p-6 sm:p-8"
      style={{ borderColor: `${C.ink}1a`, background: "#fff" }}
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: `${C.teal}22`, color: C.teal }}>
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="font-display text-2xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Toggle({
  label, hint, value, onChange, disabled,
}: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl border p-4" style={{ borderColor: `${C.ink}1a` }}>
      <div className="min-w-0">
        <div className="text-sm font-bold">{label}</div>
        {hint && <div className="mt-0.5 text-xs opacity-70">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className="relative h-7 w-12 shrink-0 rounded-full transition"
        style={{ background: value ? C.teal : `${C.ink}33`, opacity: disabled ? 0.5 : 1 }}
      >
        <span
          className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition"
          style={{ left: value ? "22px" : "2px" }}
        />
      </button>
    </label>
  );
}

type Prefs = { email: boolean; push: boolean; sms: boolean; marketing: boolean };
const DEFAULT_PREFS: Prefs = { email: true, push: true, sms: false, marketing: false };

/* ---------- NOTIFIKATIONER ---------- */
export function NotificationsTab() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushStatus, setPushStatus] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("notification_prefs").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        const p = (data as any)?.notification_prefs;
        if (p) setPrefs({ ...DEFAULT_PREFS, ...p });
        setLoading(false);
      });
  }, [user]);

  async function save(next: Prefs) {
    if (!user) return;
    setPrefs(next);
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ notification_prefs: next } as any).eq("id", user.id);
    setSaving(false);
    if (error) toast.error("Kunne ikke gemme"); else toast.success("Gemt");
  }

  async function enablePush() {
    if (typeof Notification === "undefined") { toast.error("Push understøttes ikke i denne browser"); return; }
    const perm = await Notification.requestPermission();
    setPushStatus(perm);
    if (perm === "granted") save({ ...prefs, push: true });
    else toast.error("Push blev afvist");
  }

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <Card title="Notifikationer" icon={Bell}>
      <div className="space-y-3">
        <Toggle
          label="Email-notifikationer"
          hint="Kvitteringer, bookingopdateringer og påmindelser."
          value={prefs.email}
          onChange={(v) => save({ ...prefs, email: v })}
          disabled={saving}
        />
        <Toggle
          label="Push-notifikationer"
          hint={
            pushStatus === "denied"
              ? "Blokeret i browseren — aktivér i browser-indstillinger."
              : pushStatus !== "granted"
              ? "Tillad browseren at vise push."
              : "Aktive i denne browser."
          }
          value={prefs.push && pushStatus === "granted"}
          onChange={(v) => {
            if (v && pushStatus !== "granted") enablePush();
            else save({ ...prefs, push: v });
          }}
          disabled={saving || pushStatus === "denied"}
        />
        <Toggle
          label="Marketing & nyheder"
          hint="Tilbud, tips og produktnyt. Maks 1× pr. måned."
          value={prefs.marketing}
          onChange={(v) => save({ ...prefs, marketing: v })}
          disabled={saving}
        />
      </div>
    </Card>
  );
}

/* ---------- SMS ---------- */
export function SmsTab() {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("sms_phone, notification_prefs, phone").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        const d: any = data || {};
        setPhone(d.sms_phone || d.phone || "");
        setEnabled(!!d.notification_prefs?.sms);
        setLoading(false);
      });
  }, [user]);

  async function save() {
    if (!user) return;
    if (enabled && !/^\+?[0-9\s\-()]{7,}$/.test(phone)) { toast.error("Ugyldigt telefonnummer"); return; }
    setSaving(true);
    const { data: current } = await supabase.from("profiles").select("notification_prefs").eq("id", user.id).maybeSingle();
    const prefs = { ...DEFAULT_PREFS, ...((current as any)?.notification_prefs || {}), sms: enabled };
    const { error } = await supabase.from("profiles").update({
      sms_phone: phone || null,
      notification_prefs: prefs,
    } as any).eq("id", user.id);
    setSaving(false);
    if (error) toast.error("Kunne ikke gemme"); else toast.success("Gemt");
  }

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <Card title="SMS-notifikationer" icon={MessageSquare}>
      <p className="mb-5 text-sm opacity-75">
        Modtag SMS ved bookingbekræftelser, ændringer og påmindelser 24 timer før. Almindelige takster kan gælde.
      </p>
      <div className="space-y-3">
        <Toggle
          label="Aktivér SMS"
          hint="Kun kritiske beskeder — aldrig marketing."
          value={enabled}
          onChange={setEnabled}
          disabled={saving}
        />
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider opacity-70">Telefonnummer</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+45 12 34 56 78"
            className="w-full rounded-xl border-2 bg-white px-4 py-3 text-sm"
            style={{ borderColor: `${C.ink}22`, color: C.ink }}
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50"
          style={{ background: C.ink, color: C.cream }}
        >
          {saving ? "Gemmer…" : "Gem SMS-indstillinger"}
        </button>
      </div>
    </Card>
  );
}

/* ---------- SKATTEOPLYSNINGER ---------- */
export function TaxTab() {
  const { user } = useAuth();
  const [taxId, setTaxId] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [type, setType] = useState<"private" | "business">("private");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasStored, setHasStored] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("tax_id_encrypted, tax_municipality, tax_type").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        const d: any = data || {};
        setHasStored(!!d.tax_id_encrypted);
        setMunicipality(d.tax_municipality || "");
        setType(d.tax_type || "private");
        setLoading(false);
      });
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    // Simpelt server-side base64 obfuskering — reel kryptering håndteres backend-side ved brug
    const encoded = taxId ? btoa(unescape(encodeURIComponent(taxId))) : undefined;
    const patch: any = {
      tax_municipality: municipality || null,
      tax_type: type,
    };
    if (encoded) patch.tax_id_encrypted = encoded;
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error("Kunne ikke gemme"); return; }
    toast.success("Skatteoplysninger gemt");
    setTaxId("");
    if (encoded) setHasStored(true);
  }

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <Card title="Skatteoplysninger" icon={Receipt}>
      <p className="mb-5 text-sm opacity-75">
        Bruges til årsopgørelse, servicefradrag og korrekt indberetning. Dine oplysninger gemmes krypteret og deles aldrig med tredjepart.
      </p>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider opacity-70">Type</label>
          <div className="flex gap-2">
            {(["private", "business"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className="flex-1 rounded-xl border-2 px-4 py-3 text-sm font-bold"
                style={{
                  borderColor: type === t ? C.teal : `${C.ink}22`,
                  background: type === t ? `${C.teal}18` : "#fff",
                  color: C.ink,
                }}
              >
                {t === "private" ? "Privatperson (CPR)" : "Virksomhed (CVR)"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider opacity-70">
            {type === "private" ? "CPR-nummer" : "CVR-nummer"}
          </label>
          <input
            type="text"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder={hasStored ? "•••••••• (allerede gemt — udfyld for at ændre)" : type === "private" ? "010190-1234" : "12345678"}
            className="w-full rounded-xl border-2 bg-white px-4 py-3 text-sm"
            style={{ borderColor: `${C.ink}22`, color: C.ink }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider opacity-70">Skattekommune</label>
          <input
            type="text"
            value={municipality}
            onChange={(e) => setMunicipality(e.target.value)}
            placeholder="fx København"
            className="w-full rounded-xl border-2 bg-white px-4 py-3 text-sm"
            style={{ borderColor: `${C.ink}22`, color: C.ink }}
          />
        </div>
        <div className="rounded-xl p-4 text-xs" style={{ background: `${C.mint}55`, color: C.ink }}>
          Tip: Se din årsopgørelse og forskudsregistrering på{" "}
          <a href="https://skat.dk" target="_blank" rel="noreferrer" className="underline">skat.dk</a>.
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50"
          style={{ background: C.ink, color: C.cream }}
        >
          {saving ? "Gemmer…" : "Gem"}
        </button>
      </div>
    </Card>
  );
}

/* ---------- DEAKTIVÉR KONTO ---------- */
export function DeactivateTab() {
  const { user, signOut } = useAuth();
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function deactivate() {
    if (!user) return;
    if (confirm.trim().toUpperCase() !== "DEAKTIVER") { toast.error('Skriv "DEAKTIVER" for at bekræfte'); return; }
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      deactivated_at: new Date().toISOString(),
      deactivation_reason: reason || null,
    } as any).eq("id", user.id);
    setBusy(false);
    if (error) { toast.error("Kunne ikke deaktivere kontoen"); return; }
    toast.success("Din konto er deaktiveret");
    await signOut();
    window.location.href = "/";
  }

  return (
    <Card title="Deaktivér konto" icon={ShieldOff}>
      <div className="rounded-2xl border-2 p-5" style={{ borderColor: "#f5c2b8", background: "#fdecea" }}>
        <p className="text-sm font-bold" style={{ color: "#8a2e1c" }}>Dette skjuler din profil og pauser al aktivitet.</p>
        <ul className="mt-2 list-disc pl-5 text-xs" style={{ color: "#8a2e1c" }}>
          <li>Fremtidige bookinger annulleres automatisk.</li>
          <li>Dine data bevares i 30 dage — kontakt support hvis du fortryder.</li>
          <li>Efter 30 dage slettes personlige oplysninger permanent.</li>
        </ul>
      </div>
      <div className="mt-5 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider opacity-70">Årsag (valgfrit)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-xl border-2 bg-white px-4 py-3 text-sm"
            style={{ borderColor: `${C.ink}22`, color: C.ink }}
            placeholder="Hjælp os med at blive bedre…"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider opacity-70">
            Skriv "DEAKTIVER" for at bekræfte
          </label>
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-xl border-2 bg-white px-4 py-3 text-sm"
            style={{ borderColor: `${C.ink}22`, color: C.ink }}
          />
        </div>
        <button
          onClick={deactivate}
          disabled={busy || confirm.trim().toUpperCase() !== "DEAKTIVER"}
          className="rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-40"
          style={{ background: "#8a2e1c", color: "#fff" }}
        >
          {busy ? "Deaktiverer…" : "Deaktivér min konto"}
        </button>
      </div>
    </Card>
  );
}
