// Schema-driven block renderer. Reads block rows straight from
// `campaign_page_blocks.content` (jsonb) and renders them with existing
// MyCleaner design tokens — no new visual language.
//
// All copy is treated as plain text (no dangerouslySetInnerHTML) to prevent
// stored XSS from a compromised campaign editor.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CampaignBlock, CampaignFullPage } from "@/lib/campaigns/api";
import { CampaignApplicationForm } from "./CampaignApplicationForm";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface Props {
  page: CampaignFullPage;
  block: CampaignBlock;
  countryIso: string | null;
  onSubmitted?: () => void;
}

function txt(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function BlockRenderer({ page, block, countryIso, onSubmitted }: Props) {
  const c = block.content ?? {};
  switch (block.block_type) {
    case "hero":
      return (
        <section className="bg-gradient-to-br from-primary/10 to-accent/5 rounded-2xl p-8 md:p-12 text-center space-y-4">
          <h1 className="font-heading text-3xl md:text-5xl text-foreground">
            {txt(c.headline, page.campaign.headline ?? page.campaign.name)}
          </h1>
          {(c.subheadline || page.campaign.subheadline) && (
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {txt(c.subheadline, page.campaign.subheadline ?? "")}
            </p>
          )}
        </section>
      );

    case "text":
    case "richtext":
      return (
        <section className="prose prose-neutral max-w-2xl mx-auto">
          <p className="text-foreground whitespace-pre-wrap">{txt(c.body)}</p>
        </section>
      );

    case "image":
      return txt(c.src) ? (
        <figure className="max-w-3xl mx-auto">
          <img
            src={txt(c.src)}
            alt={txt(c.alt, "")}
            loading="lazy"
            className="w-full rounded-xl border border-border"
          />
        </figure>
      ) : null;

    case "benefits":
      return (
        <section className="grid gap-4 md:grid-cols-3">
          {page.benefits.map((b) => (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle className="text-base">{b.title}</CardTitle>
              </CardHeader>
              {b.description && (
                <CardContent className="text-sm text-muted-foreground">{b.description}</CardContent>
              )}
            </Card>
          ))}
        </section>
      );

    case "testimonials":
      return (
        <section className="grid gap-4 md:grid-cols-2">
          {page.testimonials.map((t) => (
            <Card key={t.id}>
              <CardContent className="pt-6 space-y-2">
                <p className="text-foreground italic">&ldquo;{t.quote}&rdquo;</p>
                <p className="text-sm text-muted-foreground">
                  — {t.name}
                  {t.role ? `, ${t.role}` : ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>
      );

    case "faq":
      return (
        <section className="max-w-2xl mx-auto">
          <Accordion type="single" collapsible>
            {page.faq.map((q) => (
              <AccordionItem key={q.id} value={q.id}>
                <AccordionTrigger className="text-left">{q.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground whitespace-pre-wrap">
                  {q.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      );

    case "cta":
      return (
        <section id="apply" className="max-w-xl mx-auto">
          <CampaignApplicationForm
            campaignSlug={page.campaign.slug}
            defaultCountry={countryIso ?? "DK"}
            allowedCountries={page.countrySettings.filter((s) => s.enabled).map((s) => s.country_code)}
            onSubmitted={onSubmitted}
          />
        </section>
      );

    case "cards":
      return (
        <section className="grid gap-4 md:grid-cols-3">
          {(Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : []).map((it, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="text-base">{txt(it.title)}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{txt(it.description)}</CardContent>
            </Card>
          ))}
        </section>
      );

    case "countdown":
      return page.campaign.ends_at ? (
        <section className="text-center">
          <p className="text-sm text-muted-foreground">Ansøgningsfrist</p>
          <p className="font-heading text-xl text-foreground">
            {new Date(page.campaign.ends_at).toLocaleString()}
          </p>
        </section>
      ) : null;

    case "counter":
      return (
        <section className="text-center">
          <p className="text-4xl font-heading text-primary">{txt(c.label_value, "—")}</p>
          <p className="text-sm text-muted-foreground">{txt(c.label, "Ansøgere")}</p>
        </section>
      );

    default:
      return null;
  }
}
