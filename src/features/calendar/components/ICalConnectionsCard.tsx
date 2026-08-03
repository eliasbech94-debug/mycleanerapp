import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarSync, Loader2, RefreshCw, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Connection = {
  id: string;
  provider_kind: string | null;
  status: string;
  last_synced_at: string | null;
  last_error_code: string | null;
  imported_events: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  active: "Forbundet",
  error: "Synkronisering fejlede",
  disconnected: "Afbrudt",
};

const ERROR_COPY: Record<string, string> = {
  invalid_or_private_ical_url: "Linket er ikke et gyldigt offentligt iCal-link (https).",
  invalid_url: "Linket er ikke et gyldigt https-link.",
  blocked_host: "Linket peger på en privat adresse og kan ikke bruges.",
  invalid_ical: "Kalenderfilen kunne ikke læses.",
  feed_too_large: "Kalenderen er for stor til at synkronisere.",
  too_many_events: "Kalenderen indeholder for mange begivenheder.",
  connection_exists: "Kalenderen er allerede forbundet.",
};

const humanize = (code?: string | null) =>
  (code && ERROR_COPY[code]) || "Kalenderen kunne ikke synkroniseres lige nu.";

/**
 * iCal (read-only) connection card. Imported events appear as neutral
 * "Optaget" blocks — no external titles or details are stored or shown.
 */
export function ICalConnectionsCard() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("provider_calendar_connections")
      .select("id,provider_kind,status,last_synced_at,last_error_code,imported_events")
      .eq("provider_user_id", user.id)
      .neq("status", "disconnected")
      .order("created_at");
    setConnections((data ?? []) as Connection[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(action: string, body: Record<string, unknown>, key: string) {
    setBusy(key);
    const { data, error } = await supabase.functions.invoke("provider-calendar-sync", {
      body: { action, ...body },
    });
    setBusy(null);
    const failure = error?.message || (data as { error?: string } | null)?.error;
    if (failure) {
      toast.error(humanize(failure));
      return false;
    }
    await load();
    return true;
  }

  return (
    <section
      aria-labelledby="ical-heading"
      className="rounded-2xl border border-border bg-card p-5"
    >
      <div className="mb-1 flex items-center gap-2">
        <CalendarSync className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="ical-heading" className="font-display text-lg text-foreground">
          Ekstern kalender (iCal)
        </h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Forbind et skrivebeskyttet iCal-link. Vi importerer kun optaget-tid — aldrig titler
        eller detaljer fra din private kalender.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor="ical-url">iCal-link</Label>
          <Input
            id="ical-url"
            type="url"
            inputMode="url"
            className="min-h-[44px]"
            placeholder="https://…/basic.ics"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <Button
          className="min-h-[44px]"
          disabled={busy !== null || url.trim().length < 8}
          onClick={async () => {
            const ok = await call("connect", { ical_url: url.trim() }, "connect");
            if (ok) {
              setUrl("");
              toast.success("Kalenderen er forbundet");
            }
          }}
        >
          {busy === "connect" && (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          Forbind
        </Button>
      </div>

      <ul className="mt-4 space-y-2">
        {loading && <li className="text-sm text-muted-foreground">Henter forbindelser…</li>}
        {!loading && connections.length === 0 && (
          <li className="text-sm text-muted-foreground">Ingen kalendere er forbundet endnu.</li>
        )}
        {connections.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {c.provider_kind === "google" ? "Google Calendar" : "Ekstern kalender"}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.status === "error"
                  ? humanize(c.last_error_code)
                  : c.last_synced_at
                    ? `Sidst synkroniseret ${new Date(c.last_synced_at).toLocaleString("da-DK")}`
                    : "Endnu ikke synkroniseret"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={c.status === "error" ? "destructive" : "secondary"}>
                {STATUS_LABEL[c.status] ?? c.status}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={busy !== null}
                onClick={async () => {
                  const ok = await call("sync", { connection_id: c.id }, `sync:${c.id}`);
                  if (ok) toast.success("Kalenderen er synkroniseret");
                }}
              >
                {busy === `sync:${c.id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                )}
                Synkronisér
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px]"
                disabled={busy !== null}
                aria-label="Afbryd forbindelsen"
                onClick={async () => {
                  const ok = await call(
                    "disconnect",
                    { connection_id: c.id },
                    `off:${c.id}`,
                  );
                  if (ok) toast.success("Forbindelsen er afbrudt");
                }}
              >
                <Unlink className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ICalConnectionsCard;
