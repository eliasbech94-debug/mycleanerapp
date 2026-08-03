// Blocking re-acceptance modal. Shown when a required legal document has been
// republished with a new version/hash the signed-in user has not accepted.
import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useLegalScope } from "@/hooks/useLegalScope";
import { acceptLegalDocument, fetchPendingRequired } from "@/lib/legal/api";
import { fetchChangelog } from "@/lib/legal/sections";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";

// This gate is mounted globally, so a static import would pull the whole
// markdown pipeline (react-markdown + remark/micromark, ~90 kB raw) into the
// entry chunk for every visitor. It is only rendered when a signed-in user has
// an unaccepted legal update, so load it on demand.
const LegalMarkdown = lazy(() =>
  import("@/components/legal/LegalMarkdown").then((m) => ({ default: m.LegalMarkdown })),
);


export function LegalUpdateGate() {
  const { user } = useAuth();
  const scope = useLegalScope();
  const { t } = useTranslation("legal");
  const { isProvider } = useUserRoles();
  const [index, setIndex] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const { data } = useQuery({
    queryKey: ["legal-pending", user?.id, scope.country, scope.language, isProvider],
    queryFn: async () => {
      const docs = await fetchPendingRequired(user!.id, scope.country, scope.language);
      // Provider-only documents must not block customers.
      return docs.filter((d) => d.kind !== "provider_agreement" || isProvider);
    },
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

        <LegalUpdateChangelog documentId={doc.id} />

        <ScrollArea className="h-64 rounded-xl border border-border p-4">
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <LegalMarkdown content={doc.body_md} />
          </Suspense>
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

/** Shows the "what changed" summary from the published changelog, if any. */
function LegalUpdateChangelog({ documentId }: { documentId: string }) {
  const { t } = useTranslation("legal");
  const { data } = useQuery({
    queryKey: ["legal-changelog", documentId],
    queryFn: () => fetchChangelog(documentId),
    staleTime: 10 * 60 * 1000,
  });
  const latest = data?.[0];
  if (!latest) return null;

  return (
    <section className="rounded-xl border border-border bg-muted/40 p-4">
      <h3 className="text-sm font-semibold">{t("update.whatChanged", "Hvad er ændret")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{latest.summary}</p>
      {latest.entries.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {latest.entries.slice(0, 6).map((c, i) => (
            <li key={i}>
              {c.kind === "added"
                ? t("update.changeAdded", "Nyt afsnit")
                : c.kind === "removed"
                  ? t("update.changeRemoved", "Fjernet afsnit")
                  : t("update.changeModified", "Ændret afsnit")}
              : {c.title}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
