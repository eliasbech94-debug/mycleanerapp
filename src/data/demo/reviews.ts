import { DEMO_PROVIDER_FIXTURES } from "./providers";
import { getDemoCustomers } from "./customers";
import { addDays, chance, DEMO_NOW, hashSeed, intBetween, lazy, mulberry32, pick } from "./random";

/** Demo reviews — development / preview only. Pure local fixtures. */
export type DemoReview = {
  id: string;
  provider_slug: string;
  customer_id: string;
  reviewer_name: string;
  reviewer_avatar: string;
  rating: number;
  title: string | null;
  body: string;
  service_type: string;
  booked_at: string;
  created_at: string;
  provider_response: string | null;
  provider_response_at: string | null;
};

const SERVICE_TYPES = [
  "Home Cleaning",
  "Deep Cleaning",
  "Airbnb Cleaning",
  "Move-out Cleaning",
  "Office Cleaning",
  "Window Cleaning",
  "Ironing",
  "After Party Cleaning",
];

const SHORT_5 = [
  "Fantastisk grundig — hjemmet har aldrig set bedre ud.",
  "Super venlig og kom præcis til tiden.",
  "Kan varmt anbefales. Booker helt sikkert igen.",
  "Alt skinnede, da jeg kom hjem. Perfekt.",
  "Hurtig, effektiv og utrolig behagelig at have i hjemmet.",
  "Spotless work and a genuinely lovely person.",
  "Arrived early, finished on time, flawless result.",
  "Best cleaner we have had in three years.",
  "Otroligt noggrann. Köket ser ut som nytt.",
  "Punktlig, trevlig och grundlig — rekommenderas.",
  "Sehr gründlich und absolut zuverlässig.",
  "Pünktlich, freundlich und ein makelloses Ergebnis.",
  "Impecable. La casa quedó como nueva.",
  "Muy profesional y puntual. Repetiremos seguro.",
  "Detaljerne gør forskellen — selv listerne var tørret af.",
  "Vores Airbnb er klar på under to timer hver gang.",
  "Rigtig god kommunikation hele vejen igennem.",
  "Brugte egne miljøvenlige produkter. Meget tilfreds.",
  "Nem booking og et resultat over forventning.",
  "Left the flat smelling amazing. Thank you!",
];

const LONG_5 = [
  "Vi har prøvet fire forskellige rengøringshjælpere det seneste år, og det her er uden sammenligning den bedste oplevelse. Der blev tænkt på detaljer, vi ikke engang selv havde bemærket — fugerne i badeværelset, ovnrillerne og bag sofaen. Kommunikationen op til besøget var hurtig og tydelig, og vi fik besked, da der var fem minutter til ankomst.",
  "Bestilte en hovedrengøring inden vores fraflytning, og jeg var oprigtigt nervøs for afleveringsforretningen. Resultatet var så gennemført, at udlejeren ikke havde en eneste bemærkning, og vi fik hele depositummet retur. Der blev arbejdet systematisk rum for rum, og jeg fik løbende at vide, hvad der manglede.",
  "As an Airbnb host I need turnovers that are fast but never sloppy, and that is exactly what I get here. Photos are sent after every clean, linen is handled without me asking, and I have not had a single cleanliness complaint from a guest in eight months. Worth every krone.",
  "Min mor er 84 og er meget privat omkring sit hjem, så jeg var spændt på, hvordan det ville gå. Der blev taget hensyn hele vejen, forklaret roligt hvad der skulle ske, og hun følte sig helt tryg. Nu ser hun frem til besøget hver anden uge — både for rengøringen og for snakken.",
  "Vi driver et lille kontor med tolv medarbejdere og skiftede til MyCleaner efter et rod med vores gamle leverandør. Forskellen mærkes: mødelokalerne er klar hver morgen, køkkenet er altid tømt, og vi får en kort besked, hvis noget mangler at blive bestilt. Meget professionelt.",
  "Ich hatte eine Grundreinigung nach einer Renovierung gebucht, überall Staub und Farbreste. Nach vier Stunden war die Wohnung wie neu, sogar die Fensterrahmen und Heizkörper. Sehr strukturiert gearbeitet und alles vorher genau abgestimmt.",
];

const FOUR = [
  "Rigtig godt arbejde — kom bare 15 minutter for sent.",
  "Meget tilfreds. Havde ønsket lidt mere fokus på badeværelset.",
  "Great job overall, just missed the inside of the fridge.",
  "God rengøring til prisen. Vi booker igen.",
  "Bra jobbat, men lite stressigt mot slutet.",
  "Solidt stykke arbejde, og en behagelig person at have i huset. Der var et par vindueskarme, som kunne have fået en tur mere, men jeg nævnte det, og det blev noteret til næste gang.",
  "Buen trabajo en general, aunque llegó un poco tarde.",
];

const THREE = [
  "Fint nok, men jeg havde forventet lidt mere for prisen.",
  "Okay rengøring. Nogle områder blev sprunget over.",
  "Decent clean but communication could be better.",
  "Det blev gjort, men ikke helt så grundigt som første gang. Jeg tror, der var afsat for lidt tid til opgaven, så måske skal jeg booke to timer ekstra næste gang.",
];

const RESPONSES = [
  "Tusind tak for de pæne ord — det var en fornøjelse! 😊",
  "Mange tak! Jeg glæder mig til næste besøg.",
  "Thank you so much, see you next time!",
  "Tak for feedbacken — jeg tager fat i badeværelset med ekstra omhu næste gang.",
  "Tack så mycket, vi ses snart igen!",
  "Vielen Dank für das nette Feedback!",
  "Gracias por su confianza, ¡hasta la próxima!",
  "Tak fordi du tog dig tid til at skrive. Det betyder meget for en lille selvstændig som mig.",
];

export const DEMO_REVIEW_COUNT = 300;

export const getDemoReviews = lazy<DemoReview[]>(() => {
  const rng = mulberry32(hashSeed("mycleaner-demo-reviews"));
  const customers = getDemoCustomers();
  const providers = DEMO_PROVIDER_FIXTURES;
  const usedBodies = new Set<string>();
  const rows: DemoReview[] = [];

  const uniqueBody = (base: string, index: number) => {
    if (!usedBodies.has(base)) {
      usedBodies.add(base);
      return base;
    }
    const suffixes = [
      " Booker igen om to uger.",
      " Anbefaler til alle i området.",
      " Femte gang nu — samme høje niveau.",
      " Would book again without hesitation.",
      " Tack igen!",
      " Sehr empfehlenswert.",
      " Repetiremos sin duda.",
      " Helt uden anmærkninger denne gang.",
      " Tredje besøg og stadig imponeret.",
    ];
    const withSuffix = `${base}${suffixes[index % suffixes.length]}`;
    if (!usedBodies.has(withSuffix)) {
      usedBodies.add(withSuffix);
      return withSuffix;
    }
    const fallback = `${base} (${index})`;
    usedBodies.add(fallback);
    return fallback;
  };

  for (let i = 0; i < DEMO_REVIEW_COUNT; i += 1) {
    // Weight reviews toward higher-scoring providers so counts look organic.
    const provider = chance(rng, 0.6)
      ? providers[intBetween(rng, 0, Math.max(0, Math.floor(providers.length / 2) - 1))]
      : pick(rng, providers);
    const customer = pick(rng, customers);

    const roll = rng();
    let rating = 5;
    let body: string;
    if (roll > 0.86) {
      rating = 4;
      body = pick(rng, FOUR);
    } else if (roll > 0.955) {
      rating = 3;
      body = pick(rng, THREE);
    } else if (roll > 0.62) {
      body = pick(rng, LONG_5);
    } else {
      body = pick(rng, SHORT_5);
    }
    if (roll > 0.955) {
      rating = 3;
      body = pick(rng, THREE);
    }

    const bookedAt = addDays(DEMO_NOW, -intBetween(rng, 2, 640));
    const createdAt = addDays(bookedAt, intBetween(rng, 0, 4));
    const hasResponse = chance(rng, 0.45);

    rows.push({
      id: `demo-review-${i + 1}`,
      provider_slug: provider.provider_slug,
      customer_id: customer.id,
      reviewer_name: customer.display_name,
      reviewer_avatar: customer.avatar_url,
      rating,
      title: chance(rng, 0.3) ? pick(rng, ["Super oplevelse", "Kan varmt anbefales", "Helt i top", "Very reliable", "Kommer igen"]) : null,
      body: uniqueBody(body, i),
      service_type: pick(rng, SERVICE_TYPES),
      booked_at: bookedAt.toISOString(),
      created_at: createdAt.toISOString(),
      provider_response: hasResponse ? pick(rng, RESPONSES) : null,
      provider_response_at: hasResponse ? addDays(createdAt, intBetween(rng, 0, 2)).toISOString() : null,
    });
  }

  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
});

export const getDemoReviewsForProvider = (slug: string, limit?: number): DemoReview[] => {
  const rows = getDemoReviews().filter((r) => r.provider_slug === slug);
  return typeof limit === "number" ? rows.slice(0, limit) : rows;
};

export const getRecentDemoReviews = (limit = 8): DemoReview[] => getDemoReviews().slice(0, limit);
