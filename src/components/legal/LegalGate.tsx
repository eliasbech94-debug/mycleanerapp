// Legal Gate — shown when required documents lack acceptance at their current
// published version. Does NOT auto-accept; user must confirm explicitly.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

type PendingDoc = {
  id: string;
  kind: string;
  version: string;
  body_hash: string;
  title: string | null;
  effective_at: string;
  language: string;
  country_code: string;
};

export function LegalGate({
  country,
  language,
  isProvider,
  onAllAccepted,
}: {
  country: string;
  language: string;
  isProvider: boolean;
  onAllAccepted?: () => void;
}) {
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [current, setCurrent] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.functions.invoke("legal-gate-status", {
        method: "GET",
        headers: {},
      });
      const params = new URLSearchParams({ country, language, is_provider: String(isProvider) });
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/legal-gate-status?${params}`,
        { headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}` } },
      );
      const j = await res.json();
      setPending(j.pending ?? []);
      void data;
    })();
  }, [country, language, isProvider]);

  if (!pending.length) return null;
  const doc = pending[current];

  async function accept() {
    if (!confirmed || !doc) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke("legal-accept", {
      body: { document_id: doc.id, document_hash: doc.body_hash, source: "legal_gate" },
    });
    setBusy(false);
    if (error) return;
    setConfirmed(false);
    if (current + 1 < pending.length) {
      setCurrent(current + 1);
    } else {
      setPending([]);
      onAllAccepted?.();
    }
  }

  return (
    <Dialog open={true} onOpenChange={() => { /* blocking */ }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{doc.title ?? doc.kind}</DialogTitle>
          <DialogDescription>
            Version {doc.version} · {doc.country_code} / {doc.language} · effective {new Date(doc.effective_at).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72 rounded-md border p-4 text-sm">
          <p className="text-muted-foreground">
            Open the full document from the legal page. This gate records your explicit acceptance of the
            immutable version identified by hash <code className="text-xs">{doc.body_hash.slice(0, 12)}…</code>.
          </p>
        </ScrollArea>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
          I have read and accept this document.
        </label>
        <div className="flex justify-end gap-2">
          <Button disabled={!confirmed || busy} onClick={accept}>
            {current + 1 < pending.length ? "Accept and continue" : "Accept"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
