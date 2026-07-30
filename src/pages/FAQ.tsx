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
    q: "Hvordan booker jeg en cleaner?",
    a: "Find en cleaner i marketplace, åbn profilen og vælg en ledig tid direkte i kalenderen. Du sender en booking request, og bookingen er bekræftet, når cleaneren accepterer.",
  },
  {
    q: "Hvad er forskellen på en booking request og en booking?",
    a: "En booking request er din forespørgsel på et bestemt tidspunkt. Når cleaneren accepterer, bliver den til en bekræftet booking med tid, pris og adresse.",
  },
  {
    q: "Kan jeg oprette en fast, gentagende booking?",
    a: "Ja. Vælg recurring booking, når du booker, så gentages opgaven i samme interval. Du kan ændre eller stoppe den fra Mine bookinger.",
  },
  {
    q: "Hvornår trækkes betalingen?",
    a: "Beløbet reserveres, når bookingen bekræftes, og hæves først, når opgaven er markeret som udført.",
  },
  {
    q: "Hvad koster det at bruge MyCleaner?",
    a: "Platformsgebyret er 28% og deles ligeligt: 14% lægges oveni kundens pris, og 14% trækkes fra cleanerens udbetaling. Du ser altid totalprisen, før du bekræfter.",
  },
  {
    q: "Hvad er Provider Score?",
    a: "Provider Score er et samlet mål for en cleaners kvalitet — baseret på anmeldelser, svartid, gennemførte bookinger og verifikation. Den hjælper dig med at vælge trygt.",
  },
  {
    q: "Hvad er MyCleaner ID?",
    a: "MyCleaner ID er cleanerens verificerede identitet på platformen. Den samler ID-verifikation, gennemførte bookinger og dokumenteret erfaring ét sted.",
  },
  {
    q: "Hvordan bliver cleaners verificeret?",
    a: "Alle cleaners gennemgår ID-verifikation, før de kan modtage bookinger. Verificerede profiler er markeret med badget Verificeret.",
  },
  {
    q: "Hvorfor har nogle profiler en video?",
    a: "Cleaners kan tilføje en kort videopræsentation, så du kan møde personen, før du booker. Videoen gennemgås af MyCleaner, før den bliver synlig.",
  },
  {
    q: "Bruger MyCleaner AI?",
    a: "Vi bruger AI til at foreslå relevante cleaners, hjælpe med prisestimater og besvare almindelige spørgsmål i support. Beslutninger om verifikation, klager og refusion træffes altid af et menneske.",
  },
  {
    q: "Kan jeg se cleanerens kalender, før jeg booker?",
    a: "Ja. Ledige tider vises direkte på profilen, så du kan vælge et tidspunkt, der passer jer begge.",
  },
  {
    q: "Hvordan afbestiller jeg en booking?",
    a: "Gå til Mine bookinger, vælg opgaven og tryk Afbestil. Gebyret afhænger af, hvor tæt på starttidspunktet du afbestiller — se Regler.",
  },
  {
    q: "Hvordan får jeg refusion?",
    a: "Åbn en sag via Support. Vi gennemgår forløbet sammen med dig og refunderer via Stripe, hvis sagen godkendes.",
  },
  {
    q: "Hvornår får jeg som cleaner udbetaling?",
    a: "Udbetalinger sker automatisk via Stripe, når en booking er udført og gennemløbstiden er passeret. Du følger status under Udbetalinger i dit dashboard.",
  },
  {
    q: "Hvad bruger jeg Bilag og regnskab til?",
    a: "Under Regnskab kan du uploade bilag, tilføje ekstern indkomst og hente en månedlig rapport. Det er et hjælpemiddel — ikke en skatteindberetning.",
  },
  {
    q: "Kan jeg få servicefradrag?",
    a: "For rengøring, havearbejde og visse handyman-opgaver i private hjem, ja. Din årlige oversigt findes under Profil → Servicefradrag.",
  },
  {
    q: "Hvordan bliver jeg cleaner på MyCleaner?",
    a: "Vælg Bliv cleaner, gennemfør onboarding og verificér din Stripe-konto. Derefter kan du modtage booking requests.",
  },
  {
    q: "Er mine oplysninger sikre?",
    a: "Ja. Data opbevares krypteret, betalinger håndteres af Stripe, og vi deler aldrig dine oplysninger uden dit samtykke.",
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
