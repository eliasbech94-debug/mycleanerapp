/**
 * FAQ — fully data-driven from the `faq` section of the `common` namespace.
 * The cancellation answer receives the live policy ladder via interpolation so
 * the copy can never drift from the enforced rules.
 */
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { MessageCircle, LifeBuoy } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SupportDialog from "@/components/SupportDialog";
import { useAuth } from "@/hooks/useAuth";
import { cancellationLadderSentence } from "@/lib/cancellationPolicyCopy";

type FaqItem = { q: string; a: string };

export default function FAQ() {
  const { t } = useTranslation("common");
  const [chatOpen, setChatOpen] = useState(false);
  const { user } = useAuth();

  const raw = t("faq.items", { returnObjects: true }) as unknown;
  const items: FaqItem[] = raw && typeof raw === "object" ? Object.values(raw as Record<string, FaqItem>) : [];

  // Built per render so the cancellation copy always reflects the policy in
  // force right now (48/24 before the v2 activation instant, 18/8 from it).
  const ladder = cancellationLadderSentence();

  return (
    <>
      <main className="container-wide py-12 max-w-3xl">
        <div className="mb-8">
          <h1 className="font-heading text-4xl mb-3">{t("faq.heading")}</h1>
          <p className="text-muted-foreground">{t("faq.subheading")}</p>
        </div>

        <Accordion type="single" collapsible className="mb-10">
          {items.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {f.a?.includes("{{ladder}}") ? f.a.replace("{{ladder}}", ladder) : f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="rounded-2xl border border-border p-6 bg-secondary/30">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-primary/10 p-3">
              <LifeBuoy className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-heading text-xl mb-1">{t("faq.cta.heading")}</h2>
              <p className="text-sm text-muted-foreground mb-4">{t("faq.cta.body")}</p>
              {user ? (
                <Button onClick={() => setChatOpen(true)} className="gap-2">
                  <MessageCircle className="h-4 w-4" /> {t("faq.cta.start")}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Link to="/login">
                    <Button className="gap-2">
                      <MessageCircle className="h-4 w-4" /> {t("faq.cta.login")}
                    </Button>
                  </Link>
                  <Link to="/regler">
                    <Button variant="outline">{t("faq.cta.rules")}</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      {chatOpen && <SupportDialog mode="support" onClose={() => setChatOpen(false)} />}
    </>
  );
}
