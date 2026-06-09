import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { toast } from "sonner";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

export default function Profile() {
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [providerId, setProviderId] = useState("");
  const [address, setAddress] = useState("");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [addrValid, setAddrValid] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login?redirect=/profil");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setProviderId(profile.provider_id || "");
      setAddress(profile.address || "");
      setPlaceId(profile.address_place_id);
      setLat(profile.lat);
      setLng(profile.lng);
      setAddrValid(!!profile.address && !!profile.address_place_id);
    }
  }, [profile]);

  async function save() {
    if (!user) return;
    if (address && !addrValid) {
      toast.error("Vælg en gyldig adresse fra listen før du gemmer.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: fullName,
        phone,
        provider_id: providerId.trim() || null,
        address: address || null,
        address_place_id: placeId,
        lat,
        lng,
      });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    toast.success("Profil gemt");
  }

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center" style={{ background: C.cream }}>
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen font-editorial" style={{ background: C.cream, color: C.ink }}>
      <header className="border-b-2" style={{ background: C.ink, color: C.cream, borderColor: C.ink }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em]">
            <ArrowLeft className="h-4 w-4" /> Tilbage
          </Link>
          <div className="text-[10px] font-black uppercase tracking-[0.28em] opacity-70">Min profil</div>
          <button onClick={() => { signOut(); navigate("/"); }} className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] opacity-80 hover:opacity-100">
            <LogOut className="h-3.5 w-3.5" /> Log ud
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.ink})`, color: C.cream }}>
            <UserIcon className="h-7 w-7" />
          </div>
          <div>
            <h1 className="font-display text-3xl sm:text-4xl">{fullName || "Din profil"}</h1>
            <p className="text-sm opacity-70">{user.email}</p>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <Field label="Fulde navn">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-transparent text-base focus:outline-none"
              placeholder="Fx Mette Hansen"
            />
          </Field>

          <Field label="Telefon">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-transparent text-base focus:outline-none"
              placeholder="+45 12 34 56 78"
              type="tel"
            />
          </Field>

          <Field label="Provider-ID (kun hvis du selv er cleaner)">
            <input
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full bg-transparent text-base focus:outline-none"
              placeholder="Fx p_002"
            />
            <div className="mt-1 text-[10px] opacity-60">
              Indtast dit provider-ID for at få adgang til <Link to="/provider-dashboard" className="font-bold underline">provider-dashboardet</Link> og acceptere bookinger.
            </div>
          </Field>

          <div className="rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">Min adresse</div>
            <div className="mt-2">
              <AddressAutocomplete
                value={address}
                onChange={(v) => { setAddress(v); setAddrValid(false); }}
                onSelect={(p) => {
                  setAddress(p.address);
                  setPlaceId(p.placeId);
                  setLat(p.lat ?? null);
                  setLng(p.lng ?? null);
                  setAddrValid(true);
                }}
                onValidityChange={setAddrValid}
                isValid={addrValid}
                countries={["dk"]}
                placeholder="Vej, nr., etage, by"
              />
            </div>
            <div className="mt-2 text-[10px] opacity-60">
              Denne adresse bruges automatisk når du booker en cleaner — du kan altid vælge en anden i booking-flowet.
            </div>
          </div>

          <button
            disabled={saving}
            onClick={save}
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] shadow-[6px_6px_0_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 disabled:opacity-50"
            style={{ background: C.orange, color: C.ink }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Gem profil
          </button>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 bg-white p-4" style={{ borderColor: `${C.ink}22` }}>
      <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
