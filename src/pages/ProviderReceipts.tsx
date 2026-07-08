import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Upload, FileText, Trash2, Sparkles, Receipt as ReceiptIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import BackButton from "@/components/BackButton";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

type Receipt = {
  id: string;
  user_id: string;
  booking_id: string | null;
  category: "booking" | "general";
  vendor: string | null;
  receipt_date: string | null;
  amount_cents: number | null;
  vat_cents: number | null;
  currency: string | null;
  quarter: number | null;
  year: number | null;
  file_path: string;
  mime: string | null;
  scan_status: "pending" | "scanning" | "scanned" | "failed";
  notes: string | null;
  created_at: string;
};

type BookingLite = { id: string; booking_date: string | null; service: string | null };

function fmtMoney(cents: number | null, ccy: string | null) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("da-DK", { style: "currency", currency: ccy || "DKK" }).format(cents / 100);
}

export default function ProviderReceipts() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Receipt[]>([]);
  const [bookings, setBookings] = useState<BookingLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("provider_receipts")
      .select("*")
      .order("receipt_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    setRows((data as Receipt[]) || []);
    const { data: prof } = await supabase.from("profiles").select("provider_id").eq("id", user.id).maybeSingle();
    const pid = (prof as any)?.provider_id;
    if (pid) {
      const { data: bks } = await supabase
        .from("bookings")
        .select("id, booking_date, service")
        .eq("provider_id", pid)
        .order("booking_date", { ascending: false })
        .limit(50);
      setBookings((bks as any) || []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  async function onUpload(files: FileList | null) {
    if (!user || !files || !files.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("receipts").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (upErr) { toast.error(`Upload fejlede: ${upErr.message}`); continue; }
        const { data: ins, error: insErr } = await supabase
          .from("provider_receipts")
          .insert({ user_id: user.id, file_path: path, mime: file.type, scan_status: "pending", category: "general" })
          .select("id")
          .single();
        if (insErr || !ins) { toast.error("Kunne ikke registrere bilag"); continue; }
        toast.success(`${file.name} uploadet — starter AI-scan`);
        scan(ins.id);
      }
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function scan(id: string) {
    setScanningId(id);
    const { data, error } = await supabase.functions.invoke("scan-receipt", { body: { receipt_id: id } });
    setScanningId(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || "AI-scan fejlede");
    } else {
      toast.success("Kvittering scannet");
    }
    load();
  }

  async function del(r: Receipt) {
    if (!confirm("Slet dette bilag?")) return;
    await supabase.storage.from("receipts").remove([r.file_path]);
    await supabase.from("provider_receipts").delete().eq("id", r.id);
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    toast.success("Slettet");
  }

  async function assign(r: Receipt, patch: Partial<Receipt>) {
    const { error } = await supabase.from("provider_receipts").update(patch).eq("id", r.id);
    if (error) { toast.error("Kunne ikke gemme"); return; }
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...patch } as Receipt : x)));
  }

  async function openFile(r: Receipt) {
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(r.file_path, 300);
    if (error || !data) { toast.error("Kunne ikke åbne fil"); return; }
    window.open(data.signedUrl, "_blank");
  }

  const grouped = useMemo(() => {
    const g: Record<string, Receipt[]> = {};
    for (const r of rows) {
      const key = r.year && r.quarter ? `${r.year} • Q${r.quarter}` : "Ikke tildelt periode";
      (g[key] ||= []).push(r);
    }
    return g;
  }, [rows]);

  const totals = useMemo(() => {
    const t: Record<string, { amount: number; vat: number; ccy: string }> = {};
    for (const r of rows) {
      const key = r.year && r.quarter ? `${r.year}-Q${r.quarter}` : "other";
      t[key] ||= { amount: 0, vat: 0, ccy: r.currency || "DKK" };
      t[key].amount += r.amount_cents || 0;
      t[key].vat += r.vat_cents || 0;
    }
    return t;
  }, [rows]);

  if (!user) return <div className="mx-auto max-w-3xl px-6 py-16"><p>Log ind for at se dine bilag.</p></div>;

  return (
    <div style={{ background: C.cream, minHeight: "100vh" }}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <BackButton />
        <header className="mt-4 mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${C.teal}22`, color: C.teal }}>
              <ReceiptIcon className="h-6 w-6" />
            </span>
            <h1 className="font-display text-4xl sm:text-5xl" style={{ color: C.ink }}>Bilag & udgifter</h1>
          </div>
          <p className="text-sm opacity-75" style={{ color: C.ink }}>
            Upload kvitteringer, lad AI læse beløb, moms og dato, og tilknyt dem til en opgave eller til generelle udgifter. Gemmes automatisk i kvartalsmappe.
          </p>
        </header>

        {/* Upload */}
        <label
          className="mb-8 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed p-10 text-center transition hover:opacity-80"
          style={{ borderColor: C.teal, background: "#fff", color: C.ink }}
        >
          <Upload className="h-8 w-8" style={{ color: C.orange }} />
          <div className="font-display text-xl">{uploading ? "Uploader…" : "Upload kvitteringer"}</div>
          <div className="text-xs opacity-70">JPG, PNG, HEIC eller PDF · flere filer ad gangen</div>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={(e) => onUpload(e.target.files)}
          />
        </label>

        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border-2 bg-white p-10 text-center" style={{ borderColor: `${C.ink}1a` }}>
            <p className="opacity-70">Ingen bilag endnu — upload din første kvittering ovenfor.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([period, list]) => {
            const key = list[0]?.year && list[0]?.quarter ? `${list[0].year}-Q${list[0].quarter}` : "other";
            const t = totals[key];
            return (
              <section key={period} className="mb-8">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-display text-2xl" style={{ color: C.ink }}>{period}</h2>
                  {t && (
                    <div className="text-xs uppercase tracking-wider opacity-70">
                      {list.length} bilag · Total {fmtMoney(t.amount, t.ccy)} · Moms {fmtMoney(t.vat, t.ccy)}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {list.map((r) => (
                    <article
                      key={r.id}
                      className="rounded-2xl border-2 bg-white p-4 sm:p-5"
                      style={{ borderColor: `${C.ink}1a` }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 opacity-60" />
                            <button
                              onClick={() => openFile(r)}
                              className="truncate text-sm font-bold hover:underline"
                              style={{ color: C.ink }}
                            >
                              {r.vendor || r.file_path.split("/").pop()}
                            </button>
                            <StatusBadge status={r.scan_status} />
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-70">
                            <span>{r.receipt_date || "Dato mangler"}</span>
                            <span>Beløb: {fmtMoney(r.amount_cents, r.currency)}</span>
                            <span>Moms: {fmtMoney(r.vat_cents, r.currency)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.scan_status !== "scanned" && (
                            <button
                              onClick={() => scan(r.id)}
                              disabled={scanningId === r.id}
                              className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                              style={{ background: C.orange, color: "#fff" }}
                            >
                              {scanningId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                              {scanningId === r.id ? "Scanner…" : "AI-scan"}
                            </button>
                          )}
                          <button onClick={() => del(r)} className="rounded-lg p-2 hover:bg-black/5" aria-label="Slet">
                            <Trash2 className="h-4 w-4" style={{ color: "#8a2e1c" }} />
                          </button>
                        </div>
                      </div>

                      {/* Assignment */}
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider opacity-70">Tilknyt til</label>
                          <div className="flex gap-2">
                            {(["general", "booking"] as const).map((c) => (
                              <button
                                key={c}
                                onClick={() => assign(r, { category: c, booking_id: c === "general" ? null : r.booking_id })}
                                className="flex-1 rounded-lg border-2 px-3 py-2 text-xs font-bold"
                                style={{
                                  borderColor: r.category === c ? C.teal : `${C.ink}22`,
                                  background: r.category === c ? `${C.teal}18` : "#fff",
                                  color: C.ink,
                                }}
                              >
                                {c === "general" ? "Generel udgift" : "Bestemt opgave"}
                              </button>
                            ))}
                          </div>
                        </div>
                        {r.category === "booking" && (
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider opacity-70">Opgave</label>
                            <select
                              value={r.booking_id || ""}
                              onChange={(e) => assign(r, { booking_id: e.target.value || null })}
                              className="w-full rounded-lg border-2 bg-white px-3 py-2 text-xs"
                              style={{ borderColor: `${C.ink}22`, color: C.ink }}
                            >
                              <option value="">Vælg opgave…</option>
                              {bookings.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.scheduled_date ? new Date(b.scheduled_date).toLocaleDateString("da-DK") : "?"} · {b.service_type || "opgave"}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })
        )}

        <div className="mt-8 rounded-2xl p-4 text-xs" style={{ background: `${C.mint}55`, color: C.ink }}>
          Tip: Se dit samlede regnskab i <Link to="/provider-dashboard" className="underline font-bold">provider-dashboardet</Link>. Bilag her tælles med i kvartalsudgifter.
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Receipt["scan_status"] }) {
  const map: Record<Receipt["scan_status"], { label: string; bg: string; fg: string }> = {
    pending: { label: "Ikke scannet", bg: "#f5f0e0", fg: "#7a6a3a" },
    scanning: { label: "Scanner…", bg: "#fff2cc", fg: "#7a5a00" },
    scanned: { label: "Scannet", bg: "#c8e6c0", fg: "#1e5a2e" },
    failed: { label: "Fejlede", bg: "#fdecea", fg: "#8a2e1c" },
  };
  const s = map[status];
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}
