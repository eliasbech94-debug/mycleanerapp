import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, BriefcaseBusiness, Copy, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import EvidenceUploadPanel from "@/features/career/EvidenceUploadPanel";
import { careerDb } from "@/features/career/careerClient";

const db = careerDb;

type CareerProfile = {
  id: string;
  mycleaner_id: string;
  professional_headline: string | null;
  career_summary: string | null;
  visibility: "private" | "customers" | "public" | "link_only";
  searchable_by_name: boolean;
  searchable_by_id: boolean;
  share_slug: string;
  identity_verified: boolean;
  career_score: number;
  reliability_score: number;
  punctuality_score: number;
  total_completed_jobs: number;
  total_verified_hours: number;
  average_rating: number | null;
};

type WorkHistory = {
  id: string;
  company_name: string;
  role_title: string | null;
  city: string | null;
  country_code: string | null;
  started_on: string;
  ended_on: string | null;
  currently_employed: boolean;
  description: string | null;
  verification_status: "self_reported" | "pending" | "verified" | "rejected" | "expired";
};

const emptyJob = {
  company_name: "",
  role_title: "Cleaner",
  city: "",
  country_code: "DK",
  started_on: "",
  ended_on: "",
  currently_employed: false,
  description: "",
};

export default function CareerIdentity() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [jobs, setJobs] = useState<WorkHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [job, setJob] = useState(emptyJob);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: ensured, error: ensureError } = await db.rpc("ensure_cleaner_career_profile", {
      p_country_code: "DK",
    });
    if (ensureError) {
      toast.error("Karriereprofilen kunne ikke oprettes");
      setLoading(false);
      return;
    }

    const current = ensured as CareerProfile;
    setProfile(current);

    const { data: history, error } = await db
      .from("cleaner_work_history")
      .select("id,company_name,role_title,city,country_code,started_on,ended_on,currently_employed,description,verification_status")
      .eq("career_profile_id", current.id)
      .order("started_on", { ascending: false });

    if (error) toast.error("Arbejdshistorikken kunne ikke hentes");
    setJobs((history ?? []) as WorkHistory[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await db
      .from("cleaner_career_profiles")
      .update({
        professional_headline: profile.professional_headline,
        career_summary: profile.career_summary,
        visibility: profile.visibility,
        searchable_by_name: profile.searchable_by_name,
        searchable_by_id: profile.searchable_by_id,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) toast.error(error.message || "Kunne ikke gemme");
    else toast.success("Professionel profil gemt");
  };

  const addJob = async () => {
    if (!profile || !job.company_name.trim() || !job.started_on) {
      toast.error("Virksomhed og startdato skal udfyldes");
      return;
    }
    setAdding(true);
    const { error } = await db.from("cleaner_work_history").insert({
      career_profile_id: profile.id,
      company_name: job.company_name.trim(),
      role_title: job.role_title.trim() || null,
      city: job.city.trim() || null,
      country_code: job.country_code.trim().toUpperCase() || null,
      started_on: job.started_on,
      ended_on: job.currently_employed ? null : job.ended_on || null,
      currently_employed: job.currently_employed,
      description: job.description.trim() || null,
      verification_status: "self_reported",
    });
    setAdding(false);
    if (error) {
      toast.error(error.message || "Erfaringen kunne ikke tilføjes");
      return;
    }
    setJob(emptyJob);
    toast.success("Erfaring tilføjet som ikke-verificeret");
    load();
  };

  const removeJob = async (id: string) => {
    const { error } = await db.from("cleaner_work_history").delete().eq("id", id);
    if (error) toast.error("Erfaringen kunne ikke slettes");
    else setJobs((current) => current.filter((item) => item.id !== id));
  };

  const copyId = async () => {
    if (!profile) return;
    await navigator.clipboard.writeText(profile.mycleaner_id);
    toast.success("MyCleaner ID kopieret");
  };

  if (authLoading || loading) {
    return <div className="mx-auto flex min-h-[50vh] max-w-5xl items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }

  if (!profile) return null;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <p className="text-sm font-medium text-teal-700">MyCleaner Career Identity</p>
            <h1 className="font-display text-3xl">Dit professionelle rengørings-CV</h1>
          </div>
        </div>
        <Button onClick={saveProfile} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gem profil
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Career Score" value={`${profile.career_score ?? 0}/100`} />
        <Metric label="Mødestabilitet" value={`${profile.reliability_score ?? 0}%`} />
        <Metric label="Punktlighed" value={`${profile.punctuality_score ?? 0}%`} />
        <Metric label="Udførte opgaver" value={String(profile.total_completed_jobs ?? 0)} />
      </section>

      <section className="rounded-2xl border bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-teal-700" />
              <h2 className="font-display text-xl">Permanent MyCleaner ID</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">ID'et følger din verificerede identitet — ikke din e-mailadresse.</p>
          </div>
          <Button variant="outline" onClick={copyId}><Copy className="mr-2 h-4 w-4" />{profile.mycleaner_id}</Button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="font-display text-xl">Professionel præsentation</h2>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Professionel overskrift</Label>
              <Input
                value={profile.professional_headline ?? ""}
                maxLength={120}
                placeholder="Fx erfaren cleaner med speciale i kontor og flytterengøring"
                onChange={(event) => setProfile({ ...profile, professional_headline: event.target.value })}
              />
            </div>
            <div>
              <Label>Karrierebeskrivelse</Label>
              <Textarea
                rows={6}
                maxLength={2000}
                value={profile.career_summary ?? ""}
                placeholder="Fortæl kort om din erfaring, arbejdsstil og specialer."
                onChange={(event) => setProfile({ ...profile, career_summary: event.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="font-display text-xl">Synlighed og søgning</h2>
          <div className="mt-4 space-y-5">
            <div>
              <Label>Hvem kan se profilen?</Label>
              <Select value={profile.visibility} onValueChange={(value: CareerProfile["visibility"]) => setProfile({ ...profile, visibility: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Privat</SelectItem>
                  <SelectItem value="customers">Kun kunder</SelectItem>
                  <SelectItem value="public">Offentlig</SelectItem>
                  <SelectItem value="link_only">Kun personer med link</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Toggle label="Kan findes på navn" checked={profile.searchable_by_name} onChange={(checked) => setProfile({ ...profile, searchable_by_name: checked })} />
            <Toggle label="Kan findes på MyCleaner ID" checked={profile.searchable_by_id} onChange={(checked) => setProfile({ ...profile, searchable_by_id: checked })} />
            <p className="text-xs text-muted-foreground">Dokumentation og private kontrolnoter bliver aldrig vist offentligt.</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="h-5 w-5 text-teal-700" />
          <h2 className="font-display text-xl">Arbejdserfaring</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Tilføj fx ISS 2000–2004 eller Coor 2006–2012. Oplysninger vises tydeligt som selvoplyste, indtil de er verificeret.</p>

        <div className="mt-5 space-y-3">
          {jobs.length === 0 && <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Ingen erfaring tilføjet endnu.</div>}
          {jobs.map((item) => (
            <article key={item.id} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{item.company_name}</h3>
                  <VerificationBadge status={item.verification_status} />
                </div>
                <p className="text-sm text-muted-foreground">{item.role_title || "Cleaner"} · {formatPeriod(item)}</p>
                {(item.city || item.country_code) && <p className="mt-1 text-xs text-muted-foreground">{[item.city, item.country_code].filter(Boolean).join(", ")}</p>}
                {item.description && <p className="mt-2 max-w-2xl text-sm">{item.description}</p>}
              </div>
              {item.verification_status !== "verified" && (
                <Button variant="ghost" size="icon" aria-label="Slet erfaring" onClick={() => removeJob(item.id)}><Trash2 className="h-4 w-4" /></Button>
              )}
            </article>
          ))}
        </div>

        <div className="mt-6 rounded-xl bg-muted/40 p-4">
          <h3 className="font-semibold">Tilføj erfaring</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Virksomhed"><Input value={job.company_name} placeholder="ISS" onChange={(e) => setJob({ ...job, company_name: e.target.value })} /></Field>
            <Field label="Stilling"><Input value={job.role_title} onChange={(e) => setJob({ ...job, role_title: e.target.value })} /></Field>
            <Field label="By"><Input value={job.city} onChange={(e) => setJob({ ...job, city: e.target.value })} /></Field>
            <Field label="Landekode"><Input value={job.country_code} maxLength={2} onChange={(e) => setJob({ ...job, country_code: e.target.value })} /></Field>
            <Field label="Startdato"><Input type="date" value={job.started_on} onChange={(e) => setJob({ ...job, started_on: e.target.value })} /></Field>
            <Field label="Slutdato"><Input type="date" disabled={job.currently_employed} value={job.ended_on} onChange={(e) => setJob({ ...job, ended_on: e.target.value })} /></Field>
            <div className="flex items-end pb-2 sm:col-span-2"><Toggle label="Jeg arbejder her stadig" checked={job.currently_employed} onChange={(checked) => setJob({ ...job, currently_employed: checked, ended_on: checked ? "" : job.ended_on })} /></div>
            <div className="sm:col-span-2 lg:col-span-4"><Field label="Beskrivelse"><Textarea rows={3} value={job.description} onChange={(e) => setJob({ ...job, description: e.target.value })} /></Field></div>
          </div>
          <Button className="mt-4" onClick={addJob} disabled={adding}>
            {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Tilføj erfaring
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5 text-sm">
        <div className="flex gap-3">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
          <div><strong>Verifikation kommer i næste kontrolflow.</strong> Arbejdshistorik kan dokumenteres via arbejdsgiverbekræftelse, kontrakt, anbefaling eller sløret lønseddel. Selve dokumentet bliver privat og vises aldrig på profilen.</div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4"><Label>{label}</Label><Switch checked={checked} onCheckedChange={onChange} /></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label>{children}</div>;
}

function VerificationBadge({ status }: { status: WorkHistory["verification_status"] }) {
  if (status === "verified") return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"><BadgeCheck className="h-3 w-3" />Verificeret</span>;
  if (status === "pending") return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Afventer kontrol</span>;
  if (status === "rejected") return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Ikke godkendt</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Oplyst af cleaneren</span>;
}

function formatPeriod(item: WorkHistory) {
  const start = new Date(`${item.started_on}T00:00:00`).getFullYear();
  const end = item.currently_employed ? "nu" : item.ended_on ? new Date(`${item.ended_on}T00:00:00`).getFullYear() : "ukendt";
  return `${start}–${end}`;
}
