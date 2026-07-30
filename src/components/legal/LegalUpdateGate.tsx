// Blocking re-acceptance modal. Shown when a required legal document has been
// republished with a new version/hash the signed-in user has not accepted.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { useLegalScope } from "@/hooks/useLegalScope";
import { acceptLegalDocument, fetchPendingRequired } from "@/lib/legal/api";
import { LegalMarkdown } from "@/components/legal/LegalMarkdown";
import { supabase } from "@/integrations/supabase/client";

export function LegalUpdateGate() {
  const { user } = useAuth();
  const scope = useLegalScope();
  const { t } = useTranslation("legal");
  const [index, setIndex] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const { data } = useQuery({
    queryKey: ["legal-pending", user?.id, scope.country, scope.language],
    queryFn: () => fetchPendingRequired(user!.id, scope.country, scope.language),
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });

  const pending = (data ?? []).filter((d) => !dismissedIds.includes(d.id));
  const doc = pending[index];
  if (!user || !doc) return null;

  async function accept() {
    if (!doc || !confirmed || !user) return;
    setBusy(true);
    try {
      await acceptLegalDocument(user.id, doc, "legal_update_gate");
      setDismissedIds((ids) => [...ids, doc.id]);
      setConfirmed(false);
      setIndex(0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        className="max-w-2xl"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("update.title", "MyCleaner har opdateret sine juridiske vilkår")}</DialogTitle>
          <DialogDescription>
            {t("update.subtitle", "{{title}} · version {{version}}", { title: doc.title, version: doc.version })}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-64 rounded-xl border border-border p-4">
          <LegalMarkdown content={doc.body_md} />
        </ScrollArea>

        <Link to={`/legal/${doc.slug}`} className="text-sm text-primary underline underline-offset-4">
          {t("update.readFull", "Læs hele dokumentet")}
        </Link>

        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} aria-describedby="legal-update-accept" />
          <span id="legal-update-accept">{t("update.confirm", "Jeg har læst og accepterer dokumentet.")}</span>
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            {t("update.logout", "Log ud")}
          </Button>
          <Button disabled={!confirmed || busy} onClick={accept}>
            {pending.length > 1 ? t("update.acceptNext", "Accepter og fortsæt") : t("update.accept", "Accepter")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
