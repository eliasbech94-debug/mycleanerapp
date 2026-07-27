import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * FAQSection — reuses the shared Radix-backed Accordion (keyboard/ARIA
 * correct out of the box). Items come from the Localization Engine, so a
 * future FAQ CMS can drop them in without touching this component. Also
 * emits FAQPage JSON-LD for SEO when items exist.
 */
export function FAQSection() {
  const { t } = useTranslation("marketplace");
  const items = t("faq.items", {
    returnObjects: true,
    defaultValue: [] as Array<{ q: string; a: string }>,
  }) as Array<{ q: string; a: string }>;

  if (!items?.length) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };

  return (
    <section className="mx-auto max-w-3xl px-5 py-14 lg:px-8" aria-labelledby="faq-title">
      <div className="text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--mkt-brand))]">
          {t("faq.eyebrow", "FAQ")}
        </p>
        <h2
          id="faq-title"
          className="mt-2 font-serif text-[28px] leading-tight tracking-[-0.02em] text-[hsl(var(--mkt-ink))] sm:text-[36px]"
        >
          {t("faq.heading", "Ofte stillede spørgsmål")}
        </h2>
      </div>
      <Accordion type="single" collapsible className="mt-8">
        {items.map((it, i) => (
          <AccordionItem
            key={i}
            value={`faq-${i}`}
            className="rounded-2xl border border-[hsl(var(--mkt-border))] bg-[hsl(var(--mkt-surface))] px-4 shadow-[var(--mkt-shadow-soft)] mb-3"
          >
            <AccordionTrigger className="text-left text-[15px] font-semibold text-[hsl(var(--mkt-ink))]">
              {it.q}
            </AccordionTrigger>
            <AccordionContent className="text-[14.5px] leading-relaxed text-[hsl(var(--mkt-ink-muted))]">
              {it.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}
