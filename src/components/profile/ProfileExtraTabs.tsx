import { useEffect, useMemo, useState } from "react";
import { Bell, Loader2, MessageSquare, PiggyBank, Receipt, ShieldOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DK_MUNICIPALITIES, validateCPR, validateCVR, encodeTaxId, maskTaxId } from "@/lib/tax";

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
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [step, setStep] = useState<"idle" | "sent">("idle");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const normalized = phone.replace(/[\s\-()]/g, "");
  const isVerified = !!verifiedPhone && !!verifiedAt && normalized && (normalized === verifiedPhone || `+${normalized}` === verifiedPhone);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("sms_phone, sms_verified_at, notification_prefs, phone").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        const d: any = data || {};
        setPhone(d.sms_phone || d.phone || "");
        setVerifiedPhone(d.sms_phone || null);
        setVerifiedAt(d.sms_verified_at || null);
        setEnabled(!!d.notification_prefs?.sms);
        setLoading(false);
      });
  }, [user]);

  async function sendCode() {
    if (!/^\+?[0-9\s\-()]{7,}$/.test(phone)) { toast.error("Ugyldigt telefonnummer"); return; }
    setSending(true);
    const { data, error } = await supabase.functions.invoke("sms-send-code", { body: { phone } });
    setSending(false);
    if (error || (data as any)?.error) { toast.error((data as any)?.error || "Kunne ikke sende kode"); return; }
    setStep("sent");
    setDevCode((data as any)?.dev_code ?? null);
    toast.success("Kode sendt");
  }

  async function verifyCode() {
    setVerifying(true);
    const { data, error } = await supabase.functions.invoke("sms-verify-code", { body: { phone, code } });
    setVerifying(false);
    if (error || (data as any)?.error) { toast.error((data as any)?.error || "Verifikation fejlede"); return; }
    setVerifiedPhone((data as any).phone);
    setVerifiedAt((data as any).verified_at);
    setStep("idle");
    setCode("");
    setDevCode(null);
    toast.success("Telefonnummer verificeret");
  }

  async function savePrefs() {
    if (!user) return;
    if (enabled && !isVerified) { toast.error("Verificér telefonnummeret først"); return; }
    setSaving(true);
    const { data: current } = await supabase.from("profiles").select("notification_prefs").eq("id", user.id).maybeSingle();
    const prefs = { ...DEFAULT_PREFS, ...((current as any)?.notification_prefs || {}), sms: enabled };
    const { error } = await supabase.from("profiles").update({ notification_prefs: prefs } as any).eq("id", user.id);
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
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider opacity-70">Telefonnummer</label>
          <div className="flex gap-2">
            <input
              type="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setStep("idle"); }}
              placeholder="+45 12 34 56 78"
              className="w-full rounded-xl border-2 bg-white px-4 py-3 text-sm"
              style={{ borderColor: `${C.ink}22`, color: C.ink }}
            />
            {isVerified ? (
              <span
                className="grid shrink-0 place-items-center rounded-xl px-4 text-xs font-bold uppercase tracking-wider"
                style={{ background: `${C.mint}`, color: C.ink }}
              >
                Verificeret
              </span>
            ) : (
              <button
                onClick={sendCode}
                disabled={sending || !phone}
                className="shrink-0 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                style={{ background: C.orange, color: "#fff" }}
              >
                {sending ? "Sender…" : step === "sent" ? "Send igen" : "Send kode"}
              </button>
            )}
          </div>
          {verifiedAt && isVerified && (
            <p className="mt-1 text-xs opacity-70">Verificeret {new Date(verifiedAt).toLocaleDateString("da-DK")}</p>
          )}
        </div>

        {step === "sent" && !isVerified && (
          <div className="rounded-2xl border-2 p-4" style={{ borderColor: `${C.teal}55`, background: `${C.teal}0f` }}>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider opacity-70">Indtast 6-cifret kode</label>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="w-full rounded-xl border-2 bg-white px-4 py-3 text-lg tracking-widest"
                style={{ borderColor: `${C.ink}22`, color: C.ink }}
              />
              <button
                onClick={verifyCode}
                disabled={verifying || code.length !== 6}
                className="shrink-0 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                style={{ background: C.ink, color: C.cream }}
              >
                {verifying ? "Tjekker…" : "Bekræft"}
              </button>
            </div>
            <p className="mt-2 text-xs opacity-70">Koden udløber om 10 minutter.</p>
            {devCode && (
              <p className="mt-2 text-xs" style={{ color: C.orange }}>
                Udvikling: kode = <strong>{devCode}</strong> (SMS-udbyder endnu ikke tilsluttet)
              </p>
            )}
          </div>
        )}

        <Toggle
          label="Aktivér SMS"
          hint={isVerified ? "Kun kritiske beskeder — aldrig marketing." : "Verificér dit nummer for at kunne aktivere."}
          value={enabled}
          onChange={(v) => {
            if (v && !isVerified) { toast.error("Verificér telefonnummeret først"); return; }
            setEnabled(v);
          }}
          disabled={saving || !isVerified}
        />

        <button
          onClick={savePrefs}
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
  const [deleting, setDeleting] = useState(false);
  const [storedEncoded, setStoredEncoded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasStored = !!storedEncoded;

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("tax_id_encrypted, tax_municipality, tax_type")
      .eq("id", user.id)
      .maybeSingle();
    const d: any = data || {};
    setStoredEncoded(d.tax_id_encrypted ?? null);
    setMunicipality(d.tax_municipality || "");
    setType((d.tax_type as "private" | "business") || "private");
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  // Reset input when type changes so a CPR isn't validated as CVR
  useEffect(() => { setTaxId(""); setError(null); }, [type]);

  async function save() {
    if (!user) return;
    setError(null);

    // Municipality required + must match known list
    if (!municipality) { setError("Vælg din skattekommune"); return; }
    if (!DK_MUNICIPALITIES.includes(municipality)) {
      setError("Ukendt kommune — vælg fra listen"); return;
    }

    // Only validate/encode taxId if user typed one (or nothing stored yet)
    let encoded: string | undefined;
    if (taxId.trim() || !hasStored) {
      if (!taxId.trim()) { setError(type === "private" ? "Indtast CPR-nummer" : "Indtast CVR-nummer"); return; }
      const v = type === "private" ? validateCPR(taxId) : validateCVR(taxId);
      if (!v.ok || !v.normalized) { setError(v.error || "Ugyldigt nummer"); return; }
      encoded = encodeTaxId(v.normalized);
    }

    setSaving(true);
    const patch: any = { tax_municipality: municipality, tax_type: type };
    if (encoded) patch.tax_id_encrypted = encoded;
    const { error: err } = await supabase.from("profiles").update(patch).eq("id", user.id);
    setSaving(false);
    if (err) { toast.error("Kunne ikke gemme skatteoplysninger"); return; }
    toast.success("Skatteoplysninger gemt");
    setTaxId("");
    if (encoded) setStoredEncoded(encoded);
  }

  async function remove() {
    if (!user) return;
    if (!window.confirm("Slet dine skatteoplysninger permanent?")) return;
    setDeleting(true);
    const { error: err } = await supabase.from("profiles").update({
      tax_id_encrypted: null,
      tax_municipality: null,
      tax_type: null,
    } as any).eq("id", user.id);
    setDeleting(false);
    if (err) { toast.error("Kunne ikke slette"); return; }
    toast.success("Skatteoplysninger slettet");
    setStoredEncoded(null);
    setMunicipality("");
    setType("private");
    setTaxId("");
  }

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const stored = hasStored ? maskTaxId(type, storedEncoded) : "";

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
                type="button"
                onClick={() => setType(t)}
                aria-pressed={type === t}
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
          <label htmlFor="tax-id" className="mb-1 block text-xs font-bold uppercase tracking-wider opacity-70">
            {type === "private" ? "CPR-nummer" : "CVR-nummer"}
            {hasStored && <span className="ml-2 rounded-full px-2 py-0.5 text-[10px]" style={{ background: `${C.mint}88`, color: C.ink }}>Gemt: {stored}</span>}
          </label>
          <input
            id="tax-id"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={taxId}
            onChange={(e) => { setTaxId(e.target.value); setError(null); }}
            placeholder={hasStored ? "Udfyld for at ændre" : type === "private" ? "010190-1234" : "12345678"}
            maxLength={type === "private" ? 11 : 8}
            className="w-full rounded-xl border-2 bg-white px-4 py-3 text-sm"
            style={{ borderColor: `${C.ink}22`, color: C.ink }}
          />
        </div>

        <div>
          <label htmlFor="tax-muni" className="mb-1 block text-xs font-bold uppercase tracking-wider opacity-70">Skattekommune</label>
          <input
            id="tax-muni"
            list="dk-municipalities"
            type="text"
            value={municipality}
            onChange={(e) => { setMunicipality(e.target.value); setError(null); }}
            placeholder="fx København"
            className="w-full rounded-xl border-2 bg-white px-4 py-3 text-sm"
            style={{ borderColor: `${C.ink}22`, color: C.ink }}
          />
          <datalist id="dk-municipalities">
            {DK_MUNICIPALITIES.map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border-2 px-4 py-3 text-sm" style={{ borderColor: `${C.orange}55`, background: `${C.orange}12`, color: C.ink }}>
            {error}
          </div>
        )}

        <div className="rounded-xl p-4 text-xs" style={{ background: `${C.mint}55`, color: C.ink }}>
          Tip: Se din årsopgørelse og forskudsregistrering på{" "}
          <a href="https://skat.dk" target="_blank" rel="noreferrer" className="underline">skat.dk</a>.
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50"
            style={{ background: C.ink, color: C.cream }}
          >
            {saving ? "Gemmer…" : hasStored ? "Opdatér" : "Gem"}
          </button>
          {hasStored && (
            <button
              onClick={remove}
              disabled={deleting}
              className="rounded-xl border-2 px-5 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-50"
              style={{ borderColor: `${C.orange}66`, color: C.orange, background: "#fff" }}
            >
              {deleting ? "Sletter…" : "Slet"}
            </button>
          )}
        </div>
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

/* ---------- SERVICEFRADRAG (kunder) ---------- */
// Vejledende tal for 2026 — brugeren skal altid tjekke skat.dk for aktuelle satser.
const SERVICE_LIMIT_DKK = 12200; // maks fradragsberettiget servicearbejde pr. person pr. år
const SERVICE_VALUE_PCT = 0.26;  // skatteværdi ~ ca. 26%
const DEDUCTIBLE_SERVICES = ["rengøring", "cleaning", "havearbejde", "garden", "vinduespudsning", "window"];

export function ServiceDeductionTab() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (!user) return;
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    supabase
      .from("bookings")
      .select("id, service, booking_date, customer_pays, currency, payment_status, status")
      .eq("customer_user_id", user.id)
      .gte("booking_date", from)
      .lte("booking_date", to)
      .then(({ data }) => {
        setRows((data as any[]) || []);
        setLoading(false);
      });
  }, [user, year]);

  const stats = useMemo(() => {
    let total = 0, deductible = 0, ccy = "DKK";
    const list: any[] = [];
    for (const b of rows) {
      const paid = ["captured", "partially_refunded"].includes(b.payment_status) || b.status === "completed";
      if (!paid) continue;
      const svc = (b.service || "").toLowerCase();
      const isDeductible = DEDUCTIBLE_SERVICES.some((s) => svc.includes(s));
      const amount = Number(b.customer_pays) || 0;
      total += amount;
      ccy = b.currency || ccy;
      if (isDeductible) { deductible += amount; list.push(b); }
    }
    const eligible = Math.min(deductible, SERVICE_LIMIT_DKK);
    const estValue = Math.round(eligible * SERVICE_VALUE_PCT);
    return { total, deductible, eligible, estValue, ccy, remaining: Math.max(0, SERVICE_LIMIT_DKK - deductible), list };
  }, [rows]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("da-DK", { style: "currency", currency: stats.ccy, maximumFractionDigits: 0 }).format(n);

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const pct = Math.min(100, (stats.deductible / SERVICE_LIMIT_DKK) * 100);

  return (
    <Card title={`Servicefradrag ${year}`} icon={PiggyBank}>
      <p className="mb-5 text-sm opacity-75">
        Danske skatteydere kan trække udgifter til bestemte typer servicearbejde i hjemmet fra i skat.
        Her ser du hvad du har brugt gennem HomeHero i år — og hvad du kan indberette.
      </p>

      {/* Summary numbers */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Brugt i alt" value={fmt(stats.total)} tone="ink" />
        <Metric label="Fradragsberettiget" value={fmt(stats.deductible)} tone="teal" />
        <Metric label="Ca. værdi i skat" value={fmt(stats.estValue)} tone="orange" />
      </div>

      {/* Progress toward limit */}
      <div className="mb-6 rounded-2xl border-2 p-4" style={{ borderColor: `${C.ink}1a` }}>
        <div className="mb-2 flex items-baseline justify-between text-xs">
          <span className="font-bold uppercase tracking-wider opacity-70">Årets loft</span>
          <span className="opacity-70">{fmt(stats.deductible)} / {fmt(SERVICE_LIMIT_DKK)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: `${C.ink}14` }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: C.teal }} />
        </div>
        <div className="mt-2 text-xs opacity-70">
          {stats.remaining > 0
            ? `Du har endnu ${fmt(stats.remaining)} tilbage af årets fradragsloft.`
            : `Du har nået årets loft — beløb ud over ${fmt(SERVICE_LIMIT_DKK)} kan ikke fradrages.`}
        </div>
      </div>

      {/* Step-by-step guide */}
      <div className="rounded-2xl border-2 p-5" style={{ borderColor: `${C.teal}55`, background: `${C.teal}0f` }}>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: C.orange }} />
          <h3 className="font-display text-lg">Sådan indberetter du fradraget</h3>
        </div>
        <ol className="ml-5 list-decimal space-y-2 text-sm">
          <li>Log ind på <a href="https://skat.dk" target="_blank" rel="noreferrer" className="underline font-bold">skat.dk</a> med MitID.</li>
          <li>Gå til <em>Årsopgørelsen</em> → <em>Ret årsopgørelsen</em> → rubrik <strong>458 (Servicefradrag)</strong>.</li>
          <li>Indtast det samlede beløb du har betalt for godkendte serviceydelser (arbejdsløn, ikke materialer).</li>
          <li>Angiv HomeHero / providerens CVR som modtager. Gem dine kvitteringer i 5 år.</li>
          <li>Fradraget beregnes automatisk og reducerer din restskat (eller øger overskydende skat).</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="https://skat.dk/borger/fradrag/servicefradrag"
            target="_blank" rel="noreferrer"
            className="rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider"
            style={{ background: C.ink, color: C.cream }}
          >
            Åbn skat.dk vejledning
          </a>
          <a
            href="/faq"
            className="rounded-xl border-2 px-4 py-2 text-xs font-bold uppercase tracking-wider"
            style={{ borderColor: C.ink, color: C.ink }}
          >
            Se ofte stillede spørgsmål
          </a>
        </div>
      </div>

      {/* Detail list */}
      {stats.list.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider opacity-70">Fradragsberettigede bookinger i {year}</h4>
          <ul className="divide-y rounded-2xl border-2" style={{ borderColor: `${C.ink}1a` }}>
            {stats.list.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  {new Date(b.booking_date).toLocaleDateString("da-DK")} · <span className="opacity-70">{b.service}</span>
                </span>
                <span className="font-bold">{fmt(Number(b.customer_pays))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 text-[11px] opacity-60">
        Beløb er vejledende. Sats for 2026 antaget til {SERVICE_LIMIT_DKK.toLocaleString("da-DK")} kr. og en skatteværdi på ca. {Math.round(SERVICE_VALUE_PCT * 100)} %.
        Tjek altid <a href="https://skat.dk" target="_blank" rel="noreferrer" className="underline">skat.dk</a> for de aktuelle regler.
      </p>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "ink" | "teal" | "orange" }) {
  const bg = tone === "ink" ? C.ink : tone === "teal" ? C.teal : C.orange;
  return (
    <div className="rounded-2xl p-4 text-white" style={{ background: bg }}>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 font-display text-2xl">{value}</div>
    </div>
  );
}
