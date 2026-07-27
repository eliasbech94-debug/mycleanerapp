import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ProviderOnboarding from "./ProviderOnboarding";

const C = { ink: "#0a3d3a", orange: "#ff6b35", cream: "#f5f0e0", teal: "#168a7a", mint: "#c8e6c0" };

type Question = {
  question: string;
  answers: string[];
  correct: number;
  critical?: boolean;
  explanation: string;
};

type Test = {
  id: string;
  title: string;
  emoji: string;
  description: string;
  requiredScore: number;
  mandatory?: boolean;
  questions: Question[];
};

const q = (question: string, answers: string[], correct: number, explanation: string, critical = false): Question => ({
  question, answers, correct, explanation, critical,
});

const TESTS: Test[] = [
  {
    id: "general",
    title: "God stil som provider",
    emoji: "🤝",
    description: "Tryghed, kommunikation, skader, ulykker og professionel opførsel.",
    requiredScore: 7,
    mandatory: true,
    questions: [
      q("Opgaven er markant større end beskrevet. Hvad gør du?", ["Jeg går bare i gang", "Jeg kræver kontanter", "Jeg dokumenterer forskellen og får ændringen godkendt i MyCleaner", "Jeg går uden at sige noget"], 2, "Ekstra tid, pris og omfang skal altid godkendes gennem MyCleaner."),
      q("Du føler dig utryg eller truet på adressen. Hvad gør du?", ["Jeg fortsætter for at undgå en dårlig anmeldelse", "Jeg går til et sikkert sted og kontakter MyCleaner. Ved akut eller livstruende fare ringer jeg 112", "Jeg diskuterer med kunden", "Jeg filmer kunden"], 1, "Din sikkerhed kommer først. Ved akut eller livstruende fare: Ring 112.", true),
      q("Du beskadiger en genstand. Hvad gør du?", ["Skjuler skaden", "Forsøger selv at reparere den", "Stopper, dokumenterer og informerer kunden og MyCleaner", "Siger at skaden allerede var der"], 2, "Ærlig og hurtig dokumentation beskytter både kunden og provideren.", true),
      q("Kunden tilbyder betaling uden om MyCleaner. Hvad gør du?", ["Siger ja", "Siger ja efter første opgave", "Afviser og holder betaling og ændringer på platformen", "Tager kun imod kontanter"], 2, "Betaling og bookingændringer skal blive på platformen."),
      q("Du bliver forsinket. Hvad gør du?", ["Venter til kunden skriver", "Markerer dig som ankommet", "Informerer hurtigt og giver en realistisk ankomsttid", "Annullerer uden besked"], 2, "Tidlig og ærlig kommunikation skaber tryghed."),
      q("Må du dele billeder fra kundens hjem på sociale medier?", ["Ja, uden navn", "Ja, efter opgaven", "Nej. Billeder må kun bruges som nødvendig dokumentation i MyCleaner", "Ja, hvis boligen er flot"], 2, "Kundens privatliv skal altid respekteres."),
      q("Kunden beder om noget farligt, som du ikke er uddannet til. Hvad gør du?", ["Prøver forsigtigt", "Beder kunden hjælpe", "Afviser opgaven og kontakter MyCleaner", "Gør det, hvis kunden accepterer risikoen"], 2, "Du skal aldrig udføre arbejde, du ikke kan udføre sikkert.", true),
      q("Hvad gør du efter en arbejdsulykke, når den akutte situation er håndteret?", ["Fortsætter uden at sige noget", "Sletter dokumentationen", "Dokumenterer og anmelder hændelsen til MyCleaner", "Beder kunden holde det hemmeligt"], 2, "Alle ulykker og nærved-hændelser skal dokumenteres."),
    ],
  },
  {
    id: "standard",
    title: "Standardrengøring",
    emoji: "🧼",
    description: "Løbende vedligeholdelse af hjemmet — rent, roligt og ordentligt.",
    requiredScore: 7,
    questions: [
      q("Hvad er formålet med standardrengøring?", ["At renovere boligen", "At vedligeholde en bolig, der rengøres regelmæssigt", "At fjerne byggestøv", "At udføre flytterengøring"], 1, "Standardrengøring er løbende vedligeholdelse."),
      q("Hvad er normalt ikke automatisk inkluderet?", ["Støvsugning", "Aftørring", "Toiletrengøring", "Indvendig ovnrengøring"], 3, "Ovn, skabe og andre dybdegående opgaver skal vælges særskilt."),
      q("Hvilken rækkefølge er bedst?", ["Gulv først", "Tilfældigt", "Højt mod lavt og rent mod mere beskidt", "Badeværelse før alt andet"], 2, "En fast arbejdsgang mindsker dobbeltarbejde og krydssmitte."),
      q("Må samme klud bruges på toilet og i køkken?", ["Ja, hvis den skylles", "Kun i små hjem", "Nej, brug separate eller farvekodede klude", "Ja, hvis den ser ren ud"], 2, "Toiletområdet skal altid have separate redskaber.", true),
      q("Du kender ikke materialet på bordpladen. Hvad gør du?", ["Bruger kalkfjerner", "Bruger en grov svamp", "Undersøger materialet og tester mildt produkt skjult", "Bruger stærk affedter"], 2, "Ukendte overflader kræver forsigtighed og en skjult test."),
      q("Hvordan doseres rengøringsmidler?", ["Jo mere, jo bedre", "Efter produktets etiket", "Efter duften", "Samme mængde til alt"], 1, "Overdosering giver ikke bedre rengøring og kan skade overflader."),
      q("Tiden er ikke tilstrækkelig. Hvad gør du?", ["Arbejder gratis", "Prioriterer aftalte områder og kontakter kunden i MyCleaner", "Springer noget over uden besked", "Kræver kontanter"], 1, "Kunden skal vide, hvad der kan nås inden for bookingen."),
      q("Hvad hører til slutkontrollen?", ["At alle rum dufter stærkt", "At aftalte områder er rengjort, og redskaber og affald er fjernet", "At alle vinduer står åbne", "At møbler er flyttet"], 1, "Afslut altid med et roligt kvalitetstjek."),
    ],
  },
  {
    id: "deep",
    title: "Hovedrengøring",
    emoji: "✨",
    description: "Detaljer, ophobet snavs og områder, der kræver lidt ekstra kærlighed.",
    requiredScore: 7,
    questions: [
      q("Hvad adskiller hovedrengøring fra standardrengøring?", ["Kun stærkere kemi", "Mere detaljeret arbejde og ophobet snavs", "Altid præcis to timer", "Kun køkken og bad"], 1, "Hovedrengøring går mere i dybden og tager typisk længere tid."),
      q("Må syreholdig kalkfjerner bruges på marmor?", ["Ja", "Kun varmt", "Nej, det kan ætse natursten", "Kun med skuresvamp"], 2, "Marmor, kalksten og terrazzo kan blive permanent beskadiget.", true),
      q("Hvordan håndteres kraftigt køkkenfedt?", ["Bland flere produkter", "Brug egnet affedter efter etiketten og test overfladen", "Skrab med kniv", "Brug klor"], 1, "Brug det rigtige produkt, korrekt dosering og virketid."),
      q("Må grov skuresvamp bruges på krom og højglans?", ["Ja", "Kun våd", "Kun ved hovedrengøring", "Nej, den kan ridse"], 3, "Sarte og blanke flader kræver bløde redskaber."),
      q("Snavset kan ikke fjernes uden risiko for skade. Hvad gør du?", ["Fortsætter", "Bruger ukendt kemi", "Stopper, dokumenterer og informerer kunden", "Dækker området"], 2, "Et ærligt begrænset resultat er bedre end en ødelagt overflade."),
      q("Må rengøringsmidler blandes?", ["Ja ved hovedrengøring", "Ja med kundens tilladelse", "Kun hvis de dufter ens", "Nej"], 3, "Rengøringsmidler må aldrig blandes, medmindre producenten udtrykkeligt foreskriver det.", true),
      q("Du opdager et større område med mulig skimmel. Hvad gør du?", ["Sprøjter klor", "Børster det tørt", "Stopper og kontakter MyCleaner", "Maler over"], 2, "Skimmel kan kræve særlig vurdering, uddannelse og beskyttelse.", true),
      q("Hvordan behandles en malet væg?", ["Grov svamp", "Kalkfjerner", "Mild egnet metode efter aftale og skjult test", "Meget vand"], 2, "Maling kan ændre glans eller farve, så test altid først."),
    ],
  },
  {
    id: "moveout",
    title: "Flytterengøring",
    emoji: "📦",
    description: "Grundig aflevering, tomme skabe og styr på alle de små detaljer.",
    requiredScore: 7,
    questions: [
      q("Hvad kontrollerer du ved ankomst?", ["Kun størrelsen", "Om boligen er tømt, strøm og vand virker, og opgaven matcher", "Salgsprisen", "Kundens nye adresse"], 1, "Start med at sikre, at opgaven faktisk kan udføres som booket."),
      q("Boligen er stadig fuld af møbler. Hvad gør du?", ["Smider ting ud", "Flytter alt", "Dokumenterer og kontakter kunden eller MyCleaner", "Markerer færdig"], 2, "En fyldt bolig kan ændre både tid, pris og resultat."),
      q("Er storskrald automatisk inkluderet?", ["Ja", "Nej, kun hvis bestilt og lovligt håndterbart", "Kun i lejligheder", "Kun udenfor"], 1, "Bortskaffelse skal være aftalt og ske forsvarligt."),
      q("Hvornår rengøres skabe indvendigt?", ["Når de er tømt og inkluderet", "Med tingene i", "Kun ved ekstra tid", "Aldrig"], 0, "Skabe skal være tømt, før indvendig rengøring kan udføres."),
      q("Må du afmontere hårde hvidevarer?", ["Altid", "Kun dele beregnet til almindelig brugerafmontering og når det er sikkert", "Efter en video", "Når kunden er væk"], 1, "Teknisk demontering hører ikke til almindelig flytterengøring."),
      q("En skade var der ved ankomst. Hvad gør du?", ["Ignorerer den", "Dokumenterer før arbejdet", "Skjuler den", "Nævner den kun ved klage"], 1, "Før-billeder forebygger tvivl om eksisterende skader."),
      q("Et vindue kan kun nås ved at stå på en stol. Hvad gør du?", ["Beder kunden holde", "Gør det hurtigt", "Undlader opgaven og dokumenterer manglende sikker adgang", "Stabler stole"], 2, "Arbejde i højden kræver sikker adgang og korrekt udstyr.", true),
      q("Boligen er langt mere beskidt end beskrevet. Hvad gør du?", ["Udfører alt", "Dokumenterer og får ændret omfang, tid eller pris i MyCleaner", "Kræver kontanter", "Går uden besked"], 1, "Store afvigelser skal godkendes før ekstraarbejde."),
    ],
  },
  {
    id: "office",
    title: "Kontorrengøring",
    emoji: "🏢",
    description: "Diskretion, adgangssikkerhed og fokus på arbejdspladsens fællesområder.",
    requiredScore: 7,
    questions: [
      q("Må du flytte dokumenter på et skrivebord?", ["Ja", "Kun hvis de ser uvigtige ud", "Som udgangspunkt nej, medmindre virksomheden har givet instruktion", "Kun fortrolige"], 2, "Rengør omkring dokumenter og respekter arbejdspladsens orden."),
      q("Hvordan rengøres en computerskærm?", ["Spray direkte", "Våd skuresvamp", "Egnet produkt på kluden, ikke direkte på udstyret", "Kalkfjerner"], 2, "Elektronik kræver minimal fugt og et egnet produkt."),
      q("Hvad gør du med fortrolige dokumenter?", ["Læser dem", "Fotograferer dem", "Undgår at læse, fotografere eller flytte dem", "Smider dem ud"], 2, "Fortrolighed er en central del af kontorrengøring.", true),
      q("Hvordan håndteres alarmkoder og adgangskort?", ["Deles med kolleger", "Bruges kun til opgaven og opbevares sikkert", "Gemmes offentligt", "Gives til venner"], 1, "Adgangsoplysninger er fortrolige."),
      q("Må du lukke en ukendt person ind?", ["Ja, hvis personen ser ansat ud", "Ja i arbejdstiden", "Nej, følg virksomhedens adgangsprocedure", "Ja, hvis de kender navnet"], 2, "Du må aldrig omgå kundens adgangssikkerhed.", true),
      q("Hvilke områder kræver ekstra hygiejnefokus?", ["Kun chefens kontor", "Toiletter, køkken, håndtag og fællesområder", "Kun vinduer", "Kun gulve"], 1, "Kontaktpunkter og fællesområder bruges af mange mennesker."),
      q("Der spildes væske tæt på elektrisk udstyr. Hvad gør du?", ["Tørrer med bare hænder", "Hælder vand på", "Stopper, sikrer området og følger sikkerhedsproceduren", "Tænder udstyret"], 2, "Strøm og væske kan være en alvorlig risiko.", true),
      q("Hvad kontrolleres ved afslutning?", ["Kun gulvet", "Døre, vinduer, lys, alarm, nøgler og de aftalte områder", "Kun alarm", "Private ejendele"], 1, "Kontorets lukkeprocedure skal følges præcist."),
    ],
  },
  {
    id: "special",
    title: "Specialrengøring",
    emoji: "🧪",
    description: "Kun for dig, der kender dine grænser og arbejder sikkert med særlige opgaver.",
    requiredScore: 7,
    questions: [
      q("Hvornår skal du afvise en specialopgave?", ["Når den tager over en time", "Når du mangler uddannelse, forsikring, metode eller sikkerhedsudstyr", "Når kunden er væk", "Når adressen er langt væk"], 1, "Specialarbejde kræver dokumenterede kompetencer og korrekt udstyr.", true),
      q("Kan almindelige engangshandsker bruges til alle kemikalier?", ["Ja", "Med to par", "Nej, handsker skal passe til produktet", "Kun ved hovedrengøring"], 2, "Se produktets sikkerhedsoplysninger og vælg korrekt værnemiddel."),
      q("Et produkt mangler etiket. Hvad gør du?", ["Lugter til det", "Tester på gulvet", "Bruger lidt", "Bruger det ikke"], 3, "Ukendte og umærkede produkter må ikke bruges.", true),
      q("Du finder kanyler eller biologisk materiale. Hvad gør du?", ["Samler op med almindelige handsker", "Lægger i husholdningsaffald", "Stopper, holder afstand og kontakter MyCleaner eller specialist", "Skyller ud"], 2, "Det kræver særlig håndtering og må ikke behandles som almindeligt affald.", true),
      q("Du får mistanke om asbest. Hvad gør du?", ["Støvsuger", "Sprøjter vand", "Stopper og undgår at forstyrre materialet", "Tager en prøve"], 2, "Mistænkt asbest må ikke forstyrres.", true),
      q("Hvad er forskellen på rengøring og desinfektion?", ["Ingen", "Rengøring fjerner snavs; desinfektion kræver korrekt produkt og kontakttid", "Desinfektion er parfume", "Rengøring er stærkere"], 1, "Desinfektion virker kun korrekt efter rengøring og med korrekt kontakttid."),
      q("Må du garantere, at alle pletter forsvinder?", ["Ja", "Kun tæpper", "Nej, resultatet afhænger af materiale, alder og tidligere behandling", "Ja med stærk kemi"], 2, "Lov aldrig et resultat, materialet måske ikke kan tåle."),
      q("Må en almindelig stol bruges til arbejde i højden?", ["Ja, hvis kunden holder", "Ja under to meter", "Nej, brug en sikker og godkendt metode", "Kun på tæppe"], 2, "Improviserede løsninger giver unødig faldrisiko.", true),
    ],
  },
];

const EYE_QUESTION = q(
  "Du får rengøringsmiddel i øjnene. Hvad gør du først?",
  ["Lukker øjet og venter", "Tørrer med en tør klud", "Skyller straks grundigt med rigeligt, tempereret vand", "Bruger øjendråber og fortsætter"],
  2,
  "Skyl straks. Fjern kontaktlinser, hvis det kan gøres let, og fortsæt skylningen. Følg etiketten og søg professionel hjælp. Ved akut eller livstruende situation: Ring 112.",
  true,
);

TESTS[0].questions.splice(2, 0, EYE_QUESTION);
TESTS[0].requiredScore = 8;

function storageKey(userId?: string) {
  return `mycleaner-provider-qualification:${userId || "guest"}`;
}

export default function ProviderQualificationGate() {
  const { user } = useAuth();
  const key = storageKey(user?.id);
  const [qualified, setQualified] = useState(() => localStorage.getItem(key) === "passed");
  const [selected, setSelected] = useState<string[]>([]);
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ passed: boolean; score: number } | null>(null);

  const activeTest = useMemo(() => TESTS.find((test) => test.id === activeTestId) || null, [activeTestId]);
  const requiredTests = useMemo(() => ["general", ...selected], [selected]);
  const [passedTests, setPassedTests] = useState<string[]>([]);

  if (qualified) return <ProviderOnboarding />;

  const start = (id: string) => {
    setActiveTestId(id);
    setAnswers({});
    setResult(null);
  };

  const submit = () => {
    if (!activeTest) return;
    const score = activeTest.questions.reduce((sum, question, index) => sum + (answers[index] === question.correct ? 1 : 0), 0);
    const criticalOk = activeTest.questions.every((question, index) => !question.critical || answers[index] === question.correct);
    const passed = score >= activeTest.requiredScore && criticalOk;
    setResult({ passed, score });
    if (passed) setPassedTests((current) => current.includes(activeTest.id) ? current : [...current, activeTest.id]);
  };

  const allPassed = requiredTests.every((id) => passedTests.includes(id));

  if (activeTest) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: C.cream, color: C.ink }}>
        <div className="mx-auto max-w-3xl">
          <button onClick={() => setActiveTestId(null)} className="mb-5 inline-flex items-center gap-2 text-sm font-bold">
            <ChevronLeft className="h-4 w-4" /> Tilbage til dine tests
          </button>
          <section className="rounded-3xl border-2 bg-white p-5 sm:p-8" style={{ borderColor: `${C.ink}22` }}>
            <div className="text-4xl">{activeTest.emoji}</div>
            <h1 className="mt-2 font-display text-3xl">{activeTest.title}</h1>
            <p className="mt-2 text-sm opacity-75">Vælg ét svar per spørgsmål. Sikkerhedsspørgsmål skal altid være rigtige. Du har styr på det 💪</p>

            <div className="mt-7 space-y-7">
              {activeTest.questions.map((question, index) => (
                <fieldset key={question.question} className="rounded-2xl border p-4" style={{ borderColor: `${C.ink}20` }}>
                  <legend className="px-2 font-bold">
                    {index + 1}. {question.question} {question.critical && <span title="Sikkerhedskritisk">🛡️</span>}
                  </legend>
                  <div className="mt-3 grid gap-2">
                    {question.answers.map((answer, answerIndex) => (
                      <label key={answer} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition hover:bg-black/[0.02]">
                        <input type="radio" name={`question-${index}`} checked={answers[index] === answerIndex} onChange={() => setAnswers((current) => ({ ...current, [index]: answerIndex }))} className="mt-1" />
                        <span>{answer}</span>
                      </label>
                    ))}
                  </div>
                  {result && answers[index] !== question.correct && (
                    <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: "#fff1eb" }}>
                      <strong>Den tager vi lige én gang til 🧠</strong><br />{question.explanation}
                    </div>
                  )}
                </fieldset>
              ))}
            </div>

            {result && (
              <div className="mt-7 rounded-2xl p-5" style={{ background: result.passed ? C.mint : "#fff1eb" }}>
                <div className="flex items-center gap-3">
                  {result.passed ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
                  <div>
                    <strong>{result.passed ? "Bestået — flot arbejde! 🎉" : "Ikke helt endnu — men tæt på 💛"}</strong>
                    <p className="text-sm">Du fik {result.score} af {activeTest.questions.length} rigtige. Kravet er {activeTest.requiredScore}, og alle 🛡️-spørgsmål skal være korrekte.</p>
                  </div>
                </div>
              </div>
            )}

            <button onClick={submit} disabled={Object.keys(answers).length !== activeTest.questions.length} className="mt-7 inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs font-black uppercase tracking-[0.16em] disabled:opacity-40" style={{ background: C.orange, color: C.ink }}>
              Tjek mine svar <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: C.cream, color: C.ink }}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full" style={{ background: C.mint }}><ShieldCheck className="h-7 w-7" /></div>
          <p className="mt-4 text-[11px] font-black uppercase tracking-[0.22em]" style={{ color: C.orange }}>MyCleaner Academy</p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl">God rengøring starter med god viden ✨</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm opacity-75">Før din profil bliver synlig, skal du vise, at du kender opgaven, produkterne og de vigtigste sikkerhedsregler. Det er godt for kunden — og mindst lige så godt for dig.</p>
        </header>

        <div className="mb-6 rounded-2xl border-2 bg-white p-5" style={{ borderColor: `${C.orange}55` }}>
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: C.orange }} />
            <div className="text-sm">
              <strong>Sikkerhed først — altid 🛡️</strong>
              <p className="mt-1 opacity-80">Får du produkt i øjnene, så skyl straks grundigt med rigeligt, tempereret vand. Fjern kontaktlinser, hvis det er let, og fortsæt skylningen. Ved akut eller livstruende situation: <strong>Ring 112.</strong></p>
            </div>
          </div>
        </div>

        <section className="rounded-3xl border-2 bg-white p-5 sm:p-7" style={{ borderColor: `${C.ink}22` }}>
          <h2 className="font-display text-2xl">Hvad vil du tilbyde?</h2>
          <p className="mt-1 text-sm opacity-70">Vælg de kategorier, du vil være synlig i. Du kan altid tage flere tests senere.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {TESTS.filter((test) => !test.mandatory).map((test) => {
              const on = selected.includes(test.id);
              return (
                <button key={test.id} onClick={() => setSelected((current) => on ? current.filter((id) => id !== test.id) : [...current, test.id])} className="flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition" style={{ borderColor: on ? C.teal : `${C.ink}22`, background: on ? `${C.mint}66` : "white" }}>
                  <span className="text-2xl">{test.emoji}</span>
                  <span><strong>{test.title}</strong><span className="mt-1 block text-xs opacity-65">{test.description}</span></span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border-2 bg-white p-5 sm:p-7" style={{ borderColor: `${C.ink}22` }}>
          <h2 className="font-display text-2xl">Dine tests</h2>
          <div className="mt-4 space-y-3">
            {TESTS.filter((test) => requiredTests.includes(test.id)).map((test) => {
              const passed = passedTests.includes(test.id);
              return (
                <div key={test.id} className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: `${C.ink}20` }}>
                  <div className="flex items-center gap-3"><span className="text-2xl">{test.emoji}</span><div><strong>{test.title}</strong><div className="text-xs opacity-65">{test.questions.length} spørgsmål · mindst {test.requiredScore} rigtige</div></div></div>
                  <button onClick={() => start(test.id)} className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider" style={{ background: passed ? C.mint : C.ink, color: passed ? C.ink : C.cream }}>
                    {passed ? <CheckCircle2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {passed ? "Bestået" : "Start test"}
                  </button>
                </div>
              );
            })}
          </div>

          <button disabled={!allPassed || selected.length === 0} onClick={() => { localStorage.setItem(key, "passed"); localStorage.setItem(`${key}:categories`, JSON.stringify(selected)); setQualified(true); }} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-xs font-black uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-40" style={{ background: C.orange, color: C.ink }}>
            {!allPassed ? <LockKeyhole className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />} Fortsæt til onboarding
          </button>
          {selected.length === 0 && <p className="mt-2 text-center text-xs opacity-60">Vælg mindst én rengøringskategori for at fortsætte 🧽</p>}
        </section>
      </div>
    </main>
  );
}
