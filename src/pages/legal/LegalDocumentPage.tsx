// Single legal document reader: sticky TOC, metadata, print/share actions.
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronRight, Clock, Download, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { fetchLegalDocument } from "@/lib/legal/api";
import { extractHeadings, readingTimeMinutes } from "@/lib/legal/markdown";
import { LegalMarkdown } from "@/components/legal/LegalMarkdown";
import { LegalTableOfContents } from "@/components/legal/LegalTableOfContents";
import { LegalDocumentIcon } from "@/components/legal/LegalDocumentIcon";
import { useLegalScope } from "@/hooks/useLegalScope";
import { useDocumentHead } from "@/lib/legal/head";
import { BASE_URL } from "@/i18n/seo";

export default function LegalDocumentPage() {
  const { slug = "" } = useParams();
  const { t, i18n } = useTranslation("legal");
  const scope = useLegalScope();

  const { data: doc, isLoading, isError } = useQuery({
    queryKey: ["legal-document", slug, scope.country, scope.language],
    queryFn: () => fetchLegalDocument(slug, scope.country, scope.language),
    enabled: Boolean(slug),
    staleTime: 10 * 60 * 1000,
  });

  const headings = useMemo(() => extractHeadings(doc?.body_md ?? ""), [doc?.body_md]);
  const minutes = useMemo(() => readingTimeMinutes(doc?.body_md ?? ""), [doc?.body_md]);
  const canonical = `${BASE_URL}/legal/${slug}`;

  useDocumentHead({
    title: doc ? `${doc.title} | MyCleaner` : t("document.metaFallbackTitle", "Juridisk dokument | MyCleaner"),
    description:
      doc?.description ??
      t("document.metaFallbackDescription", "Officielt juridisk dokument fra MyCleaner."),
    canonical,
    jsonLd: doc
      ? [
          {
            "@context": "https://schema.org",
            "@type": "DigitalDocument",
            name: doc.title,
            description: doc.description ?? undefined,
            url: canonical,
            version: doc.version,
            inLanguage: doc.language,
            dateModified: doc.published_at ?? doc.created_at,
            publisher: { "@type": "Organization", name: "MyCleaner" },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "MyCleaner", item: BASE_URL },
              { "@type": "ListItem", position: 2, name: t("center.title", "MyCleaner Legal Center"), item: `${BASE_URL}/legal` },
              { "@type": "ListItem", position: 3, name: doc.title, item: canonical },
            ],
          },
        ]
      : undefined,
  });

  async function share() {
    const url = window.location.href;
    const shareData = { title: doc?.title ?? "MyCleaner", url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t("document.linkCopied", "Link kopieret") });
    } catch {
      toast({ title: t("document.linkCopyFailed", "Kunne ikke kopiere linket"), variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <main className="container-wide mx-auto max-w-5xl px-4 py-16">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-6 h-64 w-full" />
      </main>
    );
  }

  if (isError || !doc) {
    return (
      <main className="container-wide mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="font-heading text-3xl font-semibold">{t("document.notFoundTitle", "Dokumentet findes ikke")}</h1>
        <p className="mt-4 text-muted-foreground">
          {t("document.notFoundBody", "Dokumentet er enten ikke offentliggjort endnu eller findes ikke i dit land.")}
        </p>
        <Button asChild className="mt-8">
          <Link to="/legal">{t("document.backToCenter", "Tilbage til Legal Center")}</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="bg-background">
      <div className="container-wide mx-auto max-w-6xl px-4 py-10 lg:py-16">
        <nav aria-label={t("document.breadcrumb", "Brødkrumme")} className="mb-8 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link to="/legal" className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("center.title", "MyCleaner Legal Center")}
          </Link>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span aria-current="page" className="text-foreground">{doc.title}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,900px)]">
          <LegalTableOfContents headings={headings} className="lg:order-1 print:hidden" />

          <article className="lg:order-2">
            <header className="border-b border-border pb-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
                <LegalDocumentIcon name={doc.icon} className="h-5 w-5" />
              </span>
              <h1 className="mt-5 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{doc.title}</h1>
              {doc.description && <p className="mt-3 text-muted-foreground">{doc.description}</p>}

              <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
                <div className="flex gap-1.5">
                  <dt>{t("meta.version", "Version")}:</dt>
                  <dd className="text-foreground">{doc.version}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>{t("meta.updated", "Senest opdateret")}:</dt>
                  <dd className="text-foreground">{new Date(doc.published_at ?? doc.created_at).toLocaleDateString(i18n.language)}</dd>
                </div>
                {doc.effective_at && (
                  <div className="flex gap-1.5">
                    <dt>{t("meta.effective", "Ikrafttrædelsesdato")}:</dt>
                    <dd className="text-foreground">{new Date(doc.effective_at).toLocaleDateString(i18n.language)}</dd>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  <dt className="sr-only">{t("meta.readingTime", "Læsetid")}</dt>
                  <dd>{t("meta.readingTimeValue", "{{count}} min. læsetid", { count: minutes })}</dd>
                </div>
                {doc.doc_uid && (
                  <div className="flex gap-1.5">
                    <dt>{t("meta.documentId", "Dokument-ID")}:</dt>
                    <dd className="font-mono text-foreground">{doc.doc_uid}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-6 flex flex-wrap gap-2 print:hidden">
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("document.print", "Print")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => printAsPdf(exportMeta, doc.body_md)}>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("document.pdf", "Download PDF")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadHtml(exportMeta, doc.body_md, doc.slug)}>
                  <FileCode className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("document.html", "Download HTML")}
                </Button>
                <Button variant="outline" size="sm" onClick={share}>
                  <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("document.share", "Del dokument")}
                </Button>
              </div>

            </header>

            <LegalMarkdown content={doc.body_md} className="pt-2" />
          </article>
        </div>
      </div>
    </main>
  );
}
