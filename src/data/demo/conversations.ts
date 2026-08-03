import { DEMO_PROVIDER_FIXTURES } from "./providers";
import { getDemoCustomers } from "./customers";
import { addDays, addMinutes, chance, DEMO_NOW, hashSeed, intBetween, lazy, mulberry32, pick } from "./random";

/** Demo conversations — development / preview only. No realtime, no database. */
export type DemoMessage = {
  id: string;
  sender: "customer" | "provider";
  body: string;
  sent_at: string;
  read: boolean;
};

export type DemoConversation = {
  id: string;
  provider_slug: string;
  provider_name: string;
  provider_avatar: string;
  customer_id: string;
  customer_name: string;
  customer_avatar: string;
  subject: string;
  booking_reference: string | null;
  unread_count: number;
  last_message_at: string;
  messages: DemoMessage[];
};

type Turn = { sender: "customer" | "provider"; body: string };

const THREADS: Turn[][] = [
  [
    { sender: "customer", body: "Hej 👋 Glæder mig til i morgen!" },
    { sender: "provider", body: "I lige måde! Vi ses kl. 10:00 😊" },
  ],
  [
    { sender: "customer", body: "Kan du tage miljøvenlige produkter med?" },
    { sender: "provider", body: "Det er ikke noget problem — jeg bruger kun Svanemærkede produkter." },
    { sender: "customer", body: "Perfekt, tusind tak!" },
  ],
  [
    { sender: "customer", body: "Hej, vi har desværre fået håndværkere i køkkenet på fredag. Kan vi rykke til lørdag?" },
    { sender: "provider", body: "Ja, jeg har ledigt lørdag kl. 09:00 eller 13:00. Hvad passer bedst?" },
    { sender: "customer", body: "09:00 er perfekt." },
    { sender: "provider", body: "Så er det flyttet ✅ Vi ses lørdag." },
  ],
  [
    { sender: "provider", body: "Hej! Jeg er på vej og er fremme om ca. 10 minutter." },
    { sender: "customer", body: "Super, nøglen ligger i nøgleboksen — kode 4412." },
  ],
  [
    { sender: "customer", body: "Hi! Could you focus on the bathroom and kitchen this time?" },
    { sender: "provider", body: "Of course, I'll give both an extra deep clean." },
    { sender: "customer", body: "Brilliant, thank you." },
  ],
  [
    { sender: "customer", body: "Vores kat er lidt sky — bare rolig hvis hun gemmer sig under sengen 🐈" },
    { sender: "provider", body: "Haha, jeg lader hende være i fred 😄" },
  ],
  [
    { sender: "provider", body: "Færdig for i dag! Jeg har taget ekstra fat i ovnen — den var godt brugt 😅" },
    { sender: "customer", body: "Wow, det ser fantastisk ud. Tusind tak!" },
    { sender: "provider", body: "Det var så lidt. Vi ses om to uger." },
  ],
  [
    { sender: "customer", body: "Hej, kan du klare en flytterengøring på 95 m² den 30.?" },
    { sender: "provider", body: "Ja. Med vinduer indvendigt regner jeg med ca. 5 timer. Skal jeg sende et tilbud?" },
    { sender: "customer", body: "Ja tak, det lyder fint." },
  ],
  [
    { sender: "customer", body: "Hallo, könnten Sie bitte auch die Fenster innen putzen?" },
    { sender: "provider", body: "Klar, das nehme ich mit auf. Etwa 30 Minuten extra." },
  ],
  [
    { sender: "customer", body: "Hola, ¿puede venir el martes por la mañana?" },
    { sender: "provider", body: "Sí, tengo disponible a las 10:00. ¿Le viene bien?" },
    { sender: "customer", body: "Perfecto, gracias." },
  ],
  [
    { sender: "customer", body: "Hej! Kan du ta med en mopp? Vår gick sönder igår." },
    { sender: "provider", body: "Absolut, jag har med egen utrustning. Inga problem!" },
  ],
  [
    { sender: "customer", body: "Vi har gæster i aften — kan du nå at være færdig inden kl. 16?" },
    { sender: "provider", body: "Ja, jeg starter kl. 13 og er ude senest 15:45 👍" },
    { sender: "customer", body: "Du redder vores dag!" },
  ],
  [
    { sender: "provider", body: "Hej! Jeg kunne se, at opvaskemaskinen stod med rent — jeg har tømt den." },
    { sender: "customer", body: "Det er over forventning. Tak!" },
  ],
  [
    { sender: "customer", body: "Er det muligt at få fast hver anden uge om torsdagen?" },
    { sender: "provider", body: "Ja, torsdag kl. 11 er ledigt fremadrettet. Jeg opretter en gentagende booking." },
    { sender: "customer", body: "Perfekt, tak for hjælpen 😊" },
  ],
  [
    { sender: "customer", body: "Hi, one of the guests left quite a mess. Extra hour possible?" },
    { sender: "provider", body: "No problem, I'll add an hour and update the booking." },
    { sender: "customer", body: "Thanks, you're a lifesaver." },
  ],
];

const SUBJECTS = [
  "Rengøring på torsdag",
  "Flytterengøring",
  "Airbnb turnover",
  "Fast aftale hver 14. dag",
  "Hovedrengøring",
  "Kontorrengøring",
  "Vinduespudsning",
];

export const DEMO_CONVERSATION_COUNT = 200;

export const getDemoConversations = lazy<DemoConversation[]>(() => {
  const rng = mulberry32(hashSeed("mycleaner-demo-conversations"));
  const customers = getDemoCustomers();
  const providers = DEMO_PROVIDER_FIXTURES;
  const rows: DemoConversation[] = [];

  for (let i = 0; i < DEMO_CONVERSATION_COUNT; i += 1) {
    const provider = providers[i % providers.length];
    const customer = pick(rng, customers);
    const thread = THREADS[i % THREADS.length];
    const start = addDays(DEMO_NOW, -intBetween(rng, 0, 120));
    start.setHours(intBetween(rng, 8, 20), intBetween(rng, 0, 59), 0, 0);

    let cursor = start;
    const messages: DemoMessage[] = thread.map((turn, index) => {
      cursor = index === 0 ? cursor : addMinutes(cursor, intBetween(rng, 2, 180));
      return {
        id: `demo-message-${i + 1}-${index + 1}`,
        sender: turn.sender,
        body: turn.body,
        sent_at: cursor.toISOString(),
        read: index < thread.length - 1 || !chance(rng, 0.22),
      };
    });

    const unread = messages.filter((m) => !m.read).length;

    rows.push({
      id: `demo-conversation-${i + 1}`,
      provider_slug: provider.provider_slug,
      provider_name: provider.display_name,
      provider_avatar: provider.avatar_url ?? "",
      customer_id: customer.id,
      customer_name: customer.display_name,
      customer_avatar: customer.avatar_url,
      subject: pick(rng, SUBJECTS),
      booking_reference: chance(rng, 0.7) ? `MC-${intBetween(rng, 100000, 999999)}` : null,
      unread_count: unread,
      last_message_at: messages[messages.length - 1].sent_at,
      messages,
    });
  }

  return rows.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
});

export const getDemoConversationsForProvider = (slug: string) =>
  getDemoConversations().filter((c) => c.provider_slug === slug);

export const getDemoConversationsForCustomer = (customerId: string) =>
  getDemoConversations().filter((c) => c.customer_id === customerId);
