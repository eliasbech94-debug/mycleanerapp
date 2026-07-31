/**
 * Provider onboarding quiz — questions only (no answer keys).
 * The answer key lives server-side in `supabase/functions/_shared/providerQuiz.ts`
 * so the quiz can never be passed by reading the bundle.
 */
export const PROVIDER_QUIZ_KEY = "provider_basics_v1";
export const PROVIDER_QUIZ_PASS_SCORE = 7;

export interface QuizQuestion {
  id: string;
  question: string;
  options: { id: string; label: string }[];
}

export const PROVIDER_QUIZ: QuizQuestion[] = [
  {
    id: "q1",
    question: "Hvornår må du aflyse en booking uden gebyr?",
    options: [
      { id: "a", label: "Mere end 18 timer før start" },
      { id: "b", label: "Når som helst" },
      { id: "c", label: "Kun hvis kunden accepterer" },
    ],
  },
  {
    id: "q2",
    question: "Hvad gør du, hvis du kommer for sent til en booking?",
    options: [
      { id: "a", label: "Skriver til kunden i MyCleaner-chatten med det samme" },
      { id: "b", label: "Siger ingenting og arbejder hurtigere" },
      { id: "c", label: "Aflyser bookingen" },
    ],
  },
  {
    id: "q3",
    question: "Må du aftale betaling uden om MyCleaner?",
    options: [
      { id: "a", label: "Nej, aldrig" },
      { id: "b", label: "Ja, hvis kunden spørger" },
      { id: "c", label: "Ja, ved faste kunder" },
    ],
  },
  {
    id: "q4",
    question: "Hvad gør du, hvis du beskadiger noget hos kunden?",
    options: [
      { id: "a", label: "Rapporterer det straks via appen og kontakter support" },
      { id: "b", label: "Reparerer det selv uden at sige noget" },
      { id: "c", label: "Trækker beløbet fra kundens regning" },
    ],
  },
  {
    id: "q5",
    question: "Hvem har ansvaret for at indberette din indkomst til skat?",
    options: [
      { id: "a", label: "Dig selv som selvstændig" },
      { id: "b", label: "MyCleaner" },
      { id: "c", label: "Kunden" },
    ],
  },
  {
    id: "q6",
    question: "Hvordan behandler du kundens nøgler og adgangskoder?",
    options: [
      { id: "a", label: "Fortroligt og kun til den aftalte opgave" },
      { id: "b", label: "Deler dem med kolleger efter behov" },
      { id: "c", label: "Gemmer dem i en note på telefonen sammen med adressen" },
    ],
  },
  {
    id: "q7",
    question: "Må du tage billeder i kundens hjem og dele dem?",
    options: [
      { id: "a", label: "Kun dokumentation til en sag, aldrig offentligt" },
      { id: "b", label: "Ja, til sociale medier" },
      { id: "c", label: "Ja, hvis der ikke er personer på" },
    ],
  },
  {
    id: "q8",
    question: "Hvad er minimumsprisen på din service bestemt af?",
    options: [
      { id: "a", label: "Landets lovpligtige minimumssats i MyCleaner" },
      { id: "b", label: "Hvad konkurrenterne tager" },
      { id: "c", label: "Kundens budget" },
    ],
  },
];
