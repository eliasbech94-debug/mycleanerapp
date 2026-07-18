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
import SupportDialog from "@/components/SupportDialog";
import { useAuth } from "@/hooks/useAuth";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Hvordan booker jeg en provider?",
    a: "Vælg en service, find en provider du kan lide, og book en ledig tid direkte i providerens kalender. Du betaler først, når opgaven er bekræftet.",
  },
  {
    q: "Hvornår trækkes betalingen?",
    a: "Betalingen reserveres når du booker, og hæves først når providerens opgave er markeret som fuldført.",
  },
  {
    q: "Hvad koster platformen?",
    a: "MyCleaner tager 28% i platformgebyr — delt ligeligt mellem kunde og provider (14% oveni for kunden, 14% trukket fra provideren).",
  },
  {
    q: "Kan jeg få servicefradrag?",
    a: "Ja, for rengøring, havearbejde og visse handyman-opgaver i private hjem. Du finder din årlige oversigt på Min profil → Servicefradrag.",
  },
  {
    q: "Hvordan afbestiller jeg en booking?",
    a: "Gå til Mine bookinger, vælg opgaven og tryk Afbestil. Regler for gebyr afhænger af hvornår du afbestiller — se Regler.",
  },
  {
    q: "Hvordan bliver jeg provider?",
    a: "Klik på 'Bliv provider' i menuen, gennemfør registrering og verificér din Stripe-konto. Så er du klar til at modtage bookinger.",
  },
  {
    q: "Hvordan får jeg refusion?",
    a: "Åbn en klage via supportchat. En medarbejder vurderer sagen og refunderer via Stripe hvis den godkendes.",
  },
  {
    q: "Er mine oplysninger sikre?",
    a: "Ja. Vi bruger krypteret datalager, autoriserede betalinger via Stripe og deler aldrig dine oplysninger uden dit samtykke.",
  },
];

export default function FAQ() {
  const [chatOpen, setChatOpen] = useState(false);
  const { user } = useAuth();

  return (
    <>
      <main className="container-wide py-12 max-w-3xl">
        <div className="mb-8">
          <h1 className="font-heading text-4xl mb-3">Ofte stillede spørgsmål</h1>
          <p className="text-muted-foreground">
            Find svar med det samme — eller start en chat med vores support-AI hvis dit spørgsmål ikke er dækket.
          </p>
        </div>

        <Accordion type="single" collapsible className="mb-10">
          {FAQS.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="rounded-2xl border border-border p-6 bg-secondary/30">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-primary/10 p-3">
              <LifeBuoy className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-heading text-xl mb-1">Fandt du ikke svar?</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Åbn FAQ-chatten og få hjælp fra vores AI. Bliver sagen kompleks, sender vi den videre til et menneske.
              </p>
              {user ? (
                <Button onClick={() => setChatOpen(true)} className="gap-2">
                  <MessageCircle className="h-4 w-4" /> Start FAQ-chat
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Link to="/login">
                    <Button className="gap-2">
                      <MessageCircle className="h-4 w-4" /> Log ind for at chatte
                    </Button>
                  </Link>
                  <Link to="/regler">
                    <Button variant="outline">Se regler</Button>
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
