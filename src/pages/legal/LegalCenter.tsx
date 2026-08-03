// MyCleaner Legal Center — public index of all published legal documents.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRight, Search, ScrollText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchLegalIndex, type LegalDocument } from "@/lib/legal/api";
import { LegalDocumentIcon } from "@/components/legal/LegalDocumentIcon";
import { useLegalScope } from "@/hooks/useLegalScope";
import { useDocumentHead } from "@/lib/legal/head";
import { BASE_URL } from "@/i18n/seo";

function matches(doc: LegalDocument, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [doc.title, doc.description ?? "", doc.slug].some((v) => v.toLowerCase().includes(needle));
}

export default function LegalCenter() {
  const { t, i18n } = useTranslation("legal");
  const scope = useLegalScope();
  const [query, setQuery] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["legal-index", scope.country, scope.language],
    queryFn: () => fetchLegalIndex(scope.country, scope.language),
    staleTime: 10 * 60 * 1000,
  });

  const documents = useMemo(() => (data ?? []).filter((d) => matches(d, query)), [data, query]);

  const title = t("center.metaTitle", "Legal Center — vilkår og politikker | MyCleaner");
  const description = t(
    "center.metaDescription",
    "Læs MyCleaners vilkår, privatlivspolitik, markedspladsregler og øvrige politikker samlet ét sted.",
  );
  const canonical = `${BASE_URL}/legal`;

  useDocumentHead({
    title,
    description,
    canonical,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: t("center.title", "MyCleaner Legal Center"),
      url: canonical,
      inLanguage: i18n.language,
      hasPart: (data ?? []).map((d) => ({
        "@type": "DigitalDocument",
        name: d.title,
        url: `${BASE_URL}/legal/${d.slug}`,
        version: d.version,
      })),
    },
  });

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border">
        <div className="container-wide mx-auto max-w-5xl px-4 py-16 sm:py-24">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            MyCleaner
          </div>
          <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            {t("center.title", "MyCleaner Legal Center")}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t(
              "center.subtitle",
              "Læs vores vilkår, politikker og retningslinjer. Vi tror på gennemsigtighed, fairness og tillid mellem kunder, providere og platformen.",
            )}
          </p>

          <div className="relative mt-10 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t("center.searchLabel", "Søg i juridiske dokumenter")}
              placeholder={t("center.searchPlaceholder", "Søg i dokumenter…")}
              className="h-11 pl-9"
            />
          </div>
        </div>
      </section>

      <section className="container-wide mx-auto max-w-5xl px-4 py-14">
        {isLoading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        )}

        {isError && (
          <p role="alert" className="text-sm text-muted-foreground">
            {t("center.error", "Dokumenterne kunne ikke indlæses. Prøv igen senere.")}
          </p>
        )}

        {!isLoading && !isError && documents.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("center.empty", "Ingen dokumenter matcher din søgning.")}
          </p>
        )}

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                to={`/legal/${doc.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                  <LegalDocumentIcon name={doc.icon} className="h-5 w-5" />
                </span>
                <h2 className="mt-5 font-heading text-lg font-semibold tracking-tight">{doc.title}</h2>
                {doc.description && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{doc.description}</p>
                )}
                <dl className="mt-5 space-y-1 text-xs text-muted-foreground">
                  <div className="flex gap-1">
                    <dt>{t("meta.updated", "Senest opdateret")}:</dt>
                    <dd>{new Date(doc.published_at ?? doc.created_at).toLocaleDateString(i18n.language)}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>{t("meta.version", "Version")}:</dt>
                    <dd>{doc.version}</dd>
                  </div>
                </dl>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  {t("center.read", "Læs dokument")}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
